import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Server, Socket } from 'socket.io';
import {
  applyLucky7IfEligible,
  canAnyPawnMove,
  canMovePawn,
  checkCompulsoryCapturePenalties,
  cloneDefaultPlayers,
  COLORED_PATH_START_POS,
  createInitialPawns,
  createInitialPlayerStats,
  evaluateCaptureObligation,
  evaluateRivalryState,
  executePawnMove,
  getMatchLeader,
  getPawnPath,
  getPlayerRankings,
  isLoneTokenOnTrack,
  pickBestAIMove,
  rollDicePair,
  shouldPromptGulChoice,
  type CaptureCandidate,
  type ExtraTurnReason,
  type PawnState,
  type PlayerStats,
  type RankingEntry,
  type RngFn,
} from '../src/game/rules';
import {
  getOrCreatePlayerWallet,
  recordMatchEnd,
  recordMatchStart,
  verifySupabaseToken,
} from './supabaseRecords';

export interface RoomSeat {
  seatIndex: number;
  publicPlayerId: string;
  name: string;
  color: string;
  icon: string;
  tokenHash: string;
  supabaseUserId?: string;
  socketId: string | null;
  connected: boolean;
  ready: boolean;
  isAI: boolean;
  tempBotTakeover?: boolean;
  balance?: number;
  personality: 'Strategist' | 'Confidante' | 'Rival' | 'Rideordie';
  gender: 'male' | 'female';
  wish: [number, number];
  wishUsed: boolean;
  lastChatTime: number;
  lastVoiceTime: number;
  lastWhisperTime: number;
  lastActionTime: number;
}

export interface PendingGulChoice {
  seatIdx: number;
  pawnIdx: number;
  steps: number;
  dieIndex: number | 'combined';
}

export interface AuthoritativeMatchState {
  currentPlayer: number;
  dice: [number, number];
  movesAvailable: number[];
  hasRolled: boolean;
  pawns: PawnState[][];
  playerStats: PlayerStats[];
  extraTurnEarned: boolean;
  extraTurnReason: ExtraTurnReason;
  lucky7UsedThisTurn: boolean;
  turnCapturedPawn: boolean;
  turnStartCaptures: CaptureCandidate[];
  turnRequiredCaptures: 0 | 1 | 2;
  turnCapturesMade: number;
  turnCandidatePawns: number[];
  turnMidTurnMissedCandidates: number[];
  turnCapturingPawns: number[];
  turnSecondsLeft: number;
  turnExpiresAt: number | null;
  turnAutoPlay: boolean;
  pendingGul: PendingGulChoice | null;
  winner: number | null;
  rankings: RankingEntry[];
  lastEventText: string;
}

export interface VoiceParticipant {
  socketId: string;
  seatIndex: number;
  name: string;
  isMuted: boolean;
}

export interface LudoRoom {
  code: string;
  createdAt: number;
  startedAt: number | null;
  lastActivity: number;
  hostSeatIndex: number;
  hostSocketId: string | null;
  started: boolean;
  matchEnded: boolean;
  fillBots: boolean;
  secretWhispers: boolean;
  timerConfig: {
    enabled: boolean;
    duration: 60 | 90 | 120 | 0;
  };
  seats: Record<number, RoomSeat>;
  voiceParticipants: Map<string, VoiceParticipant>;
  match: AuthoritativeMatchState | null;
  actionSeq: number;
  messageCount: number;
  processedActionIds: Map<string, number>;
  disconnectGraceTimers: Map<number, ReturnType<typeof setTimeout>>;
  emptyDeletionTimer: ReturnType<typeof setTimeout> | null;
  aiActionTimer: ReturnType<typeof setTimeout> | null;
  turnPassTimer: ReturnType<typeof setTimeout> | null;
  lastRoutineDialogueAt: number;
  lastDialogueLineIdx: Map<string, number>;
  grudges: Record<number, { attackerIdx: number; turnsLeft: number }>;
  dethroneAlertedSeat: number | null;
}

export interface RoomManagerOptions {
  rng?: RngFn;
  disconnectGraceMs?: number;
  autoPlayRollDelayMs?: number;
  autoPlayMoveDelayMs?: number;
  turnPassDelayMs?: number;
  tickIntervalMs?: number;
}

const MAX_LUDO_ROOMS = 250;
const DEFAULT_DISCONNECT_GRACE_MS = 15_000;
const ACTION_ID_TTL_MS = 120_000;
const MIN_SOCKET_ACTION_GAP_MS = 120;
const AI_DIALOGUE_LINE_COUNT = 5;
const MAX_PUBLIC_VOICE_BYTES = 80_000;
const MAX_WHISPER_VOICE_BYTES = 60_000;

const RESERVED_NAMES = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'sysadmin',
  'host',
  'moderator',
  'mod',
  'ludo_master',
  'official',
  'support',
  'staff',
  'server',
  'nexusplay',
  'bot',
  'ai',
  'superuser',
]);

interface IpTracking {
  creations: number[];
  joins: number[];
  lookups: number[];
  failedJoins: number[];
  lastSeen: number;
  blockedUntil: number;
}

const DEFAULT_CRYPTO_RNG: RngFn = () => crypto.randomInt(0, 1_000_000) / 1_000_000;

export class RoomManager {
  private io: Server;
  private rooms = new Map<string, LudoRoom>();
  private ipRateLimits = new Map<string, IpTracking>();
  private guestIdLimits = new Map<string, number[]>();
  private profanityWords: string[] = [];
  private recordsConfig = {
    matchDurationMinSeconds: 120,
    minHumanPlayers: 2,
    maxCapturesPerSeat: 60,
    maxRecordedMatchesPerIpPerDay: 30,
    maxRecordedMatchesPerTokenPerDay: 10,
  };
  private rootDir: string;
  private rng: RngFn;
  private disconnectGraceMs: number;
  private autoPlayRollDelayMs: number;
  private autoPlayMoveDelayMs: number;
  private turnPassDelayMs: number;
  private tickIntervalId: ReturnType<typeof setInterval>;
  private cleanupIntervalId: ReturnType<typeof setInterval>;

  constructor(io: Server, rootDir: string, options: RoomManagerOptions = {}) {
    this.io = io;
    this.rootDir = rootDir;
    this.rng = options.rng || DEFAULT_CRYPTO_RNG;
    this.disconnectGraceMs = options.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;
    this.autoPlayRollDelayMs = options.autoPlayRollDelayMs ?? 1150;
    this.autoPlayMoveDelayMs = options.autoPlayMoveDelayMs ?? 700;
    this.turnPassDelayMs = options.turnPassDelayMs ?? 1250;
    this.loadConfigs();

    const tickMs = options.tickIntervalMs ?? 1000;
    this.tickIntervalId = setInterval(() => this.tickTimers(), tickMs);
    this.cleanupIntervalId = setInterval(() => this.cleanupStaleState(), 60_000);
  }

  public dispose(): void {
    clearInterval(this.tickIntervalId);
    clearInterval(this.cleanupIntervalId);
    for (const room of this.rooms.values()) {
      this.clearRoomTimers(room);
      if (room.emptyDeletionTimer) clearTimeout(room.emptyDeletionTimer);
      for (const timer of room.disconnectGraceTimers.values()) clearTimeout(timer);
      room.disconnectGraceTimers.clear();
    }
    this.rooms.clear();
  }

  private loadConfigs(): void {
    try {
      const cfgPath = path.join(this.rootDir, 'records-config.json');
      if (fs.existsSync(cfgPath)) {
        Object.assign(this.recordsConfig, JSON.parse(fs.readFileSync(cfgPath, 'utf8')));
      }
    } catch {}

    try {
      const wordsPath = path.join(this.rootDir, 'profanity-words.json');
      if (fs.existsSync(wordsPath)) {
        const parsed = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
        if (Array.isArray(parsed.words)) {
          this.profanityWords = parsed.words.filter((w: unknown) => typeof w === 'string' && w.trim());
        }
      }
    } catch {}
  }

