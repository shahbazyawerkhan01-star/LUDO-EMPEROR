import { create } from 'zustand';
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
  stripSeatTag,
  wouldMoveCapture,
  type CaptureCandidate,
  type ExtraTurnReason,
  type PawnState,
  type PlayerConfig,
  type PlayerStats,
  type RankingEntry,
} from '../game/rules';
import { getAILine, getPersonalityEmote, type BanterEvent } from '../game/banter';
import { sfx } from '../game/sfx';
import { getDefaultWinStats, runSdk, type SavedPreferences, type WinStats } from '../sdk/runSdk';
import { translate } from '../i18n';

export type ScreenMode = 'menu' | 'setup' | 'playing';
export type ActiveModal =
  | null
  | 'settings'
  | 'howto'
  | 'music'
  | 'wish'
  | 'profile'
  | 'lobby'
  | 'coachSkip'
  | 'gulPass'
  | 'victory'
  | 'tournamentRules';

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  seatIndex: number;
  timestamp: number;
  audioData?: string;
  duration?: number;
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
  pawns: PawnState[][];
  playerStats: PlayerStats[];
  turnSecondsLeft: number;
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
  roomError: string | null;
  lastActionSeq: number;
  serverClockOffsetMs: number;
  turnExpiresAt: number | null;

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
  rollLocalDice: (useWish?: boolean) => void;
  handleLocalPawnTap: (pIdx: number, pawnIdx: number) => void;
  handleLocalBaseTap: (pIdx: number) => void;
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
      hostSeatIndex?: number;
      timerConfig: { enabled: boolean; duration: 60 | 90 | 120 | 0 };
      seats: Record<number, RoomSeatPublic>;
      match: Record<string, unknown> | null;
      actionSeq?: number;
      serverTime?: number;
    };
  }) => void;
  applyServerRoomUpdate: (roomState: {
    code: string;
    started: boolean;
    matchEnded: boolean;
    fillBots: boolean;
    hostSeatIndex?: number;
    timerConfig: { enabled: boolean; duration: 60 | 90 | 120 | 0 };
    seats: Record<number, RoomSeatPublic>;
    match: Record<string, unknown> | null;
    actionSeq?: number;
    serverTime?: number;
  }) => void;
  applyServerDiceRoll: (payload: {
    dice: [number, number];
    player: number;
    isLucky7: boolean;
    actionSeq?: number;
  }) => void;
  applyServerMatchEnded: (payload: { winner: number; rankings: RankingEntry[] }) => void;
  appendChatMessage: (msg: ChatMessage) => void;
  setPendingServerGul: (choice: PendingMoveChoice | null) => void;
  setRoomError: (err: string | null) => void;
  leaveOnlineRoomLocal: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let aiTimeout: ReturnType<typeof setTimeout> | null = null;
let passTimeout: ReturnType<typeof setTimeout> | null = null;
let rollTimeout: ReturnType<typeof setTimeout> | null = null;
let banterTimers: Array<ReturnType<typeof setTimeout>> = [];
let lastRoutineSpeechAt = 0;

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

