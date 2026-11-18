import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Server, Socket } from 'socket.io';
import {
  applyLucky7IfEligible,
  applySplitSacrifice,
  canAnyPawnMove,
  canMovePawn,
  checkCompulsoryCapturePenalty,
  cloneDefaultPlayers,
  createInitialPawns,
  createInitialPlayerStats,
  executePawnMove,
  getPawnPath,
  getPlayerRankings,
  getPossibleCaptures,
  isLoneTokenOnTrack,
  pickBestAIMove,
  rollDicePair,
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
  turnSecondsLeft: number;
  turnExpiresAt: number | null;
  pendingGul: PendingGulChoice | null;
  winner: number | null;
  rankings: RankingEntry[];
  lastEventText: string;
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
  timerConfig: {
    enabled: boolean;
    duration: 60 | 90 | 120 | 0;
  };
  seats: Record<number, RoomSeat>;
  match: AuthoritativeMatchState | null;
  actionSeq: number;
  messageCount: number;
  processedActionIds: Map<string, number>;
  disconnectGraceTimers: Map<number, ReturnType<typeof setTimeout>>;
  emptyDeletionTimer: ReturnType<typeof setTimeout> | null;
  aiActionTimer: ReturnType<typeof setTimeout> | null;
  turnPassTimer: ReturnType<typeof setTimeout> | null;
}

export interface RoomManagerOptions {
  rng?: RngFn;
  disconnectGraceMs?: number;
}

