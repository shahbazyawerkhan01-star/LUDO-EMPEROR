import { create } from 'zustand';
import {
  applyLucky7IfEligible,
  canAnyPawnMove,
  canMovePawn,
  checkCompulsoryCapturePenalties,
  cloneDefaultPlayers,
  createInitialPawns,
  createInitialPlayerStats,
  evaluateCaptureObligation,
  executePawnMove,
  getPawnPath,
  getPlayerRankings,
  isLoneTokenOnTrack,
  isMovePartOfCaptureSequence,
  pickBestAIMove,
  rollDicePair,
  stripSeatTag,
  type CaptureCandidate,
  type ExtraTurnReason,
  type PawnState,
  type PlayerConfig,
  type PlayerStats,
  type RankingEntry,
} from '../game/rules';
import {
  getAILine,
  getAILineWithIndex,
  getPersonalityEmote,
  getStaticAiClipUrl,
  preloadDialogueLanguage,
  type BanterEvent,
} from '../game/banter';
import { sfx } from '../game/sfx';
import { getDefaultWinStats, runSdk, type SavedPreferences, type WinStats } from '../sdk/runSdk';
import { translate } from '../i18n';

function revokeAudioUrl(url?: string): void {
  if (!url || !url.startsWith('blob:') || typeof URL === 'undefined') return;
  try {
    URL.revokeObjectURL(url);
  } catch {}
}

export type ScreenMode = 'menu' | 'setup' | 'playing';
export type ActiveModal =
  | null
  | 'settings'
  | 'howto'
  | 'music'
  | 'wish'
  | 'profile'
  | 'lobby'
  | 'chat'
  | 'coachSkip'
  | 'gulPass'
  | 'victory'
  | 'tournamentRules';

export type ChatMessageKind = 'text' | 'voice' | 'whisper_in' | 'whisper_out' | 'whisper_notice';

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  seatIndex: number;
  timestamp: number;
  kind?: ChatMessageKind;
  audioData?: string;
  duration?: number;
  targetSeats?: number[];
  targetNames?: string[];
}

export interface RoomSeatPublic {
  seatIndex: number;
  publicPlayerId: string;
  name: string;
  color: string;
  icon: string;
  connected: boolean;
  ready: boolean;
  isAI: boolean;
  tempBotTakeover?: boolean;
  balance?: number;
  personality: PlayerConfig['personality'];
  gender: 'male' | 'female';
  wish: [number, number];
  wishUsed: boolean;
}

export interface VoiceCallParticipant {
  socketId: string;
  seatIndex: number;
  name: string;
  isMuted: boolean;
}

export interface IncomingWhisper {
  id: string;
  fromSeat: number;
  senderName: string;
  clip: string;
  duration: number;
  timestamp: number;
}

export interface PendingMoveChoice {
  pawnIdx: number;
  steps: number;
  dieIdx: number | 'combined';
}

export interface GameStoreState {
  screen: ScreenMode;
  activeModal: ActiveModal;
  profileSeatIdx: number | null;
  wishSeatIdx: number;
  toastText: string | null;

  // Config & Stats
  prefs: SavedPreferences;
  winStats: WinStats;
  players: PlayerConfig[];

  // Local / Shared Match State
  gameStarted: boolean;
  matchOver: boolean;
  isTournament: boolean;
  isOnline: boolean;
  currentPlayer: number;
  dice: [number, number];
  movesAvailable: number[];
  selectedDieIndex: number | null;
  hasRolled: boolean;
  isRolling: boolean;
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
  pawns: PawnState[][];
  playerStats: PlayerStats[];
  turnSecondsLeft: number;
  turnAutoPlay: boolean;
  wishUsedThisMatch: boolean[];
  rankings: RankingEntry[];
  winner: number | null;
  bannerText: string;
  speakingSeat: number | null;

  // Prompts
  pendingCoachMove: PendingMoveChoice | null;
  pendingGulMove: PendingMoveChoice | null;

  // Online Room State
  roomCode: string | null;
  mySeat: number | null;
  hostSeatIndex: number;
  amHost: boolean;
  fillBots: boolean;
  onlineTimerConfig: { enabled: boolean; duration: 60 | 90 | 120 | 0 };
  onlineSeats: Record<number, RoomSeatPublic>;
  chatMessages: ChatMessage[];
  pendingInviteCode: string | null;
  roomError: string | null;
  lastActionSeq: number;
  serverClockOffsetMs: number;
  turnExpiresAt: number | null;

  // Live WebRTC Group Voice Call State (Online Multiplayer Only)
  voiceCallJoined: boolean;
  voiceCallConnecting: boolean;
  voiceCallMuted: boolean;
  voiceCallParticipants: VoiceCallParticipant[];
  voiceSpeakingSeats: number[];
  voiceSeatVolumes: Record<number, number>;
  voiceMicLevel: number;
  voiceMicTestActive: boolean;
  voicePeerStatuses: Record<number, string>;

  // Private Voice Whispers (Online Multiplayer Only, never stored on server)
  secretWhispers: boolean;
  incomingWhispers: Record<number, IncomingWhisper>;
  whisperBadges: Record<number, number>;
  pendingVoiceNotes: ChatMessage[];
  blockedWhisperSeats: number[];
  whisperRecordingSeat: number | null;
  whisperModalOpen: boolean;
  whisperPreselectSeats: number[];

  // Scene bridge hooks
  sceneHandlers: {
    spawnReaction?: (pIdx: number, emoji: string) => void;
    showSpeech?: (pIdx: number, text: string) => void;
  };

  // Actions
  setScreen: (screen: ScreenMode) => void;
  setActiveModal: (modal: ActiveModal) => void;
  openProfileModal: (seatIdx: number) => void;
  openWishModal: (seatIdx: number) => void;
  showToast: (text: string) => void;
  updatePrefs: (patch: Partial<SavedPreferences>) => void;
  updatePlayer: (idx: number, patch: Partial<PlayerConfig>) => void;
  resetWinStats: () => void;
  setSceneHandlers: (handlers: {
    spawnReaction?: (pIdx: number, emoji: string) => void;
    showSpeech?: (pIdx: number, text: string) => void;
  }) => void;
  selectDieIndex: (idx: number | null) => void;

  // Local Match Flow
  startLocalMatch: (tournament: boolean) => void;
  exitMatchToMenu: () => void;
  rollLocalDice: (useWish?: boolean, fromAutoPlay?: boolean) => void;
  handleLocalPawnTap: (pIdx: number, pawnIdx: number) => void;
  handleLocalBaseTap: (pIdx: number) => void;
  attemptOnlineMoveWithCoachCheck: (pawnIdx: number, steps: number, dieIdx: number | 'combined') => boolean;
  confirmCoachSkipMove: () => void;
  confirmGulChoice: (choice: 'gul' | 'pass') => void;
  tickLocalTimer: () => void;
  triggerReaction: (seatIdx: number, emoji: string) => void;
  speakPlayerText: (seatIdx: number, text: string) => void;
  toggleAiVoiceMute: () => void;
  toggleSeatMute: (seatIdx: number) => void;
  triggerAiLine: (seatIdx: number, event?: BanterEvent) => void;

  // Network Sync Mutations
  setRoomJoined: (payload: {
    roomCode: string;
    seatIndex: number;
    amHost: boolean;
    roomState: {
      started: boolean;
      matchEnded: boolean;
      fillBots: boolean;
      secretWhispers?: boolean;
      hostSeatIndex?: number;
      timerConfig: { enabled: boolean; duration: 60 | 90 | 120 | 0 };
      seats: Record<number, RoomSeatPublic>;
      match: Record<string, unknown> | null;
      voiceParticipants?: VoiceCallParticipant[];
      actionSeq?: number;
      serverTime?: number;
    };
  }) => void;
  applyServerRoomUpdate: (roomState: {
    code: string;
    started: boolean;
    matchEnded: boolean;
    fillBots: boolean;
    secretWhispers?: boolean;
    hostSeatIndex?: number;
    timerConfig: { enabled: boolean; duration: 60 | 90 | 120 | 0 };
    seats: Record<number, RoomSeatPublic>;
    match: Record<string, unknown> | null;
    voiceParticipants?: VoiceCallParticipant[];
    actionSeq?: number;
    serverTime?: number;
  }) => void;
  applyServerDiceRoll: (payload: {
    dice: [number, number];
    player: number;
    isLucky7: boolean;
    isAutoPlay?: boolean;
    actionSeq?: number;
  }) => void;
  applyServerMatchEnded: (payload: { winner: number; rankings: RankingEntry[] }) => void;
  playSyncedAiDialogue: (seatIdx: number, event: BanterEvent, lineIdx: number) => void;
  appendChatMessage: (msg: ChatMessage) => void;
  setPendingServerGul: (choice: PendingMoveChoice | null) => void;
  setPendingInviteCode: (code: string | null) => void;
  setRoomError: (err: string | null) => void;
  leaveOnlineRoomLocal: () => void;

  // Live Voice Call Mutations
  setVoiceCallState: (patch: {
    voiceCallJoined?: boolean;
    voiceCallConnecting?: boolean;
    voiceCallMuted?: boolean;
    voiceMicLevel?: number;
    voiceMicTestActive?: boolean;
  }) => void;
  setVoiceCallParticipants: (participants: VoiceCallParticipant[]) => void;
  setVoiceSpeakingSeats: (seats: number[]) => void;
  setVoicePeerStatuses: (statuses: Record<number, string>) => void;
  setVoiceSeatVolume: (seatIdx: number, volume: number) => void;