export const useGameStore = create<GameStoreState>((set, get) => {
  const initialPrefs = runSdk.loadPreferences();
  const initialStats = runSdk.loadWinStats();
  const initialPlayers = runSdk.loadPlayers();

  sfx.setVolumes(initialPrefs.volume, initialPrefs.musicVolume);
  sfx.setAiVoiceMuted(initialPrefs.aiVoiceMuted);

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

      const line = getAILine(st.prefs.language, event);
      st.sceneHandlers.showSpeech?.(pIdx, line);

      if (!isMuted) {
        sfx.speakTTS(line, st.prefs.language, {
          isAi: true,
          gender: player.gender,
          seatIdx: pIdx,
          priority: isHighPriority ? 'high' : 'normal',
          onStart: () => set({ speakingSeat: pIdx }),
          onEnd: () => {
            if (get().speakingSeat === pIdx) set({ speakingSeat: null });
          },
        });
      }
    };

    if (delayMs > 0) {
      const t = setTimeout(run, delayMs);
      banterTimers.push(t);
    } else {
      run();
    }
  };

  const scheduleAITurnIfNeeded = () => {
    const st = get();
    if (st.isOnline || !st.gameStarted || st.matchOver || st.screen !== 'playing') return;
    const current = st.players[st.currentPlayer];
    if (!current || !current.isAI) return;

    clearLocalTimers();
    if (!st.hasRolled && !st.isRolling) {
      aiTimeout = setTimeout(() => {
        get().rollLocalDice(false);
      }, 750);
    } else if (st.hasRolled && !st.isRolling && st.movesAvailable.length > 0) {
      aiTimeout = setTimeout(() => {
        const cur = get();
        if (cur.isOnline || cur.matchOver || !cur.hasRolled) return;
        const { move } = pickBestAIMove(cur.pawns, cur.currentPlayer, cur.movesAvailable, cur.dice);
        if (!move) {
          advanceLocalTurn();
          return;
        }
        executeLocalMoveStep(move.pawnIdx, move.steps, move.dieIdx, true);
      }, 650);
    }
  };

  const finishLocalVictory = (winnerIdx: number) => {
    clearLocalTimers();
    const st = get();
    const rankings = getPlayerRankings(st.pawns, st.players, st.playerStats, winnerIdx);
    const winnerName = st.players[winnerIdx]?.name || 'Player';
    const nextStats: WinStats = {
      ...st.winStats,
      wins: { ...st.winStats.wins },
      balances: { ...st.winStats.balances },
      bonds: { ...st.winStats.bonds },
      history: { ...st.winStats.history },
      matchesPlayed: (st.winStats.matchesPlayed || 0) + 1,
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
      bannerText: `🏆 ${winnerName} ${translate(st.prefs.language, 'win_text')}`,
      activeModal: 'victory',
    });
  };

  const advanceLocalTurn = () => {
    const st = get();
    if (st.isOnline || st.matchOver || !st.gameStarted) return;
    clearLocalTimers();

    const keepSame = st.extraTurnEarned;
    const nextP = keepSame ? st.currentPlayer : (st.currentPlayer + 1) % 5;
    const nextPlayerObj = st.players[nextP];

    set({
      currentPlayer: nextP,
      hasRolled: false,
      isRolling: false,
      movesAvailable: [],
      selectedDieIndex: null,
      extraTurnEarned: false,
      extraTurnReason: null,
      lucky7UsedThisTurn: false,
      turnCapturedPawn: false,
      turnStartCaptures: [],
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

    // Coach warning in first 3 matches if human skips an available capture
    if (!bypassPrompts && !player.isAI && (st.winStats.matchesPlayed || 0) < 3) {
      const caps = getPossibleCaptures(st.pawns, pIdx, st.movesAvailable, st.dice);
      const isDirect = wouldMoveCapture(st.pawns, pIdx, pawnIdx, steps, st.dice, st.movesAvailable);
      const isPart = caps.some((c) => c.pawnIdx === pawnIdx && c.diceIndices[0] === dieIdx);
      if (caps.length > 0 && !isDirect && !isPart) {
        set({
          pendingCoachMove: { pawnIdx, steps, dieIdx },
          activeModal: 'coachSkip',
        });
        return;
      }
    }

    // Centre Home ("Gul or Pass") choice for humans reaching pos 68
    const currPawn = st.pawns[pIdx][pawnIdx];
    const destPos = currPawn.status === 'home' ? 0 : currPawn.pos + steps;
    const path = getPawnPath(pIdx);
    if (!bypassPrompts && !player.isAI && destPos === path.length - 1) {
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
    const possibleCaptures =
      dieIdx === 'combined' ? [] : getPossibleCaptures(nextPawns, pIdx, nextMoves, st.dice);

    const outcome = executePawnMove(nextPawns, nextStats, pIdx, pawnIdx, steps, st.dice, nextMoves);
    if (!outcome.moved) return;

    sfx.play('move', 0.6);

    let splitSacrificeMsg = '';
    if (dieIdx !== 'combined' && possibleCaptures.length > 0) {
      if (applySplitSacrifice(nextPawns, pIdx, pawnIdx, startPos, possibleCaptures, dieIdx)) {
        splitSacrificeMsg = 'Pair split sacrifice! Partner returned to base.';
        sfx.play('whoosh', 0.8);
      }
    }

    let extraEarned = st.extraTurnEarned;
    let extraReason = st.extraTurnReason;
    let capturedFlag = st.turnCapturedPawn;

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
      const penalized = checkCompulsoryCapturePenalty(
        nextPawns,
        nextStats,
        pIdx,
        st.turnStartCaptures,
        capturedFlag,
        extraReason,
      );
      let banner = splitSacrificeMsg || (extraEarned ? 'Bonus Turn Earned!' : 'Turn finished!');
      if (penalized !== null) {
        banner = `⚠️ ${player.name}: ${translate(st.prefs.language, 'missed_capture_desc')}`;
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
        bannerText: banner,
      });
      passTimeout = setTimeout(advanceLocalTurn, 650);
    } else {
      const extraCaps = getPossibleCaptures(nextPawns, pIdx, nextMoves, st.dice);
      const mergedCaps = [...st.turnStartCaptures];
      for (const c of extraCaps) {
        if (!mergedCaps.some((m) => m.pawnIdx === c.pawnIdx)) mergedCaps.push(c);
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
        bannerText: splitSacrificeMsg || `${player.name}: Select next die or pawn`,
      });
      if (player.isAI) scheduleAITurnIfNeeded();
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
    pawns: createInitialPawns(),
    playerStats: createInitialPlayerStats(),
    turnSecondsLeft: initialPrefs.turnTimerEnabled ? initialPrefs.turnTimerDuration : 0,
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
    roomError: null,
    lastActionSeq: 0,
    serverClockOffsetMs: 0,
    turnExpiresAt: null,
    sceneHandlers: {},

    setScreen: (screen) => set({ screen }),
    setActiveModal: (activeModal) => set({ activeModal }),
    openProfileModal: (seatIdx) => set({ profileSeatIdx: seatIdx, activeModal: 'profile' }),
    openWishModal: (seatIdx) => set({ wishSeatIdx: seatIdx, activeModal: 'wish' }),

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
    selectDieIndex: (idx) => set({ selectedDieIndex: idx }),

    startLocalMatch: (tournament) => {
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
        pawns: createInitialPawns(),
        playerStats: createInitialPlayerStats(),
        wishUsedThisMatch: [false, false, false, false, false],
        turnSecondsLeft: st.prefs.turnTimerEnabled ? st.prefs.turnTimerDuration : 0,
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
      sfx.stopMusic();
      sfx.stopSpeech();
      set({
        screen: 'menu',
        activeModal: null,
        gameStarted: false,
        matchOver: false,
        isOnline: false,
        roomCode: null,
        mySeat: null,
        speakingSeat: null,
      });
    },

    rollLocalDice: (useWish = false) => {
      const st = get();
      if (st.isOnline || !st.gameStarted || st.matchOver || st.hasRolled || st.isRolling) return;
      const pIdx = st.currentPlayer;
      const player = st.players[pIdx];

      let rawDice: [number, number] = rollDicePair();
      const wishFlags = [...st.wishUsedThisMatch];

      if (useWish && !wishFlags[pIdx] && !player.isAI) {
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
        const startCaps = getPossibleCaptures(cur.pawns, pIdx, moves, finalDice);

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
        set({
          isRolling: false,
          hasRolled: true,
          movesAvailable: hasMoves ? moves : [],
          selectedDieIndex: hasMoves ? 0 : null,
          turnStartCaptures: startCaps,
          bannerText: hasMoves
            ? `${player.name}: ${translate(cur.prefs.language, 'pawn_select')}`
            : `${player.name}: ${translate(cur.prefs.language, 'no_moves')}`,
        });

        if (!hasMoves) {
          passTimeout = setTimeout(advanceLocalTurn, 950);
        } else if (player.isAI) {
          scheduleAITurnIfNeeded();
        }
      }, 720);
    },

    handleLocalPawnTap: (pIdx, pawnIdx) => {
      const st = get();
      if (st.isOnline || pIdx !== st.currentPlayer || !st.hasRolled || st.isRolling || st.matchOver) return;
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
      if (st.isOnline || pIdx !== st.currentPlayer || !st.hasRolled || st.isRolling) return;
      if (!st.movesAvailable.includes(6)) return;
      const homeIdx = st.pawns[pIdx].findIndex((p) => p.status === 'home');
      if (homeIdx >= 0) {
        get().handleLocalPawnTap(pIdx, homeIdx);
      }
    },

    confirmCoachSkipMove: () => {
      const st = get();
      const pending = st.pendingCoachMove;
      set({ pendingCoachMove: null, activeModal: null });
      if (pending) {
        executeLocalMoveStep(pending.pawnIdx, pending.steps, pending.dieIdx, true);
      }
    },

    confirmGulChoice: (choice) => {
      const st = get();
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
          set({ movesAvailable: [], bannerText: 'Passed Gul entry! Next turn...' });
          passTimeout = setTimeout(advanceLocalTurn, 600);
        } else {
          set({ movesAvailable: nextMoves, selectedDieIndex: 0, bannerText: 'Passed! Choose remaining die.' });
        }
      }
    },

    tickLocalTimer: () => {
      const st = get();
      if (!st.gameStarted || st.matchOver || st.screen !== 'playing') return;

      if (st.isOnline) {
        if (st.onlineTimerConfig.enabled && st.turnExpiresAt) {
          const syncedNow = Date.now() + st.serverClockOffsetMs;
          const remaining = Math.max(0, Math.ceil((st.turnExpiresAt - syncedNow) / 1000));
          if (remaining !== st.turnSecondsLeft) {
            set({ turnSecondsLeft: remaining });
          }
        }
        return;
      }

      if (!st.prefs.turnTimerEnabled || st.prefs.turnTimerDuration <= 0) return;
      if (st.activeModal) return;

      if (st.turnSecondsLeft <= 1) {
        set({ extraTurnEarned: false, extraTurnReason: null });
        advanceLocalTurn();
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
      st.sceneHandlers.showSpeech?.(seatIdx, text);
      sfx.speakTTS(text, st.prefs.language, {
        isAi: false,
        gender: player?.gender,
        seatIdx,
        priority: 'high',
        onStart: () => set({ speakingSeat: seatIdx }),
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
      if (!exists && st.speakingSeat === seatIdx) {
        sfx.stopSpeech();
        set({ speakingSeat: null });
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
        onlineTimerConfig: roomState.timerConfig,
        onlineSeats: roomState.seats,
        players: nextPlayers,
        roomError: null,
        lastActionSeq: roomState.actionSeq ?? 0,
        serverClockOffsetMs: clockOffset,
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
        onlineTimerConfig: roomState.timerConfig,
        onlineSeats: roomState.seats,
        players: nextPlayers,
        lastActionSeq: roomState.actionSeq ?? st.lastActionSeq,
        serverClockOffsetMs: clockOffset,
        wishUsedThisMatch: Array.from({ length: 5 }, (_, i) => !!roomState.seats?.[i]?.wishUsed),
      };

      if (roomState.started && roomState.match) {
        const m = roomState.match as Record<string, unknown>;
        const nextMoves = Array.isArray(m.movesAvailable) ? (m.movesAvailable as number[]) : [];
        const hasRolledNow = !!m.hasRolled;
        const expiresAt = typeof m.turnExpiresAt === 'number' ? m.turnExpiresAt : null;
        const syncedSeconds = expiresAt
          ? Math.max(0, Math.ceil((expiresAt - (Date.now() + clockOffset)) / 1000))
          : Number(m.turnSecondsLeft) || 0;

        patch.screen = 'playing';
        patch.gameStarted = true;
        patch.matchOver = !!roomState.matchEnded;
        patch.currentPlayer = Number(m.currentPlayer) || 0;
        patch.dice = (m.dice as [number, number]) || [1, 6];
        patch.movesAvailable = nextMoves;
        patch.hasRolled = hasRolledNow;
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
      }

      const prevCurrentPlayer = st.currentPlayer;
      const prevStats = st.playerStats;
      const wasStarted = st.gameStarted;

      set(patch);

      // Trigger AI bot voice reactions in online rooms when server advances turns or records captures
      if (roomState.started && roomState.match && !roomState.matchEnded) {
        const m = roomState.match as Record<string, unknown>;
        const nextCurrent = Number(m.currentPlayer) || 0;
        const nextStats = (m.playerStats as PlayerStats[]) || [];
        if (wasStarted && nextCurrent !== prevCurrentPlayer && nextPlayers[nextCurrent]?.isAI) {
          emitBanter(nextCurrent, 'turn', 200);
        }
        for (let i = 0; i < 5; i++) {
          if ((nextStats[i]?.captures_made || 0) > (prevStats[i]?.captures_made || 0)) {
            if (nextPlayers[i]?.isAI) emitBanter(i, 'capture');
          }
          if ((nextStats[i]?.times_captured || 0) > (prevStats[i]?.times_captured || 0)) {
            if (nextPlayers[i]?.isAI) emitBanter(i, 'captured', 1800);
          }
        }
      }
    },

    applyServerDiceRoll: ({ dice, player, isLucky7 }) => {
      sfx.play('dice');
      if (isLucky7) {
        sfx.play('lucky7');
        get().showToast('✨ Lucky 7 Bonus! Converted to 6 + 6 + Extra Turn!');
      }
      if (rollTimeout) clearTimeout(rollTimeout);
      set({
        isRolling: true,
        dice,
        currentPlayer: player,
      });
      rollTimeout = setTimeout(() => {
        set({ isRolling: false });
        const cur = get();
        if (cur.players[player]?.isAI) {
          emitBanter(
            player,
            isLucky7 ? 'lucky7' : dice[0] === 6 && dice[1] === 6 ? 'lucky_roll' : 'roll',
          );
        }
      }, 650);
    },

    applyServerMatchEnded: ({ winner, rankings }) => {
      sfx.play('win');
      if (get().players[winner]?.isAI) {
        emitBanter(winner, 'win');
      }
      set({
        matchOver: true,
        winner,
        rankings,
        turnExpiresAt: null,
        activeModal: 'victory',
      });
    },

    appendChatMessage: (msg) => {
      const next = [...get().chatMessages.slice(-50), msg];
      set({ chatMessages: next });
      if (msg.audioData) {
        try {
          new Audio(msg.audioData).play().catch(() => {});
        } catch {}
      } else {
        get().sceneHandlers.showSpeech?.(msg.seatIndex, msg.text);
      }
    },

    setPendingServerGul: (choice) =>
      set({ pendingGulMove: choice, activeModal: choice ? 'gulPass' : null }),

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
      set({
        isOnline: false,
        roomCode: null,
        mySeat: null,
        hostSeatIndex: 0,
        amHost: false,
        onlineSeats: {},
        chatMessages: [],
        roomError: null,
        lastActionSeq: 0,
        turnExpiresAt: null,
        activeModal: null,
        screen: 'menu',
        gameStarted: false,
      });
    },
  };
});