const MAX_LUDO_ROOMS = 250;
const DEFAULT_DISCONNECT_GRACE_MS = 15_000;
const ACTION_ID_TTL_MS = 120_000;
const MIN_SOCKET_ACTION_GAP_MS = 120;

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
  private tickIntervalId: ReturnType<typeof setInterval>;
  private cleanupIntervalId: ReturnType<typeof setInterval>;

  constructor(io: Server, rootDir: string, options: RoomManagerOptions = {}) {
    this.io = io;
    this.rootDir = rootDir;
    this.rng = options.rng || DEFAULT_CRYPTO_RNG;
    this.disconnectGraceMs = options.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;
    this.loadConfigs();

    this.tickIntervalId = setInterval(() => this.tickTimers(), 1000);
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
        };
      }
    }

    return {
      code: room.code,
      hostSeatIndex: room.hostSeatIndex,
      started: room.started,
      matchEnded: room.matchEnded,
      fillBots: room.fillBots,
      timerConfig: room.timerConfig,
      seats: seatsOut,
      match: room.match,
      actionSeq: room.actionSeq,
      serverTime: Date.now(),
      messageCount: room.messageCount,
    };
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
    const seat = room.seats[m.currentPlayer];
    if (!seat || (!seat.isAI && !seat.tempBotTakeover)) return;

    this.clearRoomTimers(room);
    if (!m.hasRolled) {
      room.aiActionTimer = setTimeout(() => {
        if (!room.started || room.matchEnded || !room.match) return;
        this.performAuthoritativeRoll(room, m.currentPlayer, false);
      }, 650);
    } else if (m.movesAvailable.length > 0) {
      room.aiActionTimer = setTimeout(() => {
        if (!room.started || room.matchEnded || !room.match) return;
        const { move } = pickBestAIMove(m.pawns, m.currentPlayer, m.movesAvailable, m.dice);
        if (!move) {
          this.advanceTurn(room);
          return;
        }
        this.performAuthoritativeMove(room, m.currentPlayer, move.pawnIdx, move.steps, move.dieIdx, true);
      }, 600);
    }
  }

  private performAuthoritativeRoll(room: LudoRoom, seatIdx: number, useWish: boolean): void {
    const m = room.match;
    if (!m || room.matchEnded || m.currentPlayer !== seatIdx || m.hasRolled || m.pendingGul) return;

    const seat = room.seats[seatIdx];
    let [d1, d2] = rollDicePair(this.rng);

    if (useWish && seat && !seat.wishUsed && !seat.isAI && !seat.tempBotTakeover) {
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
    m.turnStartCaptures = getPossibleCaptures(m.pawns, seatIdx, m.movesAvailable, m.dice);
    m.lastEventText = lucky7.applied
      ? `✨ ${seat?.name || 'Player'} triggered Lucky 7 -> 6 + 6!`
      : d1 === 6 && d2 === 6
        ? `🔥 ${seat?.name || 'Player'} rolled Double 6!`
        : `${seat?.name || 'Player'} rolled ${m.dice[0]} & ${m.dice[1]}`;

    const rollSeq = room.actionSeq + 1;
    this.io.to(`ludo:${room.code}`).emit('ludo:dice_roll', {
      dice: m.dice,
      player: seatIdx,
      isLucky7: lucky7.applied,
      usedWish: useWish && !!seat?.wishUsed,
      actionSeq: rollSeq,
      serverTime: Date.now(),
      messageCount: ++room.messageCount,
    });

    this.broadcastRoom(room);

    if (!canAnyPawnMove(m.pawns, seatIdx, m.movesAvailable, m.dice)) {
      m.lastEventText = `${seat?.name || 'Player'}: No usable moves!`;
      this.broadcastRoom(room);
      this.clearRoomTimers(room);
      room.turnPassTimer = setTimeout(() => this.advanceTurn(room), 900);
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

    if (isEnteringGul && !autoConfirmGul && seat && !seat.isAI && !seat.tempBotTakeover) {
      m.pendingGul = { seatIdx, pawnIdx, steps: actualSteps, dieIndex: actualDieIndex };
      if (seat.socketId) {
        this.io.to(seat.socketId).emit('ludo:gul_prompt', m.pendingGul);
      }
      this.broadcastRoom(room);
      return;
    }

    const startPos = currPawn.pos;
    const preMoveCaptures =
      actualDieIndex === 'combined' ? [] : getPossibleCaptures(m.pawns, seatIdx, m.movesAvailable, m.dice);

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

    if (actualDieIndex !== 'combined' && preMoveCaptures.length > 0) {
      const sacrificed = applySplitSacrifice(m.pawns, seatIdx, pawnIdx, startPos, preMoveCaptures, actualDieIndex);
      if (sacrificed) {
        m.lastEventText = `${seat?.name || 'Player'}: Pair split sacrifice! Partner returned to base.`;
      }
    }

    if (outcome.reachedCenterHome) {
      m.extraTurnEarned = true;
      m.extraTurnReason = 'home';
      m.lastEventText = `🌟 ${seat?.name || 'Player'} reached Centre Home! Bonus Turn!`;
    }

    if (outcome.capturedVictims.length > 0) {
      m.extraTurnEarned = true;
      m.extraTurnReason = 'capture';
      m.turnCapturedPawn = true;
      const victimName = room.seats[outcome.capturedVictims[0].playerIdx]?.name || 'Rival';
      m.lastEventText = `⚔️ ${seat?.name || 'Player'} captured ${victimName}! Bonus Roll!`;
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
    if (!canMoveRemaining) {
      const penalizedPawn = checkCompulsoryCapturePenalty(
        m.pawns,
        m.playerStats,
        seatIdx,
        m.turnStartCaptures,
        m.turnCapturedPawn,
        m.extraTurnReason,
      );
      if (penalizedPawn !== null) {
        m.lastEventText = `⚠️ ${seat?.name || 'Player'} missed a compulsory capture — token sent back to base!`;
      }
      m.movesAvailable = [];
      this.broadcastRoom(room);
      this.clearRoomTimers(room);
      room.turnPassTimer = setTimeout(() => this.advanceTurn(room), 600);
    } else {
      const moreCaps = getPossibleCaptures(m.pawns, seatIdx, m.movesAvailable, m.dice);
      for (const rc of moreCaps) {
        if (!m.turnStartCaptures.some((c) => c.pawnIdx === rc.pawnIdx)) {
          m.turnStartCaptures.push(rc);
        }
      }
      this.broadcastRoom(room);
      if (seat?.isAI || seat?.tempBotTakeover) {
        this.scheduleNextAIAction(room);
      }
    }
  }

  private performAuthoritativePassGul(room: LudoRoom): void {
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
    m.lastEventText = `${seat?.name || 'Player'} passed the Gul entry.`;
    const canMoveRemaining = m.movesAvailable.length > 0 && canAnyPawnMove(m.pawns, seatIdx, m.movesAvailable, m.dice);

    if (!canMoveRemaining) {
      m.movesAvailable = [];
      this.broadcastRoom(room);
      this.clearRoomTimers(room);
      room.turnPassTimer = setTimeout(() => this.advanceTurn(room), 600);
    } else {
      this.broadcastRoom(room);
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

    m.hasRolled = false;
    m.movesAvailable = [];
    m.extraTurnEarned = false;
    m.extraTurnReason = null;
    m.lucky7UsedThisTurn = false;
    m.turnCapturedPawn = false;
    m.turnStartCaptures = [];
    m.pendingGul = null;
    this.resetTurnExpiry(room);

    const nextSeat = room.seats[m.currentPlayer];
    m.lastEventText = keepSame
      ? `🎲 ${nextSeat?.name || 'Player'} gets a Bonus Turn!`
      : `${nextSeat?.name || 'Player'}'s turn!`;

    this.broadcastRoom(room);

    if (nextSeat?.isAI || nextSeat?.tempBotTakeover) {
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

    const seatArr = Array.from({ length: 5 }, (_, i) => ({
      name: room.seats[i]?.name || `Player ${i + 1}`,
      color: room.seats[i]?.color || '#00d4ff',
    }));

    const rankings = getPlayerRankings(m.pawns, seatArr, m.playerStats, winnerIdx);
    m.rankings = rankings;
    m.lastEventText = `🏆 ${seatArr[winnerIdx].name} WINS!`;

    this.broadcastRoom(room);
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
      if (!room.timerConfig.enabled || room.timerConfig.duration <= 0 || !room.match.turnExpiresAt) continue;

      const remaining = Math.max(0, Math.ceil((room.match.turnExpiresAt - now) / 1000));
      room.match.turnSecondsLeft = remaining;
      if (remaining <= 0) {
        room.match.extraTurnEarned = false;
        room.match.extraTurnReason = null;
        this.advanceTurn(room);
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
          room.match.pendingGul = null;
          this.advanceTurn(room);
        } else if (room.match.currentPlayer === seatIdx) {
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
          timerConfig,
          match: null,
          actionSeq: 1,
          messageCount: 0,
          processedActionIds: new Map(),
          disconnectGraceTimers: new Map(),
          emptyDeletionTimer: null,
          aiActionTimer: null,
          turnPassTimer: null,
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
            lastActionTime: 0,
          };
        } else {
          room.seats[i].wishUsed = false;
        }
      }

      room.started = true;
      room.matchEnded = false;
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
        turnSecondsLeft: room.timerConfig.enabled ? room.timerConfig.duration : 0,
        turnExpiresAt:
          room.timerConfig.enabled && room.timerConfig.duration > 0
            ? Date.now() + room.timerConfig.duration * 1000
            : null,
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

    socket.on('ludo:roll_dice', (payload) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || !auth.room.started || auth.room.matchEnded) return;
      const now = Date.now();
      if (now - auth.seat.lastActionTime < MIN_SOCKET_ACTION_GAP_MS) return;
      if (this.isDuplicateAction(auth.room, payload?.clientActionId)) return;
      auth.seat.lastActionTime = now;
      auth.room.lastActivity = now;
      this.performAuthoritativeRoll(auth.room, auth.seatIdx, !!payload?.useWish);
    });

    socket.on('ludo:move_pawn', (payload) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || !auth.room.started || auth.room.matchEnded) return;
      const now = Date.now();
      if (now - auth.seat.lastActionTime < MIN_SOCKET_ACTION_GAP_MS) return;
      if (this.isDuplicateAction(auth.room, payload?.clientActionId)) return;
      const pawnIdx = Number(payload?.pawnIdx);
      const steps = Number(payload?.steps);
      const dieIndex = payload?.dieIndex === 'combined' ? 'combined' : Number(payload?.dieIndex);
      if (!Number.isInteger(pawnIdx) || pawnIdx < 0 || pawnIdx > 3) return;
      auth.seat.lastActionTime = now;
      auth.room.lastActivity = now;
      this.performAuthoritativeMove(auth.room, auth.seatIdx, pawnIdx, steps, dieIndex, false);
    });

    socket.on('ludo:gul_choice', (payload) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || !auth.room.match?.pendingGul) return;
      if (this.isDuplicateAction(auth.room, payload?.clientActionId)) return;
      const pending = auth.room.match.pendingGul;
      if (pending.seatIdx !== auth.seatIdx) return;

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

    socket.on('ludo:voice', (payload) => {
      const auth = this.verifySender(socket, payload?.token);
      if (!auth || typeof payload?.audio !== 'string') return;
      const now = Date.now();
      if (now - auth.seat.lastVoiceTime < 2500) return;
      if (payload.audio.length > 500_000) return;
      auth.seat.lastVoiceTime = now;
      auth.room.lastActivity = now;
      this.io.to(`ludo:${auth.room.code}`).emit('ludo:voice', {
        sender: auth.seat.name,
        seatIndex: auth.seatIdx,
        audio: payload.audio,
        duration: Math.min(10, Math.max(1, Number(payload.duration) || 2)),
        timestamp: now,
        messageCount: ++auth.room.messageCount,
      });
    });

    socket.on('disconnect', () => {
      const code = socket.data.ludoRoomCode as string | undefined;
      if (!code) return;
      const room = this.rooms.get(code);
      if (!room) return;
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
}