  // Whisper & Voice Note Mutations
  openWhisperModal: (preselectSeats?: number[]) => void;
  closeWhisperModal: () => void;
  setSecretWhispers: (secretWhispers: boolean) => void;
  appendOutgoingWhisper: (payload: {
    id: string;
    toSeats: number[];
    targetNames: string[];
    audioUrl: string;
    duration: number;
    timestamp: number;
  }) => void;
  receiveWhisper: (whisper: IncomingWhisper) => void;
  playIncomingWhisper: (fromSeat: number) => void;
  dismissIncomingWhisper: (fromSeat: number) => void;
  playVoiceNote: (msgId: string) => void;
  dismissVoiceNote: (msgId: string) => void;
  toggleBlockWhisperSeat: (seatIdx: number) => void;
  setWhisperRecordingSeat: (seatIdx: number | null) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let aiTimeout: ReturnType<typeof setTimeout> | null = null;
let passTimeout: ReturnType<typeof setTimeout> | null = null;
let rollTimeout: ReturnType<typeof setTimeout> | null = null;
let banterTimers: Array<ReturnType<typeof setTimeout>> = [];
let lastRoutineSpeechAt = 0;
let lastSyncedDialogueKey = '';
let lastSyncedDialogueAt = 0;
const whisperBadgeTimers = new Map<number, ReturnType<typeof setTimeout>>();

function clearLocalTimers() {
  if (aiTimeout) {
    clearTimeout(aiTimeout);
    aiTimeout = null;
  }
  if (passTimeout) {
    clearTimeout(passTimeout);
    passTimeout = null;
  }
  if (rollTimeout) {
    clearTimeout(rollTimeout);
    rollTimeout = null;
  }
  banterTimers.forEach((t) => clearTimeout(t));
  banterTimers = [];
}

function shouldShowCaptureWarning(
  st: Pick<GameStoreState, 'prefs' | 'winStats' | 'players' | 'pawns' | 'movesAvailable' | 'dice'>,
  pIdx: number,
  pawnIdx: number,
  steps: number,
  dieIdx: number | 'combined',
): boolean {
  const mode = st.prefs.captureWarningMode ?? 'first3';
  if (mode === 'off') return false;
  const player = st.players[pIdx];
  if (!player || player.isAI) return false;
  if (mode === 'first3') {
    const cleanName = stripSeatTag(player.name);
    const playedCount =
      st.winStats.playerMatches?.[cleanName] ??
      st.winStats.playerMatches?.[player.name] ??
      0;
    if (playedCount >= 3) return false;
  }
  const ob = evaluateCaptureObligation(st.pawns, pIdx, st.movesAvailable, st.dice);
  if (ob.requiredCaptures === 0) return false;
  return !isMovePartOfCaptureSequence(st.pawns, pIdx, pawnIdx, steps, dieIdx, st.movesAvailable, st.dice);
}

export const useGameStore = create<GameStoreState>((set, get) => {
  const initialPrefs = runSdk.loadPreferences();
  const initialStats = runSdk.loadWinStats();
  const initialPlayers = runSdk.loadPlayers();

  sfx.setVolumes(initialPrefs.volume, initialPrefs.musicVolume);
  sfx.setAiVoiceMuted(initialPrefs.aiVoiceMuted);
  void preloadDialogueLanguage(initialPrefs.language);

  const emitBanter = (pIdx: number, event: BanterEvent, delayMs = 0, forceSpeak = false) => {
    const run = () => {
      const st = get();
      if (!st.gameStarted && event !== 'banter') return;
      const player = st.players[pIdx];
      if (!player || !player.isAI) return;

      const emote = getPersonalityEmote(player.personality);
      st.sceneHandlers.spawnReaction?.(pIdx, emote);

      const isSeatMuted = st.prefs.mutedSeats.includes(pIdx);
      const isMuted = st.prefs.aiVoiceMuted || isSeatMuted;
      if (isMuted && !forceSpeak) return;

      const isHighPriority =
        forceSpeak ||
        event === 'capture' ||
        event === 'captured' ||
        event === 'win' ||
        event === 'loss' ||
        event === 'lucky7' ||
        event === 'lucky_roll' ||
        event === 'pawn_home' ||
        event === 'home_stretch' ||
        event === 'penalty' ||
        event === 'banter';

      const now = Date.now();
      const routineCooldownOk = now - lastRoutineSpeechAt >= 4200;
      const shouldSpeak =
        isHighPriority ||
        (event === 'turn' && routineCooldownOk && !sfx.isVoiceBusy() && Math.random() < 0.72) ||
        (event === 'roll' && routineCooldownOk && !sfx.isVoiceBusy() && Math.random() < 0.45);

      if (!shouldSpeak) return;

      if (!isHighPriority) {
        lastRoutineSpeechAt = now;
      }

      const { text: line, lineIdx } = getAILineWithIndex(st.prefs.language, event);

      if (!isMuted && st.prefs.volume > 0.01) {
        sfx.speakTTS(line, st.prefs.language, {
          isAi: true,
          gender: player.gender,
          seatIdx: pIdx,
          priority: isHighPriority ? 'high' : 'normal',
          staticClipUrl: getStaticAiClipUrl(st.prefs.language, event, lineIdx),
          onStart: () => {
            get().sceneHandlers.showSpeech?.(pIdx, line);
            set({ speakingSeat: pIdx });
          },
          onEnd: () => {
            if (get().speakingSeat === pIdx) set({ speakingSeat: null });
          },
        });
      } else if (forceSpeak) {
        st.sceneHandlers.showSpeech?.(pIdx, line);
      }
    };

    if (delayMs > 0) {
      const t = setTimeout(run, delayMs);
      banterTimers.push(t);
    } else {
      run();
    }
  };

  const scheduleAITurnIfNeeded = (moveDelayMs?: number) => {
    const st = get();
    if (st.isOnline || !st.gameStarted || st.matchOver || st.screen !== 'playing') return;
    const current = st.players[st.currentPlayer];
    if (!current || (!current.isAI && !st.turnAutoPlay)) return;

    if (aiTimeout) {
      clearTimeout(aiTimeout);
      aiTimeout = null;
    }

    const expectedSeat = st.currentPlayer;
    if (!st.hasRolled && !st.isRolling) {
      aiTimeout = setTimeout(() => {
        const cur = get();
        if (cur.isOnline || cur.matchOver || !cur.gameStarted || cur.currentPlayer !== expectedSeat) return;
        if (cur.hasRolled || cur.isRolling) return;
        if (!cur.players[expectedSeat]?.isAI && !cur.turnAutoPlay) return;
        cur.rollLocalDice(false, true);
      }, moveDelayMs ?? (st.turnAutoPlay ? 750 : 1450));
    } else if (st.hasRolled && !st.isRolling && st.movesAvailable.length > 0) {
      aiTimeout = setTimeout(() => {
        const cur = get();
        if (cur.isOnline || cur.matchOver || !cur.gameStarted || cur.currentPlayer !== expectedSeat) return;
        if (!cur.hasRolled || cur.isRolling) return;
        if (!cur.players[expectedSeat]?.isAI && !cur.turnAutoPlay) return;
        const { move } = pickBestAIMove(cur.pawns, cur.currentPlayer, cur.movesAvailable, cur.dice);
        if (!move) {
          advanceLocalTurn();
          return;
        }
        executeLocalMoveStep(move.pawnIdx, move.steps, move.dieIdx, true);
      }, moveDelayMs ?? (st.turnAutoPlay ? 700 : 1120));
    }
  };

  const finishLocalVictory = (winnerIdx: number) => {
    clearLocalTimers();
    const st = get();
    const rankings = getPlayerRankings(st.pawns, st.players, st.playerStats, winnerIdx);
    const winnerName = st.players[winnerIdx]?.name || 'Player';
    const nextPlayerMatches = { ...(st.winStats.playerMatches || {}) };
    st.players.forEach((p) => {
      if (!p.isAI) {
        const clean = stripSeatTag(p.name);
        nextPlayerMatches[clean] = (nextPlayerMatches[clean] || 0) + 1;
      }
    });
    const nextStats: WinStats = {
      ...st.winStats,
      wins: { ...st.winStats.wins },
      balances: { ...st.winStats.balances },
      bonds: { ...st.winStats.bonds },
      history: { ...st.winStats.history },
      matchesPlayed: (st.winStats.matchesPlayed || 0) + 1,
      playerMatches: nextPlayerMatches,
    };
    nextStats.wins[winnerName] = (nextStats.wins[winnerName] || 0) + 1;

    if (st.isTournament) {
      nextStats.balances[winnerName] = (nextStats.balances[winnerName] ?? 5) + 2;
      if (nextStats.wins[winnerName] === 100) nextStats.balances[winnerName] += 100;
      if (nextStats.wins[winnerName] === 1000) nextStats.balances[winnerName] += 1000;
    }

    runSdk.saveWinStats(nextStats);
    sfx.play('win');
    emitBanter(winnerIdx, 'win');
    const losingAi = st.players
      .map((p, idx) => ({ p, idx }))
      .filter((x) => x.p.isAI && x.idx !== winnerIdx);
    if (losingAi.length > 0) {
      const pick = losingAi[Math.floor(Math.random() * losingAi.length)];
      emitBanter(pick.idx, 'loss', 2400);
    }

    set({
      matchOver: true,
      winner: winnerIdx,
      rankings,
      winStats: nextStats,
      movesAvailable: [],
      turnAutoPlay: false,
      pendingCoachMove: null,
      pendingGulMove: null,
      bannerText: `🏆 ${winnerName} ${translate(st.prefs.language, 'win_text')}`,
      activeModal: 'victory',
    });
  };

  const advanceLocalTurn = () => {
    const st = get();
    if (st.isOnline || st.matchOver || !st.gameStarted) return;
    clearLocalTimers();
    sfx.stopHeartbeat();

    const keepSame = st.extraTurnEarned;
    const nextP = keepSame ? st.currentPlayer : (st.currentPlayer + 1) % 5;
    const nextPlayerObj = st.players[nextP];

    set({
      currentPlayer: nextP,
      hasRolled: false,
      isRolling: false,
      turnAutoPlay: false,
      movesAvailable: [],
      selectedDieIndex: null,
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
      pendingCoachMove: null,
      pendingGulMove: null,
      turnSecondsLeft: st.prefs.turnTimerEnabled ? st.prefs.turnTimerDuration : 0,
      bannerText: keepSame
        ? `🎲 ${nextPlayerObj.name} Bonus Turn!`
        : `${nextPlayerObj.name}: ${translate(st.prefs.language, 'roll_hint')}`,
    });

    if (nextPlayerObj.isAI) {
      emitBanter(nextP, 'turn');
      scheduleAITurnIfNeeded();
    }
  };

  const executeLocalMoveStep = (
    pawnIdx: number,
    steps: number,
    dieIdx: number | 'combined',
    bypassPrompts = false,
  ) => {
    const st = get();
    if (st.matchOver || !st.hasRolled || st.isRolling) return;
    const pIdx = st.currentPlayer;
    const player = st.players[pIdx];

    if (!canMovePawn(st.pawns, pIdx, pawnIdx, steps, st.dice, st.movesAvailable)) return;

    const effectiveBypass = bypassPrompts || st.turnAutoPlay;

    // Coach warning if human skips an available compulsory capture
    if (!effectiveBypass && shouldShowCaptureWarning(st, pIdx, pawnIdx, steps, dieIdx)) {
      sfx.play('heartbeat', 0.85);
      set({
        pendingCoachMove: { pawnIdx, steps, dieIdx },
        activeModal: 'coachSkip',
      });
      return;
    }

    // Centre Home ("Gul or Pass") choice for humans reaching pos 68
    const currPawn = st.pawns[pIdx][pawnIdx];
    const destPos = currPawn.status === 'home' ? 0 : currPawn.pos + steps;
    const path = getPawnPath(pIdx);
    if (!effectiveBypass && !player.isAI && destPos === path.length - 1) {
      set({
        pendingGulMove: { pawnIdx, steps, dieIdx },
        activeModal: 'gulPass',
      });
      return;
    }

    const nextPawns = st.pawns.map((row) => row.map((p) => ({ ...p })));
    const nextStats = st.playerStats.map((s) => ({ ...s }));
    const nextMoves = [...st.movesAvailable];
    const startPos = nextPawns[pIdx][pawnIdx].pos;

    const outcome = executePawnMove(nextPawns, nextStats, pIdx, pawnIdx, steps, st.dice, nextMoves);
    if (!outcome.moved) return;

    sfx.play('move', 0.85);

    let extraEarned = st.extraTurnEarned;
    let extraReason = st.extraTurnReason;
    let capturedFlag = st.turnCapturedPawn;
    let capturesMade = st.turnCapturesMade;
    const capturingPawns = [...st.turnCapturingPawns];
    let requiredCaptures = st.turnRequiredCaptures;
    let candidatePawns = [...st.turnCandidatePawns];
    let midTurnMissed = [...st.turnMidTurnMissedCandidates];

    if (outcome.reachedCenterHome) {
      extraEarned = true;
      extraReason = 'home';
      emitBanter(pIdx, 'pawn_home');
    } else if (startPos >= 0 && startPos < 63 && nextPawns[pIdx][pawnIdx].pos >= 63) {
      emitBanter(pIdx, 'home_stretch');
    }
    if (outcome.capturedVictims.length > 0) {
      extraEarned = true;
      extraReason = 'capture';
      capturedFlag = true;
      capturesMade += 1;
      if (!capturingPawns.includes(pawnIdx)) capturingPawns.push(pawnIdx);
      sfx.play('capture');
      emitBanter(pIdx, 'capture');
      emitBanter(outcome.capturedVictims[0].playerIdx, 'captured', 2000);
    }

    if (dieIdx === 'combined') {
      nextMoves.length = 0;
    } else {
      nextMoves.splice(dieIdx, 1);
    }

    if (outcome.wonMatch) {
      set({ pawns: nextPawns, playerStats: nextStats, movesAvailable: [] });
      finishLocalVictory(pIdx);
      return;
    }

    const remainingMovable =
      nextMoves.length > 0 && canAnyPawnMove(nextPawns, pIdx, nextMoves, st.dice);

    if (!remainingMovable) {
      const penalized = checkCompulsoryCapturePenalties(
        nextPawns,
        nextStats,
        pIdx,
        requiredCaptures,
        capturesMade,
        candidatePawns,
        midTurnMissed,
        capturingPawns,
      );
      let banner = extraEarned ? 'Bonus Turn Earned!' : 'Turn finished!';
      if (penalized.length > 0) {
        banner =
          penalized.length > 1
            ? `⚠️ ${player.name}: Missed capture! ${penalized.length} tokens sent back to base.`
            : `⚠️ ${player.name}: ${translate(st.prefs.language, 'missed_capture_desc')}`;
        sfx.play('whoosh', 0.8);
        emitBanter(pIdx, 'penalty');
      }
      set({
        pawns: nextPawns,
        playerStats: nextStats,
        movesAvailable: [],
        selectedDieIndex: null,
        extraTurnEarned: extraEarned,
        extraTurnReason: extraReason,
        turnCapturedPawn: capturedFlag,
        turnRequiredCaptures: requiredCaptures,
        turnCapturesMade: capturesMade,
        turnCandidatePawns: candidatePawns,
        turnMidTurnMissedCandidates: midTurnMissed,
        turnCapturingPawns: capturingPawns,
        bannerText: banner,
      });
      passTimeout = setTimeout(advanceLocalTurn, st.turnAutoPlay ? 820 : 1320);
    } else {
      const nextOb = evaluateCaptureObligation(nextPawns, pIdx, nextMoves, st.dice);
      if (nextOb.requiredCaptures > 0 && outcome.capturedVictims.length === 0) {
        sfx.play('heartbeat', 0.85);
      }
      const extraCaps = [...nextOb.singleCaptures, ...nextOb.combinedCaptures];
      const mergedCaps = [...st.turnStartCaptures];
      for (const c of extraCaps) {
        if (!mergedCaps.some((m) => m.pawnIdx === c.pawnIdx)) mergedCaps.push(c);
      }

      if (capturesMade === 0 && nextOb.requiredCaptures > 0) {
        requiredCaptures = Math.max(requiredCaptures, nextOb.requiredCaptures) as 0 | 1 | 2;
        for (const cp of nextOb.candidatePawns) {
          if (!candidatePawns.includes(cp)) candidatePawns.push(cp);
        }
      } else if (capturesMade > 0 && nextOb.requiredCaptures > 0) {
        requiredCaptures = Math.max(requiredCaptures, capturesMade + nextOb.requiredCaptures) as 0 | 1 | 2;
        midTurnMissed = Array.from(new Set([...midTurnMissed, ...nextOb.candidatePawns]));
      }

      set({
        pawns: nextPawns,
        playerStats: nextStats,
        movesAvailable: nextMoves,
        selectedDieIndex: 0,
        extraTurnEarned: extraEarned,
        extraTurnReason: extraReason,
        turnCapturedPawn: capturedFlag,
        turnStartCaptures: mergedCaps,
        turnRequiredCaptures: requiredCaptures,
        turnCapturesMade: capturesMade,
        turnCandidatePawns: candidatePawns,
        turnMidTurnMissedCandidates: midTurnMissed,
        turnCapturingPawns: capturingPawns,
        bannerText: st.turnAutoPlay
          ? "⏱️ Time's up! Auto-playing..."
          : `${player.name}: Select next die or pawn`,
      });
      if (player.isAI) {
        scheduleAITurnIfNeeded(1320);
      } else if (get().turnAutoPlay) {
        scheduleAITurnIfNeeded(700);
      }
    }
  };

  return {
    screen: 'menu',
    activeModal: null,
    profileSeatIdx: null,
    wishSeatIdx: 0,
    toastText: null,
    prefs: initialPrefs,
    winStats: initialStats,
    players: initialPlayers,

    gameStarted: false,
    matchOver: false,
    isTournament: false,
    isOnline: false,
    currentPlayer: 0,
    dice: [1, 6],
    movesAvailable: [],
    selectedDieIndex: null,
    hasRolled: false,
    isRolling: false,
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
    pawns: createInitialPawns(),
    playerStats: createInitialPlayerStats(),
    turnSecondsLeft: initialPrefs.turnTimerEnabled ? initialPrefs.turnTimerDuration : 0,
    turnAutoPlay: false,
    wishUsedThisMatch: [false, false, false, false, false],
    rankings: [],
    winner: null,
    bannerText: '',
    speakingSeat: null,

    pendingCoachMove: null,
    pendingGulMove: null,

    roomCode: null,
    mySeat: null,
    hostSeatIndex: 0,
    amHost: false,
    fillBots: true,
    onlineTimerConfig: { enabled: true, duration: 90 },
    onlineSeats: {},
    chatMessages: [],
    pendingInviteCode: null,
    roomError: null,
    lastActionSeq: 0,
    serverClockOffsetMs: 0,
    turnExpiresAt: null,
    voiceCallJoined: false,
    voiceCallConnecting: false,
    voiceCallMuted: false,
    voiceCallParticipants: [],
    voiceSpeakingSeats: [],
    voiceSeatVolumes: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 },
    voiceMicLevel: 0,
    voiceMicTestActive: false,
    voicePeerStatuses: {},
    secretWhispers: false,
    incomingWhispers: {},
    whisperBadges: {},
    pendingVoiceNotes: [],
    blockedWhisperSeats: [],
    whisperRecordingSeat: null,
    whisperModalOpen: false,
    whisperPreselectSeats: [],
    sceneHandlers: {},

    setScreen: (screen) => set({ screen }),
    setActiveModal: (activeModal) => set({ activeModal }),
    setPendingInviteCode: (pendingInviteCode) => set({ pendingInviteCode }),
    openProfileModal: (seatIdx) => set({ profileSeatIdx: seatIdx, activeModal: 'profile' }),
    openWishModal: (seatIdx) => set({ wishSeatIdx: seatIdx, activeModal: 'wish' }),
    openWhisperModal: (preselectSeats) => {
      const st = get();
      if (!st.isOnline || st.matchOver) return;
      const connectedHumanOpponents = [0, 1, 2, 3, 4].filter((seatIdx) => {
        if (seatIdx === st.mySeat) return false;
        const seat = st.onlineSeats[seatIdx];
        return !!seat && !seat.isAI && !!seat.connected;
      });
      let selected: number[] = [];
      if (Array.isArray(preselectSeats) && preselectSeats.length > 0) {
        selected = preselectSeats.filter((s) => connectedHumanOpponents.includes(s));
      } else if (connectedHumanOpponents.length > 0) {
        selected = [connectedHumanOpponents[0]];
      }
      set({
        whisperModalOpen: true,
        whisperPreselectSeats: selected,
        ...(st.activeModal === 'profile' ? { activeModal: null } : {}),
      });
    },
    closeWhisperModal: () => set({ whisperModalOpen: false, whisperPreselectSeats: [] }),
    setSecretWhispers: (secretWhispers) => set({ secretWhispers }),

    showToast: (text) => {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toastText: text });
      toastTimer = setTimeout(() => set({ toastText: null }), 2200);
    },