  public getRoomSummary(code: string) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return null;
    return this.getSanitizedRoomState(room);
  }

  public getInternalRoomForTest(code: string): LudoRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  private getClientIp(socket: Socket): string {
    const fwd = socket.handshake.headers['x-forwarded-for'];
    if (typeof fwd === 'string') return fwd.split(',')[0].trim();
    return socket.handshake.address || '127.0.0.1';
  }

  private getIpData(ip: string): IpTracking {
    let data = this.ipRateLimits.get(ip);
    if (!data) {
      data = {
        creations: [],
        joins: [],
        lookups: [],
        failedJoins: [],
        lastSeen: Date.now(),
        blockedUntil: 0,
      };
      this.ipRateLimits.set(ip, data);
    }
    data.lastSeen = Date.now();
    return data;
  }

  private cleanTimestamps(arr: number[], windowMs: number): void {
    const cutoff = Date.now() - windowMs;
    while (arr.length > 0 && arr[0] < cutoff) arr.shift();
  }

  private checkGuestIdRateLimit(ip: string): boolean {
    const now = Date.now();
    const list = (this.guestIdLimits.get(ip) || []).filter((ts) => now - ts < 5 * 60_000);
    if (list.length >= 20) {
      this.guestIdLimits.set(ip, list);
      return false;
    }
    list.push(now);
    this.guestIdLimits.set(ip, list);
    return true;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 20; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) code += chars[crypto.randomInt(0, chars.length)];
      if (!this.rooms.has(code)) return code;
    }
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  private formatDisplayName(rawName: unknown): { name?: string; error?: string } {
    let name = (typeof rawName === 'string' ? rawName : '').trim().slice(0, 24).trim();
    if (!name) name = 'Player';
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (RESERVED_NAMES.has(normalized)) {
      return { error: 'Display name is reserved. Please choose another name.' };
    }
    const list = this.profanityWords.length > 0 ? this.profanityWords : ['fuck', 'shit', 'bitch', 'chutiya', 'harami'];
    for (const word of list) {
      try {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        name = name.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '***');
      } catch {}
    }
    return { name };
  }

  private sanitizeWish(wish: unknown): [number, number] {
    if (!Array.isArray(wish) || wish.length < 2) return [6, 5];
    const w1 = Math.min(6, Math.max(1, Math.round(Number(wish[0]) || 6)));
    let w2 = Math.min(6, Math.max(1, Math.round(Number(wish[1]) || 5)));
    if (w1 === 6 && w2 === 6) w2 = 5;
    return [w1, w2];
  }

  private sanitizeTimerConfig(raw: unknown): { enabled: boolean; duration: 60 | 90 | 120 | 0 } {
    const r = (raw || {}) as { enabled?: boolean; duration?: number };
    const dur = Number(r.duration);
    if (dur === 0 || r.enabled === false) return { enabled: false, duration: 0 };
    if (dur === 60 || dur === 90 || dur === 120) return { enabled: true, duration: dur };
    return { enabled: true, duration: 90 };
  }

  private resetTurnExpiry(room: LudoRoom): void {
    if (!room.match) return;
    room.match.turnAutoPlay = false;
    if (room.timerConfig.enabled && room.timerConfig.duration > 0) {
      room.match.turnSecondsLeft = room.timerConfig.duration;
      room.match.turnExpiresAt = Date.now() + room.timerConfig.duration * 1000;
    } else {
      room.match.turnSecondsLeft = 0;
      room.match.turnExpiresAt = null;
    }
  }

  private isDuplicateAction(room: LudoRoom, rawActionId: unknown): boolean {
    if (typeof rawActionId !== 'string' || !rawActionId.trim()) return false;
    const actionId = rawActionId.trim().slice(0, 64);
    const now = Date.now();
    for (const [id, ts] of room.processedActionIds.entries()) {
      if (now - ts > ACTION_ID_TTL_MS) room.processedActionIds.delete(id);
    }
    if (room.processedActionIds.has(actionId)) {
      return true;
    }
    room.processedActionIds.set(actionId, now);
    if (room.processedActionIds.size > 200) {
      const oldest = room.processedActionIds.keys().next().value;
      if (oldest) room.processedActionIds.delete(oldest);
    }
    return false;
  }

  public getSanitizedRoomState(room: LudoRoom) {
    const defaults = cloneDefaultPlayers();
    const seatsOut: Record<
      number,
      Omit<RoomSeat, 'tokenHash' | 'supabaseUserId' | 'socketId' | 'lastActionTime'>
    > = {};
    for (let i = 0; i < 5; i++) {
      const s = room.seats[i];
      if (s) {
        const {
          tokenHash: _th,
          supabaseUserId: _uid,
          socketId: _sid,
          lastActionTime: _lat,
          ...pub
        } = s;
        seatsOut[i] = pub;
      } else {
        seatsOut[i] = {
          seatIndex: i,
          publicPlayerId: `bot_${i}`,
          name: defaults[i].name,
          color: defaults[i].color,
          icon: ['🤴', '👑', '💎', '🔥', '🏆'][i],
          connected: false,
          ready: room.fillBots,
          isAI: true,
          tempBotTakeover: false,
          balance: 5,
          personality: defaults[i].personality,
          gender: defaults[i].gender,
          wish: [6, 5],
          wishUsed: false,
          lastChatTime: 0,
          lastVoiceTime: 0,
          lastWhisperTime: 0,
        };
      }
    }

    return {
      code: room.code,
      hostSeatIndex: room.hostSeatIndex,
      started: room.started,
      matchEnded: room.matchEnded,
      fillBots: room.fillBots,
      secretWhispers: room.secretWhispers,
      timerConfig: room.timerConfig,
      seats: seatsOut,
      voiceParticipants: this.getVoiceParticipantsList(room),
      match: room.match,
      actionSeq: room.actionSeq,
      serverTime: Date.now(),
      messageCount: room.messageCount,
    };
  }

  private getVoiceParticipantsList(room: LudoRoom): VoiceParticipant[] {
    return Array.from(room.voiceParticipants.values()).sort((a, b) => a.seatIndex - b.seatIndex);
  }

  private broadcastVoiceParticipants(room: LudoRoom): void {
    this.io.to(`ludo:${room.code}`).emit('voice:participants', {
      participants: this.getVoiceParticipantsList(room),
    });
  }

  private findActiveRoomPeer(room: LudoRoom, targetSocketId: unknown): RoomSeat | null {
    if (typeof targetSocketId !== 'string' || !targetSocketId.trim()) return null;
    return (
      Object.values(room.seats).find(
        (s) => s && !s.isAI && s.connected && s.socketId === targetSocketId,
      ) || null
    );
  }

  private broadcastRoom(room: LudoRoom): void {
    room.actionSeq++;
    const state = this.getSanitizedRoomState(room);
    this.io.to(`ludo:${room.code}`).emit('ludo:room_updated', state);
    if (room.started && room.match) {
      this.io.to(`ludo:${room.code}`).emit('ludo:state_sync', {
        matchState: room.match,
        seats: state.seats,
        timerConfig: room.timerConfig,
        hostSeatIndex: room.hostSeatIndex,
        actionSeq: state.actionSeq,
        serverTime: state.serverTime,
        messageCount: ++room.messageCount,
      });
    }
  }

  private verifySender(socket: Socket, payloadToken?: string) {
    const roomCode = socket.data.ludoRoomCode as string | undefined;
    if (!roomCode) return null;
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    const seatIdx = socket.data.ludoSeat as number | undefined;
    if (typeof seatIdx !== 'number') return null;
    const seat = room.seats[seatIdx];
    if (!seat) return null;
    const tok = payloadToken || (socket.data.ludoToken as string | undefined);
    if (!tok || seat.tokenHash !== this.hashToken(tok)) return null;
    return { room, seat, seatIdx };
  }

  private clearRoomTimers(room: LudoRoom): void {
    if (room.aiActionTimer) {
      clearTimeout(room.aiActionTimer);
      room.aiActionTimer = null;
    }
    if (room.turnPassTimer) {
      clearTimeout(room.turnPassTimer);
      room.turnPassTimer = null;
    }
  }

  private scheduleNextAIAction(room: LudoRoom): void {
    if (!room.started || room.matchEnded || !room.match) return;
    const m = room.match;
    const expectedSeat = m.currentPlayer;
    const seat = room.seats[expectedSeat];
    if (!seat || (!seat.isAI && !seat.tempBotTakeover)) return;

    const roomCode = room.code;
    this.clearRoomTimers(room);
    if (!m.hasRolled) {
      room.aiActionTimer = setTimeout(() => {
        const activeRoom = this.rooms.get(roomCode);
        if (!activeRoom || !activeRoom.started || activeRoom.matchEnded || !activeRoom.match) return;
        if (activeRoom.match.currentPlayer !== expectedSeat || activeRoom.match.hasRolled) return;
        this.performAuthoritativeRoll(activeRoom, expectedSeat, false);
      }, 1320);
    } else if (m.movesAvailable.length > 0) {
      room.aiActionTimer = setTimeout(() => {
        const activeRoom = this.rooms.get(roomCode);
        if (!activeRoom || !activeRoom.started || activeRoom.matchEnded || !activeRoom.match) return;
        const am = activeRoom.match;
        if (am.currentPlayer !== expectedSeat || !am.hasRolled) return;
        const { move } = pickBestAIMove(am.pawns, expectedSeat, am.movesAvailable, am.dice, {
          personality: activeRoom.seats[expectedSeat]?.personality,
          grudgeTargetIdx: activeRoom.grudges[expectedSeat]?.attackerIdx ?? null,
        });
        if (!move) {
          this.advanceTurn(activeRoom);
          return;
        }
        this.performAuthoritativeMove(activeRoom, expectedSeat, move.pawnIdx, move.steps, move.dieIdx, true);
      }, 1250);
    }
  }

  private scheduleAutoPlayMove(room: LudoRoom, expectedSeatIdx: number, delayMs: number): void {
    if (!room.started || room.matchEnded || !room.match) return;
    const roomCode = room.code;
    this.clearRoomTimers(room);
    room.aiActionTimer = setTimeout(() => {
      const activeRoom = this.rooms.get(roomCode);
      if (!activeRoom || !activeRoom.started || activeRoom.matchEnded || !activeRoom.match) return;
      const m = activeRoom.match;
      if (m.currentPlayer !== expectedSeatIdx || !m.hasRolled || !m.turnAutoPlay) return;
      const { move } = pickBestAIMove(m.pawns, expectedSeatIdx, m.movesAvailable, m.dice, {
        personality: activeRoom.seats[expectedSeatIdx]?.personality,
        grudgeTargetIdx: activeRoom.grudges[expectedSeatIdx]?.attackerIdx ?? null,
      });
      if (!move) {
        this.advanceTurn(activeRoom);
        return;
      }
      this.performAuthoritativeMove(activeRoom, expectedSeatIdx, move.pawnIdx, move.steps, move.dieIdx, true);
    }, delayMs);
  }

  private handleTurnTimeout(room: LudoRoom): void {
    const m = room.match;
    if (!m || !room.started || room.matchEnded || m.turnAutoPlay) return;

    const seatIdx = m.currentPlayer;
    const seat = room.seats[seatIdx];
    const seatName = seat?.name || `Player ${seatIdx + 1}`;

    // Engage auto-play lock & clear turnExpiresAt so tickTimers() won't re-trigger on this turn
    m.turnAutoPlay = true;
    m.turnSecondsLeft = 0;
    m.turnExpiresAt = null;
    this.clearRoomTimers(room);

    // Case 1: Pending Gul prompt timed out -> auto-resolve as PASS (never auto-Gul)
    if (m.pendingGul) {
      this.performAuthoritativePassGul(room, true);
      return;
    }

    // Case 2: Timed out before rolling -> perform authoritative roll & schedule paced AI moves
    if (!m.hasRolled) {
      m.lastEventText = `⏱️ ${seatName} timed out — auto-rolling...`;
      this.performAuthoritativeRoll(room, seatIdx, false);
      return;
    }

    // Case 3: Timed out after rolling with legal moves remaining -> schedule AI auto-play
    const hasLegal =
      m.movesAvailable.length > 0 && canAnyPawnMove(m.pawns, seatIdx, m.movesAvailable, m.dice);
    if (hasLegal) {
      m.lastEventText = `⏱️ ${seatName} timed out — auto-playing remaining move(s)...`;
      this.broadcastRoom(room);
      this.scheduleAutoPlayMove(room, seatIdx, Math.min(250, this.autoPlayMoveDelayMs));
      return;
    }

    // Case 4: Already rolled and no legal moves remain -> advance turn cleanly
    this.advanceTurn(room);
  }

  private performAuthoritativeRoll(room: LudoRoom, seatIdx: number, useWish: boolean): void {
    const m = room.match;
    if (!m || room.matchEnded || m.currentPlayer !== seatIdx || m.hasRolled || m.pendingGul) return;

    const seat = room.seats[seatIdx];
    let [d1, d2] = rollDicePair(this.rng);

    if (useWish && seat && !seat.wishUsed && !seat.isAI && !seat.tempBotTakeover && !m.turnAutoPlay) {
      const [w1, w2] = this.sanitizeWish(seat.wish);
      d1 = w1;
      d2 = w2;
      seat.wishUsed = true;
    }

    m.dice = [d1, d2];
    m.lucky7UsedThisTurn = false;
    m.turnCapturedPawn = false;
    m.extraTurnEarned = d1 === 6 && d2 === 6;
    m.extraTurnReason = d1 === 6 && d2 === 6 ? 'double6' : null;

    const lucky7 = applyLucky7IfEligible(m.pawns, seatIdx, m.dice, false);
    if (lucky7.applied) {
      m.dice = lucky7.dice;
      m.lucky7UsedThisTurn = true;
      m.extraTurnEarned = true;
      m.extraTurnReason = 'lucky7';
    }

    m.movesAvailable = [m.dice[0], m.dice[1]];
    m.hasRolled = true;
    const ob = evaluateCaptureObligation(m.pawns, seatIdx, m.movesAvailable, m.dice);
    m.turnStartCaptures = [...ob.singleCaptures, ...ob.combinedCaptures];
    m.turnRequiredCaptures = ob.requiredCaptures;
    m.turnCapturesMade = 0;
    m.turnCandidatePawns = ob.candidatePawns;
    m.turnMidTurnMissedCandidates = [];
    m.turnCapturingPawns = [];
    const autoPrefix = m.turnAutoPlay ? '⏱️ Auto-play: ' : '';
    m.lastEventText = lucky7.applied
      ? `${autoPrefix}✨ ${seat?.name || 'Player'} triggered Lucky 7 -> 6 + 6!`
      : d1 === 6 && d2 === 6
        ? `${autoPrefix}🔥 ${seat?.name || 'Player'} rolled Double 6!`
        : `${autoPrefix}${seat?.name || 'Player'} rolled ${m.dice[0]} & ${m.dice[1]}`;

    const rollSeq = room.actionSeq + 1;
    this.io.to(`ludo:${room.code}`).emit('ludo:dice_roll', {
      dice: m.dice,
      player: seatIdx,
      isLucky7: lucky7.applied,
      isAutoPlay: m.turnAutoPlay,
      usedWish: useWish && !!seat?.wishUsed,
      actionSeq: rollSeq,
      serverTime: Date.now(),
      messageCount: ++room.messageCount,
    });

    if (seat?.isAI || seat?.tempBotTakeover) {
      const rollEvent = lucky7.applied
        ? 'lucky7'
        : m.dice[0] === 6 && m.dice[1] === 6
          ? 'lucky_roll'
          : 'roll';
      this.emitAiDialogue(room, seatIdx, rollEvent);
    }

    this.broadcastRoom(room);

    const roomCode = room.code;
    if (!canAnyPawnMove(m.pawns, seatIdx, m.movesAvailable, m.dice)) {
      m.lastEventText = `${autoPrefix}${seat?.name || 'Player'}: No usable moves!`;
      this.broadcastRoom(room);
      this.clearRoomTimers(room);
      const noMovesDelay = m.turnAutoPlay ? this.autoPlayRollDelayMs : Math.max(900, this.turnPassDelayMs);
      room.turnPassTimer = setTimeout(() => {
        const activeRoom = this.rooms.get(roomCode);
        if (!activeRoom || !activeRoom.started || activeRoom.matchEnded) return;
        this.advanceTurn(activeRoom);
      }, noMovesDelay);
    } else if (m.turnAutoPlay) {
      this.scheduleAutoPlayMove(room, seatIdx, this.autoPlayRollDelayMs);
    } else if (seat?.isAI || seat?.tempBotTakeover) {
      this.scheduleNextAIAction(room);
    }
  }

  private performAuthoritativeMove(
    room: LudoRoom,
    seatIdx: number,
    pawnIdx: number,
    steps: number,
    dieIndex: number | 'combined',
    autoConfirmGul: boolean,
  ): void {
    const m = room.match;
    if (!m || room.matchEnded || m.currentPlayer !== seatIdx || !m.hasRolled) return;

    const isLone = isLoneTokenOnTrack(m.pawns, seatIdx);
    const totalAvail = m.movesAvailable.reduce((a, b) => a + Number(b), 0);
    let actualDieIndex: number | 'combined' = dieIndex;
    let actualSteps = Number(steps);

    if (dieIndex === 'combined') {
      if (!isLone || m.movesAvailable.length < 2 || actualSteps !== totalAvail) return;
    } else {
      const idx = Number(dieIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= m.movesAvailable.length) {
        const foundIdx = m.movesAvailable.findIndex((v) => v === actualSteps);
        if (foundIdx === -1) return;
        actualDieIndex = foundIdx;
      } else {
        actualDieIndex = idx;
        actualSteps = m.movesAvailable[idx];
      }
    }

    if (!canMovePawn(m.pawns, seatIdx, pawnIdx, actualSteps, m.dice, m.movesAvailable)) return;

    const currPawn = m.pawns[seatIdx][pawnIdx];
    const destPos = currPawn.status === 'home' ? 0 : currPawn.pos + actualSteps;
    const path = getPawnPath(seatIdx);
    const isEnteringGul = destPos === path.length - 1;
    const seat = room.seats[seatIdx];

    if (
      isEnteringGul &&
      seat &&
      !seat.isAI &&
      shouldPromptGulChoice(m.pawns, seatIdx, actualSteps, actualDieIndex, m.dice)
    ) {
      if (m.turnAutoPlay || seat.tempBotTakeover) {
        m.pendingGul = { seatIdx, pawnIdx, steps: actualSteps, dieIndex: actualDieIndex };
        this.performAuthoritativePassGul(room, true);
        return;
      }
      if (!autoConfirmGul) {
        m.pendingGul = { seatIdx, pawnIdx, steps: actualSteps, dieIndex: actualDieIndex };
        if (seat.socketId) {
          this.io.to(seat.socketId).emit('ludo:gul_prompt', m.pendingGul);
        }
        this.broadcastRoom(room);
        return;
      }
    }

    const startPos = currPawn.pos;
    const preRivalry = evaluateRivalryState(m.pawns, -1);
    const preTargetLeader =
      preRivalry.leaderIdx !== -1 && preRivalry.leaderIdx !== seatIdx
        ? preRivalry.leaderIdx
        : getMatchLeader(m.pawns, seatIdx).leaderIdx;
    const preGrudgeTarget = room.grudges[seatIdx]?.attackerIdx ?? -1;

    const outcome = executePawnMove(
      m.pawns,
      m.playerStats,
      seatIdx,
      pawnIdx,
      actualSteps,
      m.dice,
      m.movesAvailable,
    );
    if (!outcome.moved) return;

    if (outcome.reachedCenterHome) {
      m.extraTurnEarned = true;
      m.extraTurnReason = 'home';
      m.lastEventText = `🌟 ${seat?.name || 'Player'} reached Centre Home! Bonus Turn!`;
      if (seat?.isAI || seat?.tempBotTakeover) {
        this.emitAiDialogue(room, seatIdx, 'pawn_home');
      }
    } else if (startPos >= 0 && startPos < COLORED_PATH_START_POS && m.pawns[seatIdx][pawnIdx].pos >= COLORED_PATH_START_POS) {
      if (seat?.isAI || seat?.tempBotTakeover) {
        this.emitAiDialogue(room, seatIdx, 'home_stretch');
      }
    }

    if (outcome.capturedVictims.length > 0) {
      m.extraTurnEarned = true;
      m.extraTurnReason = 'capture';
      m.turnCapturedPawn = true;
      m.turnCapturesMade = (m.turnCapturesMade || 0) + 1;
      if (!m.turnCapturingPawns.includes(pawnIdx)) m.turnCapturingPawns.push(pawnIdx);
      const victimSeatIdx = outcome.capturedVictims[0].playerIdx;
      const victimSeat = room.seats[victimSeatIdx];
      const victimName = victimSeat?.name || 'Rival';

      room.grudges[victimSeatIdx] = { attackerIdx: seatIdx, turnsLeft: 6 };
      const hitGrudge = outcome.capturedVictims.some((v) => v.playerIdx === preGrudgeTarget);
      if (hitGrudge) {
        delete room.grudges[seatIdx];
      }

      const hitLeader =
        preTargetLeader !== -1 &&
        preRivalry.leaderPct >= 30 &&
        outcome.capturedVictims.some((v) => v.playerIdx === preTargetLeader);

      if (hitLeader) {
        const leaderName = room.seats[preTargetLeader]?.name || victimName;
        m.lastEventText = `🎯 ${seat?.name || 'Player'} dethroned leader ${leaderName}! Bonus Roll!`;
        const cheerActor =
          seat?.isAI || seat?.tempBotTakeover
            ? seatIdx
            : Object.values(room.seats).find((s) => s && (s.isAI || s.tempBotTakeover) && s.seatIndex !== preTargetLeader)?.seatIndex ?? -1;
        if (cheerActor !== -1) {
          this.io.to(`ludo:${room.code}`).emit('ludo:rivalry_event', {
            kind: 'leader_hit',
            actorSeat: cheerActor,
            targetSeat: preTargetLeader,
            leaderPct: preRivalry.leaderPct,
            seedIdx: Math.floor(this.rng() * 10),
          });
        }
      } else {
        m.lastEventText = `⚔️ ${seat?.name || 'Player'} captured ${victimName}! Bonus Roll!`;
        if (hitGrudge && (seat?.isAI || seat?.tempBotTakeover)) {
          this.io.to(`ludo:${room.code}`).emit('ludo:rivalry_event', {
            kind: 'grudge_hit',
            actorSeat: seatIdx,
            targetSeat: preGrudgeTarget,
            seedIdx: Math.floor(this.rng() * 10),
          });
        } else if (seat?.isAI || seat?.tempBotTakeover) {
          this.emitAiDialogue(room, seatIdx, 'capture');
        }
      }
      if (victimSeat?.isAI || victimSeat?.tempBotTakeover) {
        this.emitAiDialogue(room, victimSeatIdx, 'captured');
      }
    }

    const postRivalry = evaluateRivalryState(m.pawns, -1);
    if (
      !outcome.wonMatch &&
      postRivalry.tier === 'dethrone' &&
      postRivalry.leaderIdx !== -1 &&
      room.dethroneAlertedSeat !== postRivalry.leaderIdx
    ) {
      room.dethroneAlertedSeat = postRivalry.leaderIdx;
      const herald = Object.values(room.seats).find(
        (s) => s && (s.isAI || s.tempBotTakeover) && s.seatIndex !== postRivalry.leaderIdx,
      );
      if (herald) {
        this.io.to(`ludo:${room.code}`).emit('ludo:rivalry_event', {
          kind: 'dethrone_alert',
          actorSeat: herald.seatIndex,
          targetSeat: postRivalry.leaderIdx,
          leaderPct: postRivalry.leaderPct,
          seedIdx: Math.floor(this.rng() * 10),
        });
      }
    }

    if (actualDieIndex === 'combined') {
      m.movesAvailable = [];
    } else {
      m.movesAvailable.splice(actualDieIndex, 1);
    }

    if (outcome.wonMatch) {
      this.concludeMatch(room, seatIdx);
      return;
    }

    const canMoveRemaining = m.movesAvailable.length > 0 && canAnyPawnMove(m.pawns, seatIdx, m.movesAvailable, m.dice);
    const roomCode = room.code;
    if (!canMoveRemaining) {
      const penalizedPawns = checkCompulsoryCapturePenalties(
        m.pawns,
        m.playerStats,
        seatIdx,
        m.turnRequiredCaptures,
        m.turnCapturesMade,
        m.turnCandidatePawns,
        m.turnMidTurnMissedCandidates,
        m.turnCapturingPawns,
      );
      if (penalizedPawns.length > 0) {
        m.lastEventText =
          penalizedPawns.length > 1
            ? `⚠️ ${seat?.name || 'Player'} missed a compulsory capture — ${penalizedPawns.length} tokens sent back to base!`
            : `⚠️ ${seat?.name || 'Player'} missed a compulsory capture — token sent back to base!`;
        if (seat?.isAI || seat?.tempBotTakeover) {
          this.emitAiDialogue(room, seatIdx, 'penalty');
        }
      }
      m.movesAvailable = [];
      this.broadcastRoom(room);
      this.clearRoomTimers(room);
      const passDelay = m.turnAutoPlay ? Math.min(this.turnPassDelayMs, 650) : this.turnPassDelayMs;
      room.turnPassTimer = setTimeout(() => {
        const activeRoom = this.rooms.get(roomCode);
        if (!activeRoom || !activeRoom.started || activeRoom.matchEnded) return;
        this.advanceTurn(activeRoom);
      }, passDelay);
    } else {
      const nextOb = evaluateCaptureObligation(m.pawns, seatIdx, m.movesAvailable, m.dice);
      const moreCaps = [...nextOb.singleCaptures, ...nextOb.combinedCaptures];
      for (const rc of moreCaps) {
        if (!m.turnStartCaptures.some((c) => c.pawnIdx === rc.pawnIdx)) {
          m.turnStartCaptures.push(rc);
        }
      }
      if (m.turnCapturesMade === 0 && nextOb.requiredCaptures > 0) {
        m.turnRequiredCaptures = Math.max(m.turnRequiredCaptures, nextOb.requiredCaptures) as 0 | 1 | 2;
        for (const cp of nextOb.candidatePawns) {
          if (!m.turnCandidatePawns.includes(cp)) m.turnCandidatePawns.push(cp);
        }
      } else if (m.turnCapturesMade > 0 && nextOb.requiredCaptures > 0) {
        m.turnRequiredCaptures = Math.max(
          m.turnRequiredCaptures,
          m.turnCapturesMade + nextOb.requiredCaptures,
        ) as 0 | 1 | 2;
        m.turnMidTurnMissedCandidates = Array.from(
          new Set([...m.turnMidTurnMissedCandidates, ...nextOb.candidatePawns]),
        );
      }
      this.broadcastRoom(room);
      if (m.turnAutoPlay) {
        this.scheduleAutoPlayMove(room, seatIdx, this.autoPlayMoveDelayMs);
      } else if (seat?.isAI || seat?.tempBotTakeover) {
        this.scheduleNextAIAction(room);
      }
    }
  }

  private performAuthoritativePassGul(room: LudoRoom, isAuto = false): void {
    const m = room.match;
    if (!m || !m.pendingGul) return;
    const { seatIdx, dieIndex } = m.pendingGul;
    m.pendingGul = null;

    if (dieIndex === 'combined') {
      m.movesAvailable = [];
    } else if (typeof dieIndex === 'number' && dieIndex >= 0 && dieIndex < m.movesAvailable.length) {
      m.movesAvailable.splice(dieIndex, 1);
    }

    const seat = room.seats[seatIdx];
    const seatName = seat?.name || 'Player';
    m.lastEventText = isAuto
      ? `⏱️ ${seatName} timed out — auto-passed Gul entry!`
      : `${seatName} passed the Gul entry.`;
    const canMoveRemaining = m.movesAvailable.length > 0 && canAnyPawnMove(m.pawns, seatIdx, m.movesAvailable, m.dice);

    if (!canMoveRemaining) {
      const penalizedPawns = checkCompulsoryCapturePenalties(
        m.pawns,
        m.playerStats,
        seatIdx,
        m.turnRequiredCaptures,
        m.turnCapturesMade,
        m.turnCandidatePawns,
        m.turnMidTurnMissedCandidates,
        m.turnCapturingPawns,
      );
      if (penalizedPawns.length > 0) {
        m.lastEventText =
          penalizedPawns.length > 1
            ? `⚠️ ${seatName} missed a compulsory capture — ${penalizedPawns.length} tokens sent back to base!`
            : `⚠️ ${seatName} missed a compulsory capture — token sent back to base!`;
        if (seat?.isAI || seat?.tempBotTakeover) {
          this.emitAiDialogue(room, seatIdx, 'penalty');
        }
      }
      m.movesAvailable = [];
      this.broadcastRoom(room);
      this.clearRoomTimers(room);
      const roomCode = room.code;
      room.turnPassTimer = setTimeout(() => {
        const activeRoom = this.rooms.get(roomCode);
        if (!activeRoom || !activeRoom.started || activeRoom.matchEnded) return;
        this.advanceTurn(activeRoom);
      }, this.turnPassDelayMs);
    } else {
      this.broadcastRoom(room);
      if (m.turnAutoPlay) {
        this.scheduleAutoPlayMove(room, seatIdx, Math.min(250, this.autoPlayMoveDelayMs));
      } else if (seat?.isAI || seat?.tempBotTakeover) {
        this.scheduleNextAIAction(room);
      }
    }
  }

  private advanceTurn(room: LudoRoom): void {
    const m = room.match;
    if (!m || room.matchEnded) return;
    this.clearRoomTimers(room);

    const keepSame = m.extraTurnEarned;
    if (!keepSame) {
      m.currentPlayer = (m.currentPlayer + 1) % 5;
    }

    for (const key of Object.keys(room.grudges)) {
      const seatKey = Number(key);
      const g = room.grudges[seatKey];
      if (!g || g.turnsLeft <= 1) delete room.grudges[seatKey];
      else g.turnsLeft -= 1;
    }

    m.hasRolled = false;
    m.movesAvailable = [];
    m.extraTurnEarned = false;
    m.extraTurnReason = null;
    m.lucky7UsedThisTurn = false;
    m.turnCapturedPawn = false;
    m.turnStartCaptures = [];
    m.turnRequiredCaptures = 0;
    m.turnCapturesMade = 0;
    m.turnCandidatePawns = [];
    m.turnMidTurnMissedCandidates = [];
    m.turnCapturingPawns = [];
    m.pendingGul = null;
    m.turnAutoPlay = false;
    this.resetTurnExpiry(room);

    const nextSeat = room.seats[m.currentPlayer];
    m.lastEventText = keepSame
      ? `🎲 ${nextSeat?.name || 'Player'} gets a Bonus Turn!`
      : `${nextSeat?.name || 'Player'}'s turn!`;

    this.broadcastRoom(room);

    if (nextSeat?.isAI || nextSeat?.tempBotTakeover) {
      this.emitAiDialogue(room, m.currentPlayer, 'turn');
      this.scheduleNextAIAction(room);
    }
  }

  private concludeMatch(room: LudoRoom, winnerIdx: number): void {
    const m = room.match;
    if (!m || room.matchEnded) return;
    this.clearRoomTimers(room);
    room.matchEnded = true;
    m.winner = winnerIdx;
    m.movesAvailable = [];
    m.pendingGul = null;
    m.turnExpiresAt = null;
    m.turnAutoPlay = false;

    const seatArr = Array.from({ length: 5 }, (_, i) => ({
      name: room.seats[i]?.name || `Player ${i + 1}`,
      color: room.seats[i]?.color || '#00d4ff',
    }));

    const rankings = getPlayerRankings(m.pawns, seatArr, m.playerStats, winnerIdx);
    m.rankings = rankings;
    m.lastEventText = `🏆 ${seatArr[winnerIdx].name} WINS!`;

    if (room.voiceParticipants.size > 0) {
      room.voiceParticipants.clear();
      this.broadcastVoiceParticipants(room);
    }

    this.broadcastRoom(room);
    const winSeat = room.seats[winnerIdx];
    if (winSeat?.isAI || winSeat?.tempBotTakeover) {
      this.emitAiDialogue(room, winnerIdx, 'win');
    }
    this.io.to(`ludo:${room.code}`).emit('ludo:match_ended', {
      winner: winnerIdx,
      rankings,
      actionSeq: room.actionSeq,
      serverTime: Date.now(),
      messageCount: ++room.messageCount,
    });

    const humanCount = Object.values(room.seats).filter((s) => s && !s.isAI).length;
    const durationSec = room.startedAt ? Math.floor((Date.now() - room.startedAt) / 1000) : 0;

    if (
      humanCount >= this.recordsConfig.minHumanPlayers &&
      durationSec >= this.recordsConfig.matchDurationMinSeconds
    ) {
      recordMatchEnd({
        roomCode: room.code,
        winnerSeatIdx: winnerIdx,
        rankings: rankings.map((r) => ({
          seat: r.seat,
          rank: r.rank,
          percentage: r.percentage,
          captures_made: r.captures_made,
          times_captured: r.times_captured,
          penalties: r.penalties,
        })),
        seats: room.seats,
      });
    } else {
      console.log(
        `[SupabaseRecords] Match ${room.code} concluded locally (humans=${humanCount}, duration=${durationSec}s); skipped persistence per hardening rules.`,
      );
    }
  }

  private tickTimers(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (!room.started || room.matchEnded || !room.match) continue;
      if (!room.timerConfig.enabled || room.timerConfig.duration <= 0) continue;
      if (!room.match.turnExpiresAt || room.match.turnAutoPlay) continue;

      const remaining = Math.max(0, Math.ceil((room.match.turnExpiresAt - now) / 1000));
      room.match.turnSecondsLeft = remaining;
      if (now >= room.match.turnExpiresAt) {
        this.handleTurnTimeout(room);
      }
    }
  }

  private cleanupStaleState(): void {
    const now = Date.now();
    const roomCutoff = now - 45 * 60_000;
    for (const [code, room] of this.rooms.entries()) {
      if (room.lastActivity < roomCutoff) {
        this.clearRoomTimers(room);
        for (const t of room.disconnectGraceTimers.values()) clearTimeout(t);
        room.disconnectGraceTimers.clear();
        this.rooms.delete(code);
      }
    }

    const rateCutoff = now - 10 * 60_000;
    for (const [ip, data] of this.ipRateLimits.entries()) {
      if (data.lastSeen < rateCutoff && data.blockedUntil < now) {
        this.ipRateLimits.delete(ip);
      }
    }
    for (const [ip, timestamps] of this.guestIdLimits.entries()) {
      const active = timestamps.filter((ts) => now - ts < 5 * 60_000);
      if (active.length === 0) this.guestIdLimits.delete(ip);
      else this.guestIdLimits.set(ip, active);
    }
  }

  private handleGraceExpiry(room: LudoRoom, seatIdx: number): void {
    room.disconnectGraceTimers.delete(seatIdx);
    const seat = room.seats[seatIdx];
    if (!seat || seat.connected || seat.isAI) return;

    if (room.started && !room.matchEnded) {
      // Activate temporary bot takeover so disconnected seats never deadlock (even when timer is Off)
      seat.tempBotTakeover = true;
      seat.isAI = true;
      if (room.match) {
        room.match.lastEventText = `🤖 ${seat.name} disconnected — Bot covering until they reconnect.`;
        if (room.match.pendingGul && room.match.pendingGul.seatIdx === seatIdx) {
          this.performAuthoritativePassGul(room, true);
          return;
        } else if (room.match.currentPlayer === seatIdx && !room.match.turnAutoPlay) {
          this.scheduleNextAIAction(room);
        }
      }
      this.broadcastRoom(room);
    } else if (!room.started && seatIdx === room.hostSeatIndex) {
      // Transfer lobby host authority to first connected human guest
      const replacement = Object.values(room.seats).find(
        (s) => s && !s.isAI && s.connected && s.seatIndex !== seatIdx,
      );
      if (replacement) {
        room.hostSeatIndex = replacement.seatIndex;
        room.hostSocketId = replacement.socketId;
        this.broadcastRoom(room);
      }
    }
  }

  public attachSocketHandlers(socket: Socket): void {
    let socketCreatedRoom: string | null = null;

    socket.on('ludo:create_room', (payload, callback) => {
      try {
        const ip = this.getClientIp(socket);
        const ipData = this.getIpData(ip);
        const now = Date.now();
        if (now < ipData.blockedUntil) {
          return callback?.({ success: false, error: 'Temporarily blocked. Please wait.' });
        }

        this.cleanTimestamps(ipData.creations, 60_000);
        if (ipData.creations.length >= 6) {
          return callback?.({ success: false, error: 'Room creation rate limit exceeded. Wait a minute.' });
        }
        if (socketCreatedRoom && this.rooms.has(socketCreatedRoom)) {
          return callback?.({ success: false, error: 'You already have an active room.' });
        }
        if (this.rooms.size >= MAX_LUDO_ROOMS || !this.checkGuestIdRateLimit(ip)) {
          return callback?.({ success: false, error: 'Server busy. Please try again shortly.' });
        }

        ipData.creations.push(now);
        const code = this.generateRoomCode();
        const hostPublicId = `g_${crypto.randomBytes(4).toString('hex')}`;
        const hostSecretToken = crypto.randomBytes(24).toString('hex');

        const nameRes = this.formatDisplayName(payload?.hostName);
        if (nameRes.error) return callback?.({ success: false, error: nameRes.error });

        const defaults = cloneDefaultPlayers();
        const wish = this.sanitizeWish(payload?.wish);
        const timerConfig = this.sanitizeTimerConfig(payload?.timerConfig);
        const fillBots = payload?.fillBots !== undefined ? !!payload.fillBots : true;
        const secretWhispers = !!payload?.secretWhispers;

        const room: LudoRoom = {
          code,
          createdAt: now,
          startedAt: null,
          lastActivity: now,
          hostSeatIndex: 0,
          hostSocketId: socket.id,
          started: false,
          matchEnded: false,
          fillBots,
          secretWhispers,
          timerConfig,
          match: null,
          actionSeq: 1,
          messageCount: 0,
          processedActionIds: new Map(),
          disconnectGraceTimers: new Map(),
          emptyDeletionTimer: null,
          aiActionTimer: null,
          turnPassTimer: null,
          lastRoutineDialogueAt: 0,
          lastDialogueLineIdx: new Map(),
          grudges: {},
          dethroneAlertedSeat: null,
          voiceParticipants: new Map(),
          seats: {
            0: {
              seatIndex: 0,
              publicPlayerId: hostPublicId,
              name: nameRes.name!,
              color: defaults[0].color,
              icon: '🤴',
              tokenHash: this.hashToken(hostSecretToken),
              socketId: socket.id,
              connected: true,
              ready: true,
              isAI: false,
              tempBotTakeover: false,
              balance: 5,
              personality: defaults[0].personality,
              gender: 'male',
              wish,
              wishUsed: false,
              lastChatTime: 0,
              lastVoiceTime: 0,
              lastWhisperTime: 0,
              lastActionTime: 0,
            },
          },
        };

        this.rooms.set(code, room);
        socketCreatedRoom = code;

        if (payload?.supabaseToken) {
          verifySupabaseToken(payload.supabaseToken)
            .then(async (u) => {
              if (u && room.seats[0]) {
                room.seats[0].supabaseUserId = u.id;
                const wallet = await getOrCreatePlayerWallet(u.id, room.seats[0].name);
                if (room.seats[0]) room.seats[0].balance = wallet.balance;
              }
            })
            .catch(() => {});
        }

        socket.data.ludoRoomCode = code;
        socket.data.ludoSeat = 0;
        socket.data.ludoToken = hostSecretToken;
        socket.join(`ludo:${code}`);

        callback?.({
          success: true,
          roomCode: code,
          seatIndex: 0,
          playerToken: hostSecretToken,
          publicPlayerId: hostPublicId,
          roomState: this.getSanitizedRoomState(room),
        });
      } catch {
        callback?.({ success: false, error: 'Failed to create room.' });
      }
    });

    socket.on('ludo:join_room', (payload, callback) => {
      try {
        const ip = this.getClientIp(socket);
        const ipData = this.getIpData(ip);
        const now = Date.now();
        if (now < ipData.blockedUntil) {
          return callback?.({ success: false, error: 'Room not found or full' });
        }
        this.cleanTimestamps(ipData.joins, 60_000);
        if (ipData.joins.length >= 12) {
          return callback?.({ success: false, error: 'Too many join attempts.' });
        }
        ipData.joins.push(now);

        const rawCode = typeof payload?.roomCode === 'string' ? payload.roomCode.trim().toUpperCase() : '';
        const room = this.rooms.get(rawCode);
        if (!room || room.started) {
          return callback?.({ success: false, error: 'Room not found or already started' });
        }
        if (room.emptyDeletionTimer) {
          clearTimeout(room.emptyDeletionTimer);
          room.emptyDeletionTimer = null;
        }

        const existingSeatIdx =
          socket.data.ludoRoomCode === room.code && typeof socket.data.ludoSeat === 'number'
            ? socket.data.ludoSeat
            : -1;
        const existingSeat = existingSeatIdx >= 0 ? room.seats[existingSeatIdx] : undefined;
        if (existingSeat && existingSeat.socketId === socket.id && !existingSeat.isAI) {
          return callback?.({
            success: true,
            roomCode: room.code,
            seatIndex: existingSeatIdx,
            playerToken: typeof socket.data.ludoToken === 'string' ? socket.data.ludoToken : '',
            publicPlayerId: existingSeat.publicPlayerId,
            roomState: this.getSanitizedRoomState(room),
          });
        }

        let claimedSlot = -1;
        for (let s = 1; s < 5; s++) {
          if (!room.seats[s] || room.seats[s].isAI) {
            claimedSlot = s;
            break;
          }
        }
        if (claimedSlot === -1) {
          return callback?.({ success: false, error: 'Room is full' });
        }

        const nameRes = this.formatDisplayName(payload?.playerName);
        if (nameRes.error) return callback?.({ success: false, error: nameRes.error });

        const defaults = cloneDefaultPlayers();
        const guestPublicId = `g_${crypto.randomBytes(4).toString('hex')}`;
        const guestSecretToken = crypto.randomBytes(24).toString('hex');

        const rawGuestName = nameRes.name!;
        const existingNames = new Set(
          Object.values(room.seats)
            .filter((s) => s && !s.isAI)
            .map((s) => s.name.toLowerCase()),
        );
        let finalGuestName = rawGuestName;
        if (existingNames.has(finalGuestName.toLowerCase())) {
          let suffix = 2;
          while (existingNames.has(`${rawGuestName} (${suffix})`.toLowerCase())) {
            suffix++;
          }
          finalGuestName = `${rawGuestName} (${suffix})`;
        }

        room.seats[claimedSlot] = {
          seatIndex: claimedSlot,
          publicPlayerId: guestPublicId,
          name: finalGuestName,
          color: defaults[claimedSlot].color,
          icon: ['🤴', '👑', '💎', '🔥', '🏆'][claimedSlot],
          tokenHash: this.hashToken(guestSecretToken),
          socketId: socket.id,
          connected: true,
          ready: false,
          isAI: false,
          tempBotTakeover: false,
          balance: 5,
          personality: defaults[claimedSlot].personality,
          gender: defaults[claimedSlot].gender,
          wish: this.sanitizeWish(payload?.wish),
          wishUsed: false,
          lastChatTime: 0,
          lastVoiceTime: 0,
          lastWhisperTime: 0,
          lastActionTime: 0,
        };

        room.lastActivity = now;
        socket.data.ludoRoomCode = room.code;
        socket.data.ludoSeat = claimedSlot;
        socket.data.ludoToken = guestSecretToken;
        socket.join(`ludo:${room.code}`);

        if (payload?.supabaseToken) {
          verifySupabaseToken(payload.supabaseToken)
            .then(async (u) => {
              if (u && room.seats[claimedSlot]) {
                room.seats[claimedSlot].supabaseUserId = u.id;
                const wallet = await getOrCreatePlayerWallet(u.id, room.seats[claimedSlot].name);
                if (room.seats[claimedSlot]) room.seats[claimedSlot].balance = wallet.balance;
              }
            })
            .catch(() => {});
        }

        room.actionSeq++;
        const sanitized = this.getSanitizedRoomState(room);
        this.io.to(`ludo:${room.code}`).emit('ludo:room_updated', sanitized);

        callback?.({
          success: true,
          roomCode: room.code,
          seatIndex: claimedSlot,
          playerToken: guestSecretToken,
          publicPlayerId: guestPublicId,
          roomState: sanitized,
        });
      } catch {
        callback?.({ success: false, error: 'Join failed.' });
      }
    });

    socket.on('ludo:reconnect', (payload, callback) => {
      try {
        const code = String(payload?.roomCode || '').trim().toUpperCase();
        const seatIdx = Number(payload?.seatIndex);
        const token = String(payload?.playerToken || '');
        const room = this.rooms.get(code);
        const seat = room?.seats[seatIdx];
        if (!room || !seat || seat.tokenHash !== this.hashToken(token)) {
          return callback?.({ success: false, error: 'Seat reconnect failed' });
        }

        const graceTimer = room.disconnectGraceTimers.get(seatIdx);
        if (graceTimer) {
          clearTimeout(graceTimer);
          room.disconnectGraceTimers.delete(seatIdx);
        }

        seat.socketId = socket.id;
        seat.connected = true;
        if (seat.tempBotTakeover) {
          seat.tempBotTakeover = false;
          seat.isAI = false;
          if (room.match) {
            room.match.lastEventText = `👋 ${seat.name} reconnected & resumed control!`;
          }
        }
        if (seatIdx === 0 || seatIdx === room.hostSeatIndex) {
          room.hostSeatIndex = seatIdx;
          room.hostSocketId = socket.id;
        }
        if (room.emptyDeletionTimer) {
          clearTimeout(room.emptyDeletionTimer);
          room.emptyDeletionTimer = null;
        }
        room.lastActivity = Date.now();
        socket.data.ludoRoomCode = code;
        socket.data.ludoSeat = seatIdx;
        socket.data.ludoToken = token;
        socket.join(`ludo:${code}`);

        // Remove any stale voice participant entry bound to this seat's previous socket
        let removedStaleVoice = false;
        for (const [sid, vp] of room.voiceParticipants.entries()) {
          if (vp.seatIndex === seatIdx && sid !== socket.id) {
            room.voiceParticipants.delete(sid);
            removedStaleVoice = true;
          }
        }
        if (removedStaleVoice) {
          this.broadcastVoiceParticipants(room);
        }

        this.broadcastRoom(room);
        callback?.({
          success: true,
          roomCode: code,
          seatIndex: seatIdx,
          roomState: this.getSanitizedRoomState(room),
        });
      } catch {
        callback?.({ success: false, error: 'Reconnect failed' });
      }
    });

    socket.on('ludo:toggle_ready', (payload) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || auth.room.started) return;
      auth.seat.ready = !auth.seat.ready;
      auth.room.lastActivity = Date.now();
      this.broadcastRoom(auth.room);
    });

    socket.on('ludo:toggle_fill_bots', (payload) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || auth.seatIdx !== auth.room.hostSeatIndex || auth.room.started) return;
      auth.room.fillBots = typeof payload?.fillBots === 'boolean' ? payload.fillBots : !auth.room.fillBots;
      auth.room.lastActivity = Date.now();
      this.broadcastRoom(auth.room);
    });

    socket.on('ludo:toggle_secret_whispers', (payload) => {
      const auth = this.verifySender(socket, payload?.token || payload?.sessionToken);
      if (!auth || auth.seatIdx !== auth.room.hostSeatIndex) return;
      auth.room.secretWhispers =
        typeof payload?.secretWhispers === 'boolean'
          ? payload.secretWhispers
          : !auth.room.secretWhispers;
      auth.room.lastActivity = Date.now();
      this.io.to(`ludo:${auth.room.code}`).emit('ludo:secret_whispers_changed', {
        secretWhispers: auth.room.secretWhispers,
      });
      this.broadcastRoom(auth.room);
    });

    socket.on('ludo:update_timer', (payload) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || auth.seatIdx !== auth.room.hostSeatIndex || auth.room.started) return;
      auth.room.timerConfig = this.sanitizeTimerConfig(payload?.timerConfig);
      auth.room.lastActivity = Date.now();
      this.broadcastRoom(auth.room);
    });

    socket.on('ludo:update_wish', (payload) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || auth.room.started) return;
      auth.seat.wish = this.sanitizeWish(payload?.wish);
      auth.room.lastActivity = Date.now();
      this.broadcastRoom(auth.room);
    });

    socket.on('ludo:update_name', (payload, callback) => {
      const auth = this.verifySender(socket, payload?.token || payload?.sessionToken);
      if (!auth || auth.room.started) {
        return callback?.({ success: false, error: 'Cannot change name after match starts' });
      }
      const nameRes = this.formatDisplayName(payload?.playerName);
      if (nameRes.error) {
        return callback?.({ success: false, error: nameRes.error });
      }
      const rawName = nameRes.name!;
      const existingNames = new Set(
        Object.values(auth.room.seats)
          .filter((s) => s && !s.isAI && s.seatIndex !== auth.seatIdx)
          .map((s) => s.name.toLowerCase()),
      );
      let finalName = rawName;
      if (existingNames.has(finalName.toLowerCase())) {
        let suffix = 2;
        while (existingNames.has(`${rawName} (${suffix})`.toLowerCase())) {
          suffix++;
        }
        finalName = `${rawName} (${suffix})`;
      }
      auth.seat.name = finalName;
      auth.room.lastActivity = Date.now();
      this.broadcastRoom(auth.room);
      callback?.({ success: true, name: finalName });
    });

    socket.on('ludo:start_match', (payload, callback) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || auth.seatIdx !== auth.room.hostSeatIndex || auth.room.started) {
        return callback?.({ success: false, error: 'Only host can start before match begins' });
      }
      const { room } = auth;
      const defaults = cloneDefaultPlayers();

      for (let i = 0; i < 5; i++) {
        if (!room.seats[i]) {
          room.seats[i] = {
            seatIndex: i,
            publicPlayerId: `bot_${i}`,
            name: defaults[i].name,
            color: defaults[i].color,
            icon: ['🤴', '👑', '💎', '🔥', '🏆'][i],
            tokenHash: '',
            socketId: null,
            connected: false,
            ready: true,
            isAI: true,
            tempBotTakeover: false,
            balance: 5,
            personality: defaults[i].personality,
            gender: defaults[i].gender,
            wish: [6, 5],
            wishUsed: false,
            lastChatTime: 0,
            lastVoiceTime: 0,
            lastWhisperTime: 0,
            lastActionTime: 0,
          };
        } else {
          room.seats[i].wishUsed = false;
        }
      }

      room.started = true;
      room.matchEnded = false;
      room.grudges = {};
      room.dethroneAlertedSeat = null;
      room.startedAt = Date.now();
      room.lastActivity = Date.now();
      const firstPlayerIdx = room.hostSeatIndex;
      room.match = {
        currentPlayer: firstPlayerIdx,
        dice: [1, 6],
        movesAvailable: [],
        hasRolled: false,
        pawns: createInitialPawns(),
        playerStats: createInitialPlayerStats(),
        extraTurnEarned: false,
        extraTurnReason: null,
        lucky7UsedThisTurn: false,
        turnCapturedPawn: false,
        turnStartCaptures: [],
        turnRequiredCaptures: 0,
        turnCapturesMade: 0,
        turnCandidatePawns: [],
        turnMidTurnMissedCandidates: [],
        turnCapturingPawns: [],
        turnSecondsLeft: room.timerConfig.enabled ? room.timerConfig.duration : 0,
        turnExpiresAt:
          room.timerConfig.enabled && room.timerConfig.duration > 0
            ? Date.now() + room.timerConfig.duration * 1000
            : null,
        turnAutoPlay: false,
        pendingGul: null,
        winner: null,
        rankings: [],
        lastEventText: `Match started! ${room.seats[firstPlayerIdx].name}'s turn to roll.`,
      };

      recordMatchStart({ roomCode: room.code, seats: room.seats });
      room.actionSeq++;
      const state = this.getSanitizedRoomState(room);
      this.io.to(`ludo:${room.code}`).emit('ludo:match_started', {
        seats: state.seats,
        matchState: room.match,
        timerConfig: room.timerConfig,
        hostSeatIndex: room.hostSeatIndex,
        actionSeq: state.actionSeq,
        serverTime: state.serverTime,
        messageCount: ++room.messageCount,
      });

      if (room.seats[firstPlayerIdx]?.isAI || room.seats[firstPlayerIdx]?.tempBotTakeover) {
        this.scheduleNextAIAction(room);
      }
      callback?.({ success: true });
    });

    socket.on('ludo:roll_dice', (payload, callback) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || !auth.room.started || auth.room.matchEnded) {
        return callback?.({ success: false, error: 'Match is not active' });
      }
      if (auth.room.match?.turnAutoPlay) {
        const err = 'Turn timed out, auto-playing';
        socket.emit('ludo:action_rejected', { action: 'roll_dice', error: err });
        return callback?.({ success: false, error: err });
      }
      const now = Date.now();
      if (now - auth.seat.lastActionTime < MIN_SOCKET_ACTION_GAP_MS) {
        return callback?.({ success: false, error: 'Action too fast' });
      }
      if (this.isDuplicateAction(auth.room, payload?.clientActionId)) {
        return callback?.({ success: false, error: 'Duplicate action' });
      }
      auth.seat.lastActionTime = now;
      auth.room.lastActivity = now;
      this.performAuthoritativeRoll(auth.room, auth.seatIdx, !!payload?.useWish);
      callback?.({ success: true });
    });

    socket.on('ludo:move_pawn', (payload, callback) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || !auth.room.started || auth.room.matchEnded) {
        return callback?.({ success: false, error: 'Match is not active' });
      }
      if (auth.room.match?.turnAutoPlay) {
        const err = 'Turn timed out, auto-playing';
        socket.emit('ludo:action_rejected', { action: 'move_pawn', error: err });
        return callback?.({ success: false, error: err });
      }
      const now = Date.now();
      if (now - auth.seat.lastActionTime < MIN_SOCKET_ACTION_GAP_MS) {
        return callback?.({ success: false, error: 'Action too fast' });
      }
      if (this.isDuplicateAction(auth.room, payload?.clientActionId)) {
        return callback?.({ success: false, error: 'Duplicate action' });
      }
      const pawnIdx = Number(payload?.pawnIdx);
      const steps = Number(payload?.steps);
      const dieIndex = payload?.dieIndex === 'combined' ? 'combined' : Number(payload?.dieIndex);
      if (!Number.isInteger(pawnIdx) || pawnIdx < 0 || pawnIdx > 3) {
        return callback?.({ success: false, error: 'Invalid pawn index' });
      }
      auth.seat.lastActionTime = now;
      auth.room.lastActivity = now;
      this.performAuthoritativeMove(auth.room, auth.seatIdx, pawnIdx, steps, dieIndex, false);
      callback?.({ success: true });
    });

    socket.on('ludo:gul_choice', (payload, callback) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || !auth.room.started || auth.room.matchEnded) {
        return callback?.({ success: false, error: 'Match is not active' });
      }
      if (auth.room.match?.turnAutoPlay) {
        const err = 'Turn timed out, auto-playing';
        socket.emit('ludo:action_rejected', { action: 'gul_choice', error: err });
        return callback?.({ success: false, error: err });
      }
      if (!auth.room.match?.pendingGul) {
        return callback?.({ success: false, error: 'No pending Gul choice' });
      }
      if (this.isDuplicateAction(auth.room, payload?.clientActionId)) {
        return callback?.({ success: false, error: 'Duplicate action' });
      }
      const pending = auth.room.match.pendingGul;
      if (pending.seatIdx !== auth.seatIdx) {
        return callback?.({ success: false, error: 'Not your Gul choice' });
      }

      auth.room.lastActivity = Date.now();
      if (payload?.choice === 'pass') {
        this.performAuthoritativePassGul(auth.room);
      } else {
        auth.room.match.pendingGul = null;
        this.performAuthoritativeMove(
          auth.room,
          pending.seatIdx,
          pending.pawnIdx,
          pending.steps,
          pending.dieIndex,
          true,
        );
      }
      callback?.({ success: true });
    });

    socket.on('ludo:chat', (payload) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || typeof payload?.text !== 'string') return;
      const now = Date.now();
      if (now - auth.seat.lastChatTime < 800) return;
      auth.seat.lastChatTime = now;
      const cleanText = payload.text.replace(/[<>]/g, '').trim().slice(0, 120);
      if (!cleanText) return;
      auth.room.lastActivity = now;
      this.io.to(`ludo:${auth.room.code}`).emit('ludo:chat', {
        sender: auth.seat.name,
        text: cleanText,
        seatIndex: auth.seatIdx,
        timestamp: now,
        messageCount: ++auth.room.messageCount,
      });
    });

    socket.on('ludo:reaction', (payload) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || typeof payload?.emoji !== 'string') return;
      const now = Date.now();
      if (now - auth.seat.lastActionTime < 250) return;
      auth.seat.lastActionTime = now;
      this.io.to(`ludo:${auth.room.code}`).emit('ludo:reaction', {
        seatIndex: auth.seatIdx,
        emoji: payload.emoji.slice(0, 8),
      });
    });

    socket.on('ludo:voice', (payload, callback) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || auth.seat.isAI || auth.seat.socketId !== socket.id) {
        return callback?.({ success: false, error: 'Cannot send voice note right now' });
      }
      const now = Date.now();
      if (now - auth.seat.lastVoiceTime < 2500) {
        return callback?.({ success: false, error: 'Wait a moment before sending another voice note' });
      }
      const audioBuf = this.extractBinaryAudio(payload?.audio);
      if (!audioBuf || audioBuf.byteLength < 32) {
        return callback?.({ success: false, error: 'Invalid voice note audio format' });
      }
      if (audioBuf.byteLength > MAX_PUBLIC_VOICE_BYTES) {
        return callback?.({ success: false, error: 'Voice note too large (max 6.5s)' });
      }
      const mimeType = this.sanitizeAudioMimeType(payload?.mimeType, payload?.audio);
      const duration = this.estimateAudioDurationSeconds(audioBuf.byteLength, 7, audioBuf);
      auth.seat.lastVoiceTime = now;
      auth.room.lastActivity = now;
      this.io.to(`ludo:${auth.room.code}`).emit('ludo:voice', {
        sender: auth.seat.name,
        seatIndex: auth.seatIdx,
        audio: audioBuf,
        mimeType,
        duration,
        timestamp: now,
        messageCount: ++auth.room.messageCount,
      });
      callback?.({ success: true, duration });
    });

    // Private targeted voice whisper relay (never stored, never broadcasts audio to room)
    socket.on('voice:whisper', (payload, callback) => {
      const auth = this.verifySender(socket, payload?.token || payload?.sessionToken);
      if (
        !auth ||
        auth.seat.isAI ||
        auth.seat.socketId !== socket.id ||
        auth.room.matchEnded ||
        (payload?.roomCode && String(payload.roomCode).trim().toUpperCase() !== auth.room.code)
      ) {
        return callback?.({ success: false, error: 'Cannot send whisper right now' });
      }
      const now = Date.now();
      if (now - auth.seat.lastWhisperTime < 5000) {
        return callback?.({ success: false, error: 'Wait 5 seconds between whispers' });
      }
      const clipBuf = this.extractBinaryAudio(payload?.clip);
      if (!clipBuf || clipBuf.byteLength < 32) {
        return callback?.({ success: false, error: 'Invalid whisper audio format' });
      }
      if (clipBuf.byteLength > MAX_WHISPER_VOICE_BYTES) {
        return callback?.({ success: false, error: 'Whisper clip too large (max ~5.5s)' });
      }

      const rawTargets = Array.isArray(payload?.toSeats) ? payload.toSeats : [];
      const targetIndices = Array.from(
        new Set<number>(
          rawTargets
            .map((s: unknown) => Number(s))
            .filter((s: number) => Number.isInteger(s) && s >= 0 && s < 5 && s !== auth.seatIdx),
        ),
      );
      if (targetIndices.length === 0) {
        return callback?.({ success: false, error: 'Choose a valid player to whisper to' });
      }

      const validTargets: RoomSeat[] = [];
      for (const targetIdx of targetIndices) {
        const seat = auth.room.seats[targetIdx];
        if (seat && !seat.isAI && seat.connected && seat.socketId) {
          validTargets.push(seat);
        }
      }
      if (validTargets.length === 0) {
        return callback?.({ success: false, error: 'Target player is a bot or disconnected' });
      }

      const mimeType = this.sanitizeAudioMimeType(payload?.mimeType, payload?.clip);
      const duration = this.estimateAudioDurationSeconds(clipBuf.byteLength, 6, clipBuf);
      auth.seat.lastWhisperTime = now;
      auth.room.lastActivity = now;

      for (const targetSeat of validTargets) {
        this.io.to(targetSeat.socketId!).emit('voice:whisper', {
          id: `whisper_${now}_${auth.seatIdx}_${targetSeat.seatIndex}`,
          fromSeat: auth.seatIdx,
          senderName: auth.seat.name,
          toSeat: targetSeat.seatIndex,
          clip: clipBuf,
          mimeType,
          duration,
          timestamp: now,
        });
      }

      // Transparent room notice (metadata only, never audio) unless Host enabled Secret Whispers
      if (!auth.room.secretWhispers) {
        this.io.to(`ludo:${auth.room.code}`).emit('ludo:whisper_notice', {
          fromSeat: auth.seatIdx,
          senderName: auth.seat.name,
          toSeats: validTargets.map((t) => t.seatIndex),
          targetNames: validTargets.map((t) => t.name),
          timestamp: now,
        });
      }

      callback?.({ success: true, duration, deliveredTo: validTargets.map((t) => t.seatIndex) });
    });

    // =========================================================================
    // Live Open-Mic WebRTC Group Voice Chat Signaling (Room-Scoped Relay Only)
    // =========================================================================
    socket.on('voice:join', (payload, callback) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || auth.seat.isAI || auth.room.matchEnded) {
        return callback?.({ success: false, error: 'Cannot join voice chat right now' });
      }
      const { room, seat, seatIdx } = auth;
      if (seat.socketId !== socket.id) {
        return callback?.({ success: false, error: 'Stale socket session' });
      }

      // Ensure seat only has one active voice participant entry
      for (const [sid, existing] of room.voiceParticipants.entries()) {
        if (existing.seatIndex === seatIdx && sid !== socket.id) {
          room.voiceParticipants.delete(sid);
        }
      }

      const participant: VoiceParticipant = {
        socketId: socket.id,
        seatIndex: seatIdx,
        name: seat.name,
        isMuted: !!payload?.isMuted,
      };
      room.voiceParticipants.set(socket.id, participant);
      room.lastActivity = Date.now();

      const participants = this.getVoiceParticipantsList(room);
      this.io.to(`ludo:${room.code}`).emit('voice:join', {
        ...participant,
        participants,
      });
      this.broadcastVoiceParticipants(room);
      callback?.({ success: true, socketId: socket.id, participants });
    });

    socket.on('voice:leave', (payload, callback) => {
      const auth = this.verifySender(socket, payload?.token);
      const roomCode = auth?.room.code || (socket.data.ludoRoomCode as string | undefined);
      const room = auth?.room || (roomCode ? this.rooms.get(roomCode) : undefined);
      if (!room) {
        return callback?.({ success: false, error: 'Not in a room' });
      }
      const removed = room.voiceParticipants.get(socket.id);
      room.voiceParticipants.delete(socket.id);
      if (removed) {
        room.lastActivity = Date.now();
        const participants = this.getVoiceParticipantsList(room);
        this.io.to(`ludo:${room.code}`).emit('voice:leave', {
          socketId: socket.id,
          seatIndex: removed.seatIndex,
          participants,
        });
        this.broadcastVoiceParticipants(room);
      }
      callback?.({ success: true, participants: this.getVoiceParticipantsList(room) });
    });

    socket.on('voice:mute-state', (payload, callback) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || auth.seat.isAI || auth.room.matchEnded) {
        return callback?.({ success: false, error: 'Not in an active room' });
      }
      const isMuted = !!payload?.isMuted;
      const existing = auth.room.voiceParticipants.get(socket.id);
      if (existing) {
        existing.isMuted = isMuted;
      }
      auth.room.lastActivity = Date.now();
      this.io.to(`ludo:${auth.room.code}`).emit('voice:mute-state', {
        socketId: socket.id,
        seat: auth.seatIdx,
        isMuted,
      });
      this.broadcastVoiceParticipants(auth.room);
      callback?.({ success: true, seat: auth.seatIdx, isMuted });
    });

    socket.on('voice:offer', (payload, callback) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || auth.seat.isAI || auth.room.matchEnded || auth.seat.socketId !== socket.id) {
        return callback?.({ success: false, error: 'Unauthorized voice signaling sender' });
      }
      if (!payload?.sdp || typeof payload.sdp !== 'object') {
        return callback?.({ success: false, error: 'Invalid SDP offer' });
      }
      if (payload.targetSocketId === socket.id) {
        return callback?.({ success: false, error: 'Cannot signal self' });
      }
      const targetSeat = this.findActiveRoomPeer(auth.room, payload.targetSocketId);
      if (!targetSeat || !targetSeat.socketId) {
        return callback?.({ success: false, error: 'Target peer not in same room' });
      }
      auth.room.lastActivity = Date.now();
      this.io.to(targetSeat.socketId).emit('voice:offer', {
        fromSocketId: socket.id,
        fromSeat: auth.seatIdx,
        sdp: payload.sdp,
      });
      callback?.({ success: true });
    });

    socket.on('voice:answer', (payload, callback) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || auth.seat.isAI || auth.room.matchEnded || auth.seat.socketId !== socket.id) {
        return callback?.({ success: false, error: 'Unauthorized voice signaling sender' });
      }
      if (!payload?.sdp || typeof payload.sdp !== 'object') {
        return callback?.({ success: false, error: 'Invalid SDP answer' });
      }
      if (payload.targetSocketId === socket.id) {
        return callback?.({ success: false, error: 'Cannot signal self' });
      }
      const targetSeat = this.findActiveRoomPeer(auth.room, payload.targetSocketId);
      if (!targetSeat || !targetSeat.socketId) {
        return callback?.({ success: false, error: 'Target peer not in same room' });
      }
      auth.room.lastActivity = Date.now();
      this.io.to(targetSeat.socketId).emit('voice:answer', {
        fromSocketId: socket.id,
        fromSeat: auth.seatIdx,
        sdp: payload.sdp,
      });
      callback?.({ success: true });
    });

    socket.on('voice:ice', (payload, callback) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || auth.seat.isAI || auth.room.matchEnded || auth.seat.socketId !== socket.id) {
        return callback?.({ success: false, error: 'Unauthorized voice signaling sender' });
      }
      if (!payload?.candidate || typeof payload.candidate !== 'object') {
        return callback?.({ success: false, error: 'Invalid ICE candidate' });
      }
      if (payload.targetSocketId === socket.id) {
        return callback?.({ success: false, error: 'Cannot signal self' });
      }
      const targetSeat = this.findActiveRoomPeer(auth.room, payload.targetSocketId);
      if (!targetSeat || !targetSeat.socketId) {
        return callback?.({ success: false, error: 'Target peer not in same room' });
      }
      auth.room.lastActivity = Date.now();
      this.io.to(targetSeat.socketId).emit('voice:ice', {
        fromSocketId: socket.id,
        fromSeat: auth.seatIdx,
        candidate: payload.candidate,
      });
      callback?.({ success: true });
    });

    socket.on('disconnect', () => {
      const code = socket.data.ludoRoomCode as string | undefined;
      if (!code) return;
      const room = this.rooms.get(code);
      if (!room) return;
      const removedVoice = room.voiceParticipants.get(socket.id);
      if (removedVoice) {
        room.voiceParticipants.delete(socket.id);
        const participants = this.getVoiceParticipantsList(room);
        this.io.to(`ludo:${room.code}`).emit('voice:leave', {
          socketId: socket.id,
          seatIndex: removedVoice.seatIndex,
          participants,
        });
        this.broadcastVoiceParticipants(room);
      }

      const seatIdx = socket.data.ludoSeat as number | undefined;
      if (typeof seatIdx === 'number' && room.seats[seatIdx]) {
        room.seats[seatIdx].connected = false;
        room.seats[seatIdx].socketId = null;

        const existingGrace = room.disconnectGraceTimers.get(seatIdx);
        if (existingGrace) clearTimeout(existingGrace);
        const graceTimer = setTimeout(() => {
          this.handleGraceExpiry(room, seatIdx);
        }, this.disconnectGraceMs);
        room.disconnectGraceTimers.set(seatIdx, graceTimer);
      }

      const anyHumanConnected = Object.values(room.seats).some(
        (s) => s && !s.isAI && !s.tempBotTakeover && s.connected,
      );
      if (!anyHumanConnected && !room.emptyDeletionTimer) {
        room.emptyDeletionTimer = setTimeout(() => {
          const stillEmpty = !Object.values(room.seats).some(
            (s) => s && !s.isAI && !s.tempBotTakeover && s.connected,
          );
          if (stillEmpty) {
            this.clearRoomTimers(room);
            for (const t of room.disconnectGraceTimers.values()) clearTimeout(t);
            room.disconnectGraceTimers.clear();
            this.rooms.delete(code);
          }
        }, 90_000);
      } else {
        this.broadcastRoom(room);
      }
    });
  }

  private extractBinaryAudio(raw: unknown): Buffer | null {
    if (!raw) return null;
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof ArrayBuffer) return Buffer.from(raw);
    if (ArrayBuffer.isView(raw)) {
      return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
    }
    if (typeof raw === 'string' && raw.startsWith('data:audio/')) {
      const markerIdx = raw.indexOf(';base64,');
      if (markerIdx === -1) return null;
      const b64 = raw.slice(markerIdx + 8);
      if (!b64) return null;
      try {
        return Buffer.from(b64, 'base64');
      } catch {
        return null;
      }
    }
    return null;
  }

  private sanitizeAudioMimeType(rawMime: unknown, rawData?: unknown): string {
    let candidate = typeof rawMime === 'string' ? rawMime : '';
    if (!candidate && typeof rawData === 'string' && rawData.startsWith('data:audio/')) {
      const end = rawData.indexOf(';');
      if (end > 5) candidate = rawData.slice(5, end);
    }
    const base = candidate.split(';')[0].trim().toLowerCase();
    if (base === 'audio/wave' || base === 'audio/x-wav' || base === 'audio/wav') {
      return 'audio/wav';
    }
    if (
      base === 'audio/webm' ||
      base === 'audio/mp4' ||
      base === 'audio/aac' ||
      base === 'audio/ogg' ||
      base === 'audio/mpeg' ||
      base === 'audio/x-matroska'
    ) {
      return base;
    }
    return 'audio/webm';
  }

  private estimateAudioDurationSeconds(byteLength: number, maxSeconds: number, buf?: Buffer): number {
    if (
      buf &&
      buf.byteLength >= 44 &&
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WAVE'
    ) {
      const byteRate = buf.readUInt32LE(28);
      if (byteRate > 0) {
        return Math.min(maxSeconds, Math.max(1, Math.round((byteLength - 44) / byteRate)));
      }
    }
    return Math.min(maxSeconds, Math.max(1, Math.round(byteLength / 2500)));
  }

  private emitAiDialogue(
    room: LudoRoom,
    seatIdx: number,
    event:
      | 'turn'
      | 'roll'
      | 'lucky_roll'
      | 'lucky7'
      | 'capture'
      | 'captured'
      | 'pawn_home'
      | 'home_stretch'
      | 'penalty'
      | 'win',
  ): void {
    if (!room.started || (room.matchEnded && event !== 'win')) return;
    const now = Date.now();
    if (event === 'turn' || event === 'roll') {
      if (now - room.lastRoutineDialogueAt < 4000) return;
      room.lastRoutineDialogueAt = now;
    }

    const key = `${seatIdx}:${event}`;
    let lineIdx = Math.floor(this.rng() * AI_DIALOGUE_LINE_COUNT) % AI_DIALOGUE_LINE_COUNT;
    if (room.lastDialogueLineIdx.get(key) === lineIdx) {
      lineIdx = (lineIdx + 1) % AI_DIALOGUE_LINE_COUNT;
    }
    room.lastDialogueLineIdx.set(key, lineIdx);

    this.io.to(`ludo:${room.code}`).emit('ludo:ai_dialogue', {
      seatIdx,
      event,
      lineIdx,
      timestamp: now,
    });
  }
}