    updatePrefs: (patch) => {
      const next = { ...get().prefs, ...patch };
      runSdk.savePreferences(next);
      sfx.setVolumes(next.volume, next.musicVolume);
      if (patch.aiVoiceMuted !== undefined) {
        sfx.setAiVoiceMuted(next.aiVoiceMuted);
        if (next.aiVoiceMuted) set({ speakingSeat: null });
      }
      if (patch.musicId !== undefined) {
        sfx.playMusic(next.musicId);
      }
      if (patch.language !== undefined) {
        void preloadDialogueLanguage(next.language);
      }
      set({ prefs: next });
    },

    updatePlayer: (idx, patch) => {
      const next = get().players.map((p, i) => (i === idx ? { ...p, ...patch } : p));
      runSdk.savePlayers(next);
      set({ players: next });
    },

    resetWinStats: () => {
      const fresh = getDefaultWinStats();
      runSdk.saveWinStats(fresh);
      set({ winStats: fresh });
      get().showToast('Statistics & balances reset.');
    },

    setSceneHandlers: (sceneHandlers) => set({ sceneHandlers }),
    selectDieIndex: (idx) => {
      if (get().turnAutoPlay) return;
      set({ selectedDieIndex: idx });
    },

    startLocalMatch: (tournament) => {
      if (tournament) {
        get().showToast('🏆 Tournament Mode is Coming Soon!');
        return;
      }
      clearLocalTimers();
      const st = get();
      const nextStats: WinStats = {
        ...st.winStats,
        balances: { ...st.winStats.balances },
      };

      if (tournament) {
        for (const p of st.players) {
          const bal = nextStats.balances[p.name] ?? 5;
          if (bal < 1) {
            get().showToast(`${translate(st.prefs.language, 'insufficient_funds')} ${p.name}`);
            return;
          }
        }
        for (const p of st.players) {
          nextStats.balances[p.name] = (nextStats.balances[p.name] ?? 5) - 1;
        }
        runSdk.saveWinStats(nextStats);
        get().showToast('🏆 Tournament Started: $1 entry fee per player');
      }

      sfx.preloadCore();
      if (st.prefs.musicId && st.prefs.musicId !== 'none') {
        sfx.playMusic(st.prefs.musicId);
      }

      set({
        screen: 'playing',
        activeModal: null,
        gameStarted: true,
        matchOver: false,
        isTournament: tournament,
        isOnline: false,
        winStats: nextStats,
        currentPlayer: 0,
        dice: [1, 6],
        movesAvailable: [],
        selectedDieIndex: null,
        hasRolled: false,
        isRolling: false,
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
        pawns: createInitialPawns(),
        playerStats: createInitialPlayerStats(),
        wishUsedThisMatch: [false, false, false, false, false],
        turnSecondsLeft: st.prefs.turnTimerEnabled ? st.prefs.turnTimerDuration : 0,
        turnAutoPlay: false,
        pendingCoachMove: null,
        pendingGulMove: null,
        winner: null,
        rankings: [],
        bannerText: `${st.players[0].name}: ${translate(st.prefs.language, 'roll_hint')}`,
      });

      if (st.players[0].isAI) {
        scheduleAITurnIfNeeded();
      } else {
        const aiSeats = st.players
          .map((p, idx) => ({ p, idx }))
          .filter((x) => x.p.isAI);
        if (aiSeats.length > 0) {
          const greeter = aiSeats[Math.floor(Math.random() * aiSeats.length)];
          emitBanter(greeter.idx, 'banter', 1100);
        }
      }
    },

    exitMatchToMenu: () => {
      clearLocalTimers();
      if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
      }
      sfx.stopMusic();
      sfx.stopSpeech();
      sfx.setLiveVoiceActive(false);
      set({
        screen: 'menu',
        activeModal: null,
        toastText: null,
        gameStarted: false,
        matchOver: false,
        isOnline: false,
        turnAutoPlay: false,
        pendingCoachMove: null,
        pendingGulMove: null,
        roomCode: null,
        mySeat: null,
        speakingSeat: null,
        voiceCallJoined: false,
        voiceCallConnecting: false,
        voiceCallMuted: false,
        voiceCallParticipants: [],
        voiceSpeakingSeats: [],
      });
    },

    rollLocalDice: (useWish = false, fromAutoPlay = false) => {
      const st = get();
      if (st.isOnline || !st.gameStarted || st.matchOver || st.hasRolled || st.isRolling) return;
      if (st.turnAutoPlay && !fromAutoPlay) return;
      const pIdx = st.currentPlayer;
      const player = st.players[pIdx];

      let rawDice: [number, number] = rollDicePair();
      const wishFlags = [...st.wishUsedThisMatch];

      if (useWish && !wishFlags[pIdx] && !player.isAI && !st.turnAutoPlay && !fromAutoPlay) {
        let w1 = Math.min(6, Math.max(1, Number(player.wish[0]) || 6));
        let w2 = Math.min(6, Math.max(1, Number(player.wish[1]) || 5));
        if (w1 === 6 && w2 === 6) w2 = 5;
        rawDice = [w1, w2];
        wishFlags[pIdx] = true;
      }

      sfx.play('dice');
      const lucky7 = applyLucky7IfEligible(st.pawns, pIdx, rawDice, false);
      const finalDice = lucky7.applied ? lucky7.dice : rawDice;
      const extraEarned = finalDice[0] === 6 && finalDice[1] === 6;
      const extraReason: ExtraTurnReason = lucky7.applied
        ? 'lucky7'
        : extraEarned
          ? 'double6'
          : null;

      set({
        isRolling: true,
        dice: finalDice,
        wishUsedThisMatch: wishFlags,
        lucky7UsedThisTurn: lucky7.applied,
        extraTurnEarned: extraEarned,
        extraTurnReason: extraReason,
        turnCapturedPawn: false,
        bannerText: `${player.name} rolling...`,
      });

      rollTimeout = setTimeout(() => {
        const cur = get();
        if (!cur.gameStarted || cur.matchOver) return;
        const moves = [finalDice[0], finalDice[1]];
        const ob = evaluateCaptureObligation(cur.pawns, pIdx, moves, finalDice);
        const startCaps = [...ob.singleCaptures, ...ob.combinedCaptures];

        if (lucky7.applied) {
          sfx.play('lucky7');
          cur.showToast('✨ Lucky 7 Bonus! Converted into 6 + 6 + Extra Turn!');
          emitBanter(pIdx, 'lucky7');
        } else if (finalDice[0] === 6 && finalDice[1] === 6) {
          emitBanter(pIdx, 'lucky_roll');
        } else if (player.isAI) {
          emitBanter(pIdx, 'roll');
        }

        const hasMoves = canAnyPawnMove(cur.pawns, pIdx, moves, finalDice);
        if (hasMoves && ob.requiredCaptures > 0) {
          sfx.play('heartbeat', 0.92);
        }
        set({
          isRolling: false,
          hasRolled: true,
          movesAvailable: hasMoves ? moves : [],
          selectedDieIndex: hasMoves ? 0 : null,
          turnStartCaptures: startCaps,
          turnRequiredCaptures: hasMoves ? ob.requiredCaptures : 0,
          turnCapturesMade: 0,
          turnCandidatePawns: hasMoves ? ob.candidatePawns : [],
          turnMidTurnMissedCandidates: [],
          turnCapturingPawns: [],
          bannerText: hasMoves
            ? cur.turnAutoPlay
              ? "⏱️ Time's up! Auto-playing..."
              : `${player.name}: ${translate(cur.prefs.language, 'pawn_select')}`
            : `${player.name}: ${translate(cur.prefs.language, 'no_moves')}`,
        });

        if (!hasMoves) {
          passTimeout = setTimeout(advanceLocalTurn, cur.turnAutoPlay ? 1150 : 1650);
        } else if (player.isAI) {
          scheduleAITurnIfNeeded(1320);
        } else if (cur.turnAutoPlay) {
          scheduleAITurnIfNeeded(660);
        }
      }, 900);
    },

    handleLocalPawnTap: (pIdx, pawnIdx) => {
      const st = get();
      if (st.isOnline || st.turnAutoPlay || pIdx !== st.currentPlayer || !st.hasRolled || st.isRolling || st.matchOver) return;
      if (st.players[pIdx].isAI) return;

      const pawn = st.pawns[pIdx][pawnIdx];
      if (!pawn) return;

      let chosenSteps: number | null = null;
      let chosenDieIdx: number | 'combined' = -1;

      if (pawn.status === 'home') {
        const sixIdx = st.movesAvailable.findIndex((s) => s === 6);
        if (sixIdx >= 0) {
          chosenDieIdx = sixIdx;
          chosenSteps = 6;
        }
      } else {
        const isLone = isLoneTokenOnTrack(st.pawns, pIdx);
        const total = st.movesAvailable.reduce((a, b) => a + b, 0);
        const canCombined =
          isLone && st.movesAvailable.length > 1 && canMovePawn(st.pawns, pIdx, pawnIdx, total, st.dice, st.movesAvailable);

        const sel = st.selectedDieIndex;
        const canSelected =
          sel !== null &&
          st.movesAvailable[sel] !== undefined &&
          canMovePawn(st.pawns, pIdx, pawnIdx, st.movesAvailable[sel], st.dice, st.movesAvailable);
        const fallbackIdx = st.movesAvailable.findIndex((s) =>
          canMovePawn(st.pawns, pIdx, pawnIdx, s, st.dice, st.movesAvailable),
        );

        if (canSelected && sel !== null) {
          chosenDieIdx = sel;
          chosenSteps = st.movesAvailable[sel];
        } else if (fallbackIdx >= 0) {
          chosenDieIdx = fallbackIdx;
          chosenSteps = st.movesAvailable[fallbackIdx];
        } else if (canCombined) {
          chosenDieIdx = 'combined';
          chosenSteps = total;
        }
      }

      if (chosenSteps !== null && chosenDieIdx !== -1) {
        executeLocalMoveStep(pawnIdx, chosenSteps, chosenDieIdx, false);
      }
    },

    handleLocalBaseTap: (pIdx) => {
      const st = get();
      if (st.isOnline || st.turnAutoPlay || pIdx !== st.currentPlayer || !st.hasRolled || st.isRolling) return;
      if (!st.movesAvailable.includes(6)) return;
      const homeIdx = st.pawns[pIdx].findIndex((p) => p.status === 'home');
      if (homeIdx >= 0) {
        get().handleLocalPawnTap(pIdx, homeIdx);
      }
    },

    attemptOnlineMoveWithCoachCheck: (pawnIdx, steps, dieIdx) => {
      const st = get();
      if (!st.isOnline || st.turnAutoPlay || st.mySeat !== st.currentPlayer) return false;
      if (shouldShowCaptureWarning(st, st.currentPlayer, pawnIdx, steps, dieIdx)) {
        sfx.play('heartbeat', 0.85);
        set({
          pendingCoachMove: { pawnIdx, steps, dieIdx },
          activeModal: 'coachSkip',
        });
        return false;
      }
      return true;
    },

    confirmCoachSkipMove: () => {
      const st = get();
      if (st.turnAutoPlay) return;
      const pending = st.pendingCoachMove;
      set({ pendingCoachMove: null, activeModal: null });
      if (!pending) return;
      if (!st.isOnline) {
        executeLocalMoveStep(pending.pawnIdx, pending.steps, pending.dieIdx, true);
      }
    },

    confirmGulChoice: (choice) => {
      const st = get();
      if (st.turnAutoPlay) return;
      const pending = st.pendingGulMove;
      set({ pendingGulMove: null, activeModal: null });
      if (!pending) return;

      if (choice === 'gul') {
        executeLocalMoveStep(pending.pawnIdx, pending.steps, pending.dieIdx, true);
      } else {
        const nextMoves = [...st.movesAvailable];
        if (pending.dieIdx === 'combined') nextMoves.length = 0;
        else if (typeof pending.dieIdx === 'number' && pending.dieIdx >= 0) nextMoves.splice(pending.dieIdx, 1);

        const canMoveRem = nextMoves.length > 0 && canAnyPawnMove(st.pawns, st.currentPlayer, nextMoves, st.dice);
        if (!canMoveRem) {
          const nextPawns = st.pawns.map((row) => row.map((p) => ({ ...p })));
          const nextStats = st.playerStats.map((s) => ({ ...s }));
          const penalized = checkCompulsoryCapturePenalties(
            nextPawns,
            nextStats,
            st.currentPlayer,
            st.turnRequiredCaptures,
            st.turnCapturesMade,
            st.turnCandidatePawns,
            st.turnMidTurnMissedCandidates,
            st.turnCapturingPawns,
          );
          let banner = 'Passed Gul entry! Next turn...';
          if (penalized.length > 0) {
            const pName = st.players[st.currentPlayer]?.name || 'Player';
            banner =
              penalized.length > 1
                ? `⚠️ ${pName}: Missed capture! ${penalized.length} tokens sent back to base.`
                : `⚠️ ${pName}: ${translate(st.prefs.language, 'missed_capture_desc')}`;
            sfx.play('whoosh', 0.8);
            emitBanter(st.currentPlayer, 'penalty');
          }
          set({ pawns: nextPawns, playerStats: nextStats, movesAvailable: [], bannerText: banner });
          passTimeout = setTimeout(advanceLocalTurn, 750);
        } else {
          set({ movesAvailable: nextMoves, selectedDieIndex: 0, bannerText: 'Passed! Choose remaining die.' });
        }
      }
    },

    tickLocalTimer: () => {
      const st = get();
      if (!st.gameStarted || st.matchOver || st.screen !== 'playing') return;

      if (st.isOnline) {
        if (st.onlineTimerConfig.enabled && st.turnExpiresAt && !st.turnAutoPlay) {
          const syncedNow = Date.now() + st.serverClockOffsetMs;
          const remaining = Math.max(0, Math.ceil((st.turnExpiresAt - syncedNow) / 1000));
          if (remaining !== st.turnSecondsLeft) {
            set({ turnSecondsLeft: remaining });
          }
        } else if (st.turnAutoPlay && st.turnSecondsLeft !== 0) {
          set({ turnSecondsLeft: 0 });
        }
        return;
      }

      if (!st.prefs.turnTimerEnabled || st.prefs.turnTimerDuration <= 0) return;
      if (st.turnAutoPlay) return;
      // Pause countdown only for non-gameplay overlays; never let coachSkip or gulPass stall the clock
      if (st.activeModal && st.activeModal !== 'coachSkip' && st.activeModal !== 'gulPass') return;

      if (st.turnSecondsLeft <= 1) {
        // Case A: Timed out on 'gulPass' -> close modal and auto-choose Gul (Enter Centre)
        if (st.pendingGulMove) {
          const pending = st.pendingGulMove;
          set({
            turnAutoPlay: true,
            turnSecondsLeft: 0,
            activeModal: null,
            pendingGulMove: null,
            pendingCoachMove: null,
            bannerText: "⏱️ Time's up! Auto-entering Centre Home...",
          });
          get().showToast("⏱️ Time's up! Auto-playing...");
          executeLocalMoveStep(pending.pawnIdx, pending.steps, pending.dieIdx, true);
          return;
        }

        // Case B: Timed out before rolling -> auto-roll and auto-play all usable dice via AI
        if (!st.hasRolled && !st.isRolling) {
          set({
            turnAutoPlay: true,
            turnSecondsLeft: 0,
            activeModal: null,
            pendingCoachMove: null,
            pendingGulMove: null,
            bannerText: "⏱️ Time's up! Auto-playing...",
          });
          get().showToast("⏱️ Time's up! Auto-playing...");
          get().rollLocalDice(false, true);
          return;
        }

        // Case B2: Dice already mid-roll when timer hits 0 -> arm turnAutoPlay so roll settle runs AI moves
        if (!st.hasRolled && st.isRolling) {
          set({
            turnAutoPlay: true,
            turnSecondsLeft: 0,
            activeModal: null,
            pendingCoachMove: null,
            pendingGulMove: null,
            bannerText: "⏱️ Time's up! Auto-playing...",
          });
          get().showToast("⏱️ Time's up! Auto-playing...");
          return;
        }

        // Case C: Timed out after rolling with remaining dice -> dismiss prompts and auto-play via AI
        if (st.hasRolled && st.movesAvailable.length > 0) {
          set({
            turnAutoPlay: true,
            turnSecondsLeft: 0,
            activeModal: null,
            pendingCoachMove: null,
            pendingGulMove: null,
            bannerText: "⏱️ Time's up! Auto-playing...",
          });
          get().showToast("⏱️ Time's up! Auto-playing...");
          scheduleAITurnIfNeeded(220);
          return;
        }

        // Fallback if already rolled with 0 usable moves and no pass pending
        set({
          turnAutoPlay: true,
          turnSecondsLeft: 0,
          activeModal: null,
          pendingCoachMove: null,
          pendingGulMove: null,
        });
        if (!passTimeout) {
          advanceLocalTurn();
        }
      } else {
        set({ turnSecondsLeft: st.turnSecondsLeft - 1 });
      }
    },

    triggerReaction: (seatIdx, emoji) => {
      get().sceneHandlers.spawnReaction?.(seatIdx, emoji);
      sfx.play('notification', 0.4);
    },

    speakPlayerText: (seatIdx, text) => {
      const st = get();
      const player = st.players[seatIdx];
      if (st.prefs.volume <= 0.01) {
        st.sceneHandlers.showSpeech?.(seatIdx, text);
        return;
      }
      sfx.speakTTS(text, st.prefs.language, {
        isAi: false,
        gender: player?.gender,
        seatIdx,
        priority: 'high',
        onStart: () => {
          get().sceneHandlers.showSpeech?.(seatIdx, text);
          set({ speakingSeat: seatIdx });
        },
        onEnd: () => {
          if (get().speakingSeat === seatIdx) set({ speakingSeat: null });
        },
      });
    },

    toggleAiVoiceMute: () => {
      const st = get();
      const nextMuted = !st.prefs.aiVoiceMuted;
      get().updatePrefs({ aiVoiceMuted: nextMuted });
      get().showToast(nextMuted ? '🔇 AI voices muted' : '🗣️ AI voices unmuted');
    },

    toggleSeatMute: (seatIdx) => {
      const st = get();
      const prev = st.prefs.mutedSeats || [];
      const exists = prev.includes(seatIdx);
      const nextList = exists ? prev.filter((id) => id !== seatIdx) : [...prev, seatIdx];
      get().updatePrefs({ mutedSeats: nextList });
      if (!exists) {
        sfx.removeQueuedSeat(seatIdx);
        if (st.speakingSeat === seatIdx) {
          sfx.skipCurrentSpeech();
          if (get().speakingSeat === seatIdx) {
            set({ speakingSeat: null });
          }
        }
        const nextIncoming = { ...get().incomingWhispers };
        delete nextIncoming[seatIdx];
        const nextBadges = { ...get().whisperBadges };
        delete nextBadges[seatIdx];
        const existingTimer = whisperBadgeTimers.get(seatIdx);
        if (existingTimer) {
          clearTimeout(existingTimer);
          whisperBadgeTimers.delete(seatIdx);
        }
        set((cur) => ({
          incomingWhispers: nextIncoming,
          whisperBadges: nextBadges,
          pendingVoiceNotes: cur.pendingVoiceNotes.filter((v) => v.seatIndex !== seatIdx),
          voiceSeatVolumes: { ...cur.voiceSeatVolumes, [seatIdx]: 0 },
        }));
      } else if ((get().voiceSeatVolumes[seatIdx] ?? 1) === 0) {
        set((cur) => ({
          voiceSeatVolumes: { ...cur.voiceSeatVolumes, [seatIdx]: 1 },
        }));
      }
      const name = stripSeatTag(st.players[seatIdx]?.name || `Player ${seatIdx + 1}`);
      get().showToast(exists ? `🔊 Unmuted ${name}` : `🔇 Muted ${name}`);
    },

    triggerAiLine: (seatIdx, event = 'banter') => {
      emitBanter(seatIdx, event, 0, true);
    },

    // Authoritative server sync handlers
      setRoomJoined: ({ roomCode, seatIndex, amHost, roomState }) => {
      const st = get();
      sfx.preloadCore();
      const clockOffset =
        typeof roomState.serverTime === 'number' ? roomState.serverTime - Date.now() : 0;
      const hostIdx =
        typeof roomState.hostSeatIndex === 'number' ? roomState.hostSeatIndex : 0;
      const nextPlayers = st.players.map((p, idx) => {
        const seat = roomState.seats?.[idx];
        return seat
          ? {
              ...p,
              name: seat.name,
              color: seat.color,
              isAI: seat.isAI,
              personality: seat.personality,
              gender: seat.gender,
              wish: seat.wish,
              icon: seat.icon,
            }
          : p;
      });
      set({
        isOnline: true,
        roomCode,
        mySeat: seatIndex,
        hostSeatIndex: hostIdx,
        amHost: typeof roomState.hostSeatIndex === 'number' ? seatIndex === hostIdx : amHost,
        fillBots: roomState.fillBots,
        secretWhispers: !!roomState.secretWhispers,
        onlineTimerConfig: roomState.timerConfig,
        onlineSeats: roomState.seats,
        players: nextPlayers,
        pendingInviteCode: null,
        roomError: null,
        lastActionSeq: roomState.actionSeq ?? 0,
        serverClockOffsetMs: clockOffset,
        ...(Array.isArray(roomState.voiceParticipants)
          ? { voiceCallParticipants: roomState.voiceParticipants }
          : {}),
        activeModal: roomState.started ? null : 'lobby',
        screen: roomState.started ? 'playing' : st.screen,
      });
      if (roomState.started && roomState.match) {
        get().applyServerRoomUpdate({ code: roomCode, ...roomState });
      }
    },

    applyServerRoomUpdate: (roomState) => {
      const st = get();
      if (
        typeof roomState.actionSeq === 'number' &&
        st.lastActionSeq > 0 &&
        roomState.actionSeq < st.lastActionSeq
      ) {
        // Drop out-of-order / stale server update
        return;
      }

      const clockOffset =
        typeof roomState.serverTime === 'number'
          ? roomState.serverTime - Date.now()
          : st.serverClockOffsetMs;
      const hostIdx =
        typeof roomState.hostSeatIndex === 'number' ? roomState.hostSeatIndex : st.hostSeatIndex;

      const nextPlayers = st.players.map((p, idx) => {
        const seat = roomState.seats?.[idx];
        return seat
          ? {
              ...p,
              name: seat.name,
              color: seat.color,
              isAI: seat.isAI,
              personality: seat.personality,
              gender: seat.gender,
              wish: seat.wish,
              icon: seat.icon,
            }
          : p;
      });

      const patch: Partial<GameStoreState> = {
        isOnline: true,
        roomCode: roomState.code,
        hostSeatIndex: hostIdx,
        amHost: st.mySeat !== null ? st.mySeat === hostIdx : st.amHost,
        fillBots: roomState.fillBots,
        ...(typeof roomState.secretWhispers === 'boolean'
          ? { secretWhispers: roomState.secretWhispers }
          : {}),
        onlineTimerConfig: roomState.timerConfig,
        onlineSeats: roomState.seats,
        players: nextPlayers,
        lastActionSeq: roomState.actionSeq ?? st.lastActionSeq,
        serverClockOffsetMs: clockOffset,
        ...(Array.isArray(roomState.voiceParticipants)
          ? { voiceCallParticipants: roomState.voiceParticipants }
          : {}),
        wishUsedThisMatch: Array.from({ length: 5 }, (_, i) => !!roomState.seats?.[i]?.wishUsed),
      };

      if (roomState.started && roomState.match) {
        const m = roomState.match as Record<string, unknown>;
        const nextMoves = Array.isArray(m.movesAvailable) ? (m.movesAvailable as number[]) : [];
        const hasRolledNow = !!m.hasRolled;
        const serverAutoPlay = !!m.turnAutoPlay;
        const serverPendingGul = (m.pendingGul as { seatIdx?: number } | null) || null;
        const nextCurrent = Number(m.currentPlayer) || 0;
        const expiresAt = typeof m.turnExpiresAt === 'number' ? m.turnExpiresAt : null;
        const syncedSeconds = serverAutoPlay
          ? 0
          : expiresAt
            ? Math.max(0, Math.ceil((expiresAt - (Date.now() + clockOffset)) / 1000))
            : Number(m.turnSecondsLeft) || 0;

        patch.screen = 'playing';
        patch.gameStarted = true;
        patch.matchOver = !!roomState.matchEnded;
        patch.currentPlayer = nextCurrent;
        patch.dice = (m.dice as [number, number]) || [1, 6];
        patch.movesAvailable = nextMoves;
        patch.hasRolled = hasRolledNow;
        patch.turnAutoPlay = serverAutoPlay;
        if (!hasRolledNow) {
          patch.isRolling = false;
        }
        if (nextMoves.length === 0) {
          patch.selectedDieIndex = null;
        } else if (st.selectedDieIndex === null || st.selectedDieIndex >= nextMoves.length) {
          patch.selectedDieIndex = 0;
        }
        patch.pawns = (m.pawns as PawnState[][]) || st.pawns;
        patch.playerStats = (m.playerStats as PlayerStats[]) || st.playerStats;
        patch.turnExpiresAt = expiresAt;
        patch.turnSecondsLeft = syncedSeconds;
        patch.winner = typeof m.winner === 'number' ? m.winner : null;
        patch.rankings = Array.isArray(m.rankings) ? (m.rankings as RankingEntry[]) : [];
        patch.bannerText = typeof m.lastEventText === 'string' ? m.lastEventText : st.bannerText;
        if (st.activeModal === 'lobby') patch.activeModal = null;

        // Auto-close coachSkip/gulPass prompts if server switched to timeout auto-play, changed turn, or cleared pendingGul
        if (
          (st.activeModal === 'coachSkip' || st.activeModal === 'gulPass') &&
          (serverAutoPlay ||
            nextCurrent !== st.currentPlayer ||
            (st.activeModal === 'gulPass' && (!serverPendingGul || serverPendingGul.seatIdx !== st.mySeat)))
        ) {
          patch.activeModal = null;
          patch.pendingCoachMove = null;
          patch.pendingGulMove = null;
        }
      }

      const prevAutoPlay = st.turnAutoPlay;
      const prevHasRolled = st.hasRolled;
      const prevMovesLen = st.movesAvailable.length;
      const wasStarted = st.gameStarted;
      const prevPawns = st.pawns;
      const prevPlayerStats = st.playerStats;

      set(patch);

      if (roomState.started && roomState.match && patch.hasRolled === false) {
        sfx.stopHeartbeat();
      }

      if (wasStarted && roomState.started && roomState.match && patch.pawns) {
        const nextPawns = patch.pawns;
        const nextStats = patch.playerStats || prevPlayerStats;
        let capturedNow = false;
        let penaltyOrSacrifice = false;
        let movedForward = false;

        for (let i = 0; i < 5; i++) {
          if ((nextStats[i]?.captures_made || 0) > (prevPlayerStats[i]?.captures_made || 0)) {
            capturedNow = true;
          }
          if ((nextStats[i]?.penalties || 0) > (prevPlayerStats[i]?.penalties || 0)) {
            penaltyOrSacrifice = true;
          }
          for (let j = 0; j < 4; j++) {
            const oldP = prevPawns[i]?.[j];
            const newP = nextPawns[i]?.[j];
            if (!oldP || !newP) continue;
            if (
              newP.pos > oldP.pos ||
              (oldP.status === 'home' && newP.status !== 'home')
            ) {
              movedForward = true;
            }
          }
        }
        const evText = typeof patch.bannerText === 'string' ? patch.bannerText : '';
        if (!penaltyOrSacrifice && evText.toLowerCase().includes('sacrifice')) {
          penaltyOrSacrifice = true;
        }

        if (capturedNow) {
          sfx.play('capture');
        } else if (movedForward) {
          sfx.play('move', 0.85);
        }
        if (penaltyOrSacrifice && !capturedNow) {
          sfx.play('whoosh', 0.85);
        }

        const nextMovesArr = patch.movesAvailable || [];
        const nextCurrentIdx = patch.currentPlayer ?? st.currentPlayer;
        const nextDicePair = patch.dice || st.dice;
        if (
          patch.hasRolled &&
          nextMovesArr.length > 0 &&
          !capturedNow &&
          !patch.turnAutoPlay &&
          (!prevHasRolled || prevMovesLen === 0 || movedForward)
        ) {
          const obNow = evaluateCaptureObligation(nextPawns, nextCurrentIdx, nextMovesArr, nextDicePair);
          if (obNow.requiredCaptures > 0) {
            sfx.play('heartbeat', 0.92);
          }
        }
      }

      if (patch.turnAutoPlay && !prevAutoPlay) {
        get().showToast("⏱️ Time's up! Auto-playing...");
      }
    },

    applyServerDiceRoll: ({ dice, player, isLucky7, isAutoPlay }) => {
      sfx.play('dice');
      if (isLucky7) {
        sfx.play('lucky7');
        get().showToast('✨ Lucky 7 Bonus! Converted to 6 + 6 + Extra Turn!');
      }
      if (rollTimeout) clearTimeout(rollTimeout);
      const st = get();
      const closePrompt = st.activeModal === 'coachSkip' || st.activeModal === 'gulPass';
      set({
        isRolling: true,
        dice,
        currentPlayer: player,
        ...(isAutoPlay ? { turnAutoPlay: true, turnSecondsLeft: 0 } : {}),
        ...(closePrompt ? { activeModal: null, pendingCoachMove: null, pendingGulMove: null } : {}),
      });
      if (isAutoPlay && !st.turnAutoPlay) {
        get().showToast("⏱️ Time's up! Auto-playing...");
      }
      rollTimeout = setTimeout(() => {
        set({ isRolling: false });
      }, 820);
    },

    applyServerMatchEnded: ({ winner, rankings }) => {
      sfx.play('win');
      sfx.setLiveVoiceActive(false);
      const st = get();
      const nextPlayerMatches = { ...(st.winStats.playerMatches || {}) };
      if (st.mySeat !== null && st.players[st.mySeat] && !st.players[st.mySeat].isAI) {
        const clean = stripSeatTag(st.players[st.mySeat].name);
        nextPlayerMatches[clean] = (nextPlayerMatches[clean] || 0) + 1;
      }
      const nextWinStats: WinStats = {
        ...st.winStats,
        matchesPlayed: (st.winStats.matchesPlayed || 0) + 1,
        playerMatches: nextPlayerMatches,
      };
      runSdk.saveWinStats(nextWinStats);

      whisperBadgeTimers.forEach((t) => clearTimeout(t));
      whisperBadgeTimers.clear();
      sfx.setRoutineAiPaused(false);
      st.chatMessages.forEach((m) => {
        if (m.audioData) {
          sfx.evictAudioClipCache(m.audioData);
          revokeAudioUrl(m.audioData);
        }
      });
      Object.values(st.incomingWhispers).forEach((w) => {
        sfx.evictAudioClipCache(w.clip);
        revokeAudioUrl(w.clip);
      });
      set({
        matchOver: true,
        winner,
        rankings,
        winStats: nextWinStats,
        turnExpiresAt: null,
        turnAutoPlay: false,
        pendingCoachMove: null,
        pendingGulMove: null,
        voiceCallJoined: false,
        voiceCallConnecting: false,
        voiceCallMuted: false,
        voiceCallParticipants: [],
        voiceSpeakingSeats: [],
        incomingWhispers: {},
        whisperBadges: {},
        pendingVoiceNotes: [],
        whisperRecordingSeat: null,
        whisperModalOpen: false,
        whisperPreselectSeats: [],
        activeModal: 'victory',
      });
    },

    playSyncedAiDialogue: (seatIdx, event, lineIdx) => {
      const st = get();
      if (!st.isOnline || (st.matchOver && event !== 'win')) return;
      const player = st.players[seatIdx];
      if (!player || !player.isAI) return;

      const dedupKey = `${seatIdx}:${event}:${lineIdx}`;
      const now = Date.now();
      if (lastSyncedDialogueKey === dedupKey && now - lastSyncedDialogueAt < 2000) {
        return;
      }
      lastSyncedDialogueKey = dedupKey;
      lastSyncedDialogueAt = now;

      st.sceneHandlers.spawnReaction?.(seatIdx, getPersonalityEmote(player.personality));
      if (st.prefs.aiVoiceMuted || st.prefs.mutedSeats.includes(seatIdx) || st.prefs.volume <= 0.01) {
        return;
      }

      const runDialogue = () => {
        const cur = get();
        if (!cur.isOnline || (cur.matchOver && event !== 'win')) return;
        const p = cur.players[seatIdx];
        if (!p || !p.isAI) return;
        if (cur.prefs.aiVoiceMuted || cur.prefs.mutedSeats.includes(seatIdx) || cur.prefs.volume <= 0.01) {
          return;
        }
        const isHighPriority = event !== 'turn' && event !== 'roll';
        if (!isHighPriority && sfx.isVoiceBusy()) {
          return;
        }
        const line = getAILine(cur.prefs.language, event, lineIdx);
        sfx.speakTTS(line, cur.prefs.language, {
          isAi: true,
          gender: p.gender,
          seatIdx,
          priority: isHighPriority ? 'high' : 'normal',
          staticClipUrl: getStaticAiClipUrl(cur.prefs.language, event, lineIdx),
          onStart: () => {
            get().sceneHandlers.showSpeech?.(seatIdx, line);
            set({ speakingSeat: seatIdx });
          },
          onEnd: () => {
            if (get().speakingSeat === seatIdx) set({ speakingSeat: null });
          },
        });
      };

      void preloadDialogueLanguage(st.prefs.language).then(runDialogue);
    },

    appendChatMessage: (msg) => {
      const st = get();
      const maxMsgs = 50;
      const evictCount = Math.max(0, st.chatMessages.length + 1 - maxMsgs);
      for (let i = 0; i < evictCount; i++) {
        const oldUrl = st.chatMessages[i]?.audioData;
        if (oldUrl) sfx.evictAudioClipCache(oldUrl);
        revokeAudioUrl(oldUrl);
      }
      const next = [...st.chatMessages.slice(-(maxMsgs - 1)), msg];
      set({ chatMessages: next });
      const kind = msg.kind || (msg.audioData ? 'voice' : 'text');
      if (kind === 'whisper_in' || kind === 'whisper_out' || kind === 'whisper_notice') {
        return;
      }
      if (msg.audioData) {
        void sfx.preloadAudioClip(msg.audioData);
        const cleanSender = stripSeatTag(msg.sender || `Player ${msg.seatIndex + 1}`);
        st.sceneHandlers.showSpeech?.(msg.seatIndex, `🎤 Voice (${msg.duration || 2}s)`);

        if (msg.seatIndex !== st.mySeat) {
          const nextPending = [...st.pendingVoiceNotes.slice(-2), msg];
          set({ pendingVoiceNotes: nextPending });
          const canAutoPlay =
            st.prefs.autoPlayVoiceNotes !== false &&
            !st.prefs.mutedSeats.includes(msg.seatIndex) &&
            !st.voiceCallJoined;
          if (canAutoPlay) {
            void sfx.playAudioClip(msg.audioData, {
              gain: 2.0,
              onStart: () => {
                get().showToast(`🔊 Playing voice note from ${cleanSender}`);
              },
              onEnded: () => {
                set((cur) => ({
                  pendingVoiceNotes: cur.pendingVoiceNotes.filter((v) => v.id !== msg.id),
                }));
              },
              onError: () => {
                get().showToast(`🎤 Voice note from ${cleanSender} — tap pill to listen`);
              },
            });
          } else {
            sfx.play('notification', 0.35);
            get().showToast(`🎤 Voice note from ${cleanSender} — tap pill to listen`);
          }
        }
      } else {
        st.sceneHandlers.showSpeech?.(msg.seatIndex, msg.text);
      }
    },

    appendOutgoingWhisper: ({ id, toSeats, targetNames, audioUrl, duration, timestamp }) => {
      const st = get();
      const myIdx = typeof st.mySeat === 'number' ? st.mySeat : 0;
      const myName = st.players[myIdx]?.name || 'You';
      const cleanTargets = targetNames.map((n) => stripSeatTag(n));
      void sfx.preloadAudioClip(audioUrl);
      get().appendChatMessage({
        id,
        sender: myName,
        text: `Whispered to ${cleanTargets.join(', ')}`,
        seatIndex: myIdx,
        timestamp,
        kind: 'whisper_out',
        audioData: audioUrl,
        duration,
        targetSeats: toSeats,
        targetNames: cleanTargets,
      });
    },

    playVoiceNote: (msgId) => {
      const st = get();
      const found =
        st.pendingVoiceNotes.find((m) => m.id === msgId) ||
        st.chatMessages.find((m) => m.id === msgId);
      if (!found?.audioData) return;
      const cleanSender = stripSeatTag(found.sender || `Player ${found.seatIndex + 1}`);
      const isWhisper = found.kind === 'whisper_in' || found.kind === 'whisper_out';
      if (isWhisper) {
        sfx.setRoutineAiPaused(true);
      }
      void sfx.playAudioClip(found.audioData, {
        gain: 2.0,
        onStart: () => {
          get().showToast(
            isWhisper
              ? `🤫 Replaying whisper (${found.duration || 2}s)...`
              : `🔊 Playing voice note from ${cleanSender}...`,
          );
        },
        onEnded: () => {
          if (isWhisper) sfx.setRoutineAiPaused(false);
          set((cur) => ({
            pendingVoiceNotes: cur.pendingVoiceNotes.filter((v) => v.id !== msgId),
          }));
        },
        onError: () => {
          if (isWhisper) sfx.setRoutineAiPaused(false);
          get().showToast(`🎤 Could not play audio clip on this device`);
        },
      });
    },

    dismissVoiceNote: (msgId) => {
      set((cur) => ({
        pendingVoiceNotes: cur.pendingVoiceNotes.filter((v) => v.id !== msgId),
      }));
    },

    setPendingServerGul: (choice) => {
      if (choice && get().turnAutoPlay) return;
      set({ pendingGulMove: choice, activeModal: choice ? 'gulPass' : null });
    },

    setRoomError: (roomError) => set({ roomError }),

    leaveOnlineRoomLocal: () => {
      try {
        localStorage.removeItem('ludo_room_code');
        localStorage.removeItem('ludo_player_token');
        localStorage.removeItem('ludo_seat_index');
        sessionStorage.removeItem('ludo_room_code');
        sessionStorage.removeItem('ludo_player_token');
        sessionStorage.removeItem('ludo_seat_index');
      } catch {}
      const st = get();
      st.chatMessages.forEach((m) => {
        if (m.audioData) sfx.evictAudioClipCache(m.audioData);
        revokeAudioUrl(m.audioData);
      });
      Object.values(st.incomingWhispers).forEach((w) => {
        sfx.evictAudioClipCache(w.clip);
        revokeAudioUrl(w.clip);
      });
      whisperBadgeTimers.forEach((t) => clearTimeout(t));
      whisperBadgeTimers.clear();
      sfx.stopSpeech();
      sfx.stopVoiceClip();
      sfx.setRoutineAiPaused(false);
      sfx.setLiveVoiceActive(false);
      set({
        isOnline: false,
        roomCode: null,
        mySeat: null,
        hostSeatIndex: 0,
        amHost: false,
        speakingSeat: null,
        onlineSeats: {},
        chatMessages: [],
        pendingVoiceNotes: [],
        pendingInviteCode: null,
        roomError: null,
        lastActionSeq: 0,
        turnExpiresAt: null,
        turnAutoPlay: false,
        pendingCoachMove: null,
        pendingGulMove: null,
        voiceCallJoined: false,
        voiceCallConnecting: false,
        voiceCallMuted: false,
        voiceCallParticipants: [],
        voiceSpeakingSeats: [],
        voiceMicLevel: 0,
        voiceMicTestActive: false,
        voicePeerStatuses: {},
        secretWhispers: false,
        incomingWhispers: {},
        whisperBadges: {},
        blockedWhisperSeats: [],
        whisperRecordingSeat: null,
        whisperModalOpen: false,
        whisperPreselectSeats: [],
        activeModal: null,
        screen: 'menu',
        gameStarted: false,
      });
    },

    setVoiceCallState: (patch) => set(patch),

    setVoiceCallParticipants: (voiceCallParticipants) => set({ voiceCallParticipants }),

    setVoiceSpeakingSeats: (voiceSpeakingSeats) => set({ voiceSpeakingSeats }),

    setVoicePeerStatuses: (voicePeerStatuses) => set({ voicePeerStatuses }),

    setVoiceSeatVolume: (seatIdx, volume) => {
      const clamped = Math.max(0, Math.min(1, Number(volume) || 0));
      const st = get();
      const nextVolumes = { ...st.voiceSeatVolumes, [seatIdx]: clamped };
      const prevMuted = st.prefs.mutedSeats || [];
      let nextMuted = prevMuted;
      if (clamped > 0 && prevMuted.includes(seatIdx)) {
        nextMuted = prevMuted.filter((id) => id !== seatIdx);
      } else if (clamped === 0 && !prevMuted.includes(seatIdx)) {
        nextMuted = [...prevMuted, seatIdx];
      }
      if (nextMuted !== prevMuted) {
        get().updatePrefs({ mutedSeats: nextMuted });
      }
      set({ voiceSeatVolumes: nextVolumes });
    },

    receiveWhisper: (whisper) => {
      const st = get();
      if (
        !st.isOnline ||
        st.matchOver ||
        whisper.fromSeat === st.mySeat ||
        st.prefs.mutedSeats.includes(whisper.fromSeat) ||
        st.blockedWhisperSeats.includes(whisper.fromSeat)
      ) {
        revokeAudioUrl(whisper.clip);
        return;
      }

      const cleanName = stripSeatTag(whisper.senderName || `Player ${whisper.fromSeat + 1}`);
      const badgeExpiry = Date.now() + 4500;
      const prevTimer = whisperBadgeTimers.get(whisper.fromSeat);
      if (prevTimer) clearTimeout(prevTimer);
      whisperBadgeTimers.set(
        whisper.fromSeat,
        setTimeout(() => {
          const cur = get();
          if (cur.whisperBadges[whisper.fromSeat] === badgeExpiry) {
            const nextBadges = { ...cur.whisperBadges };
            delete nextBadges[whisper.fromSeat];
            set({ whisperBadges: nextBadges });
          }
          whisperBadgeTimers.delete(whisper.fromSeat);
        }, 4550),
      );

      set((cur) => ({
        whisperBadges: {
          ...cur.whisperBadges,
          [whisper.fromSeat]: badgeExpiry,
        },
      }));

      get().appendChatMessage({
        id: whisper.id,
        sender: whisper.senderName,
        text: 'Whispered privately to you',
        seatIndex: whisper.fromSeat,
        timestamp: whisper.timestamp,
        kind: 'whisper_in',
        audioData: whisper.clip,
        duration: whisper.duration,
      });

      const triggerAutoPlay = async () => {
        await sfx.preloadAudioClip(whisper.clip);
        const cur = get();
        if (
          !cur.isOnline ||
          cur.matchOver ||
          cur.prefs.mutedSeats.includes(whisper.fromSeat) ||
          cur.blockedWhisperSeats.includes(whisper.fromSeat)
        ) {
          return;
        }
        sfx.setRoutineAiPaused(true);
        void sfx.playAudioClip(whisper.clip, {
          gain: 2.0,
          onStart: () => {
            get().showToast(`🤫 Whisper from ${cleanName} (${whisper.duration}s)`);
          },
          onEnded: () => {
            sfx.setRoutineAiPaused(false);
            const after = get();
            const pending = after.incomingWhispers[whisper.fromSeat];
            if (pending && pending.id === whisper.id) {
              const next = { ...after.incomingWhispers };
              delete next[whisper.fromSeat];
              set({ incomingWhispers: next });
            }
          },
          onError: () => {
            sfx.setRoutineAiPaused(false);
            set((after) => ({
              incomingWhispers: {
                ...after.incomingWhispers,
                [whisper.fromSeat]: whisper,
              },
            }));
            sfx.play('notification', 0.35);
            get().showToast(`🤫 Whisper from ${cleanName} — tap pill to play`);
          },
        });
      };

      void triggerAutoPlay();
    },

    playIncomingWhisper: (fromSeat) => {
      const st = get();
      const whisper = st.incomingWhispers[fromSeat];
      if (!whisper) return;
      const cleanName = stripSeatTag(whisper.senderName || `Player ${fromSeat + 1}`);
      const removeFallbackPill = () => {
        const cur = get();
        const existing = cur.incomingWhispers[fromSeat];
        if (existing && existing.id === whisper.id) {
          const next = { ...cur.incomingWhispers };
          delete next[fromSeat];
          set({ incomingWhispers: next });
        }
      };

      sfx.setRoutineAiPaused(true);
      void sfx.playAudioClip(whisper.clip, {
        gain: 2.0,
        onStart: () => {
          get().showToast(`🔊 Listening to whisper from ${cleanName}...`);
        },
        onEnded: () => {
          sfx.setRoutineAiPaused(false);
          removeFallbackPill();
        },
        onError: () => {
          sfx.setRoutineAiPaused(false);
          get().showToast(`🤫 Could not play whisper audio — tap again to retry`);
        },
      });
    },

    dismissIncomingWhisper: (fromSeat) => {
      const st = get();
      const existing = st.incomingWhispers[fromSeat];
      if (!existing) return;
      const next = { ...st.incomingWhispers };
      delete next[fromSeat];
      set({ incomingWhispers: next });
    },

    toggleBlockWhisperSeat: (seatIdx) => {
      const st = get();
      const prev = st.blockedWhisperSeats;
      const exists = prev.includes(seatIdx);
      const nextBlocked = exists ? prev.filter((s) => s !== seatIdx) : [...prev, seatIdx];
      const nextIncoming = { ...st.incomingWhispers };
      if (!exists && nextIncoming[seatIdx]) {
        delete nextIncoming[seatIdx];
      }
      set({ blockedWhisperSeats: nextBlocked, incomingWhispers: nextIncoming });
      const name = stripSeatTag(st.players[seatIdx]?.name || `Player ${seatIdx + 1}`);
      get().showToast(
        exists ? `✅ Unblocked whispers from ${name}` : `🚫 Blocked whispers from ${name}`,
      );
    },

    setWhisperRecordingSeat: (whisperRecordingSeat) => set({ whisperRecordingSeat }),
  };
});
