import React, { useEffect, useRef, useState } from 'react';
import { LudoScene, type NameplateScreenPos } from '../game/ludoScene';
import { sfx } from '../game/sfx';
import { multiplayerClient } from '../network/multiplayerClient';
import { canMovePawn, isLoneTokenOnTrack } from '../game/rules';
import { runSdk } from '../sdk/runSdk';
import { useGameStore } from '../state/store';
import { Hud } from './Hud';
import { MainMenu } from './MainMenu';
import { Modals } from './Modals';
import { SetupScreen } from './SetupScreen';

let bootInviteHandled = false;

export const App: React.FC = () => {
  const viewportShellRef = useRef<HTMLDivElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<LudoScene | null>(null);

  const [viewModeOverride, setViewModeOverride] = useState<'auto' | 'portrait' | 'landscape'>('auto');
  const viewModeOverrideRef = useRef<'auto' | 'portrait' | 'landscape'>('auto');
  viewModeOverrideRef.current = viewModeOverride;
  const [nameplates, setNameplates] = useState<NameplateScreenPos[]>([]);

  const [layoutMetrics, setLayoutMetrics] = useState<{
    isLandscape: boolean;
    logicalW: number;
    logicalH: number;
    fitScale: number;
  }>(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const vw = (vv && vv.width > 0 ? vv.width : 0) || (typeof window !== 'undefined' ? window.innerWidth : 1280);
    const vh = (vv && vv.height > 0 ? vv.height : 0) || (typeof window !== 'undefined' ? window.innerHeight : 720);
    const isLandscape = vw >= vh;
    const logicalW = isLandscape ? 1280 : 720;
    const logicalH = isLandscape ? 720 : 1280;
    return {
      isLandscape,
      logicalW,
      logicalH,
      fitScale: Math.min(vw / logicalW, vh / logicalH),
    };
  });
  const layoutRef = useRef(layoutMetrics);
  layoutRef.current = layoutMetrics;

  const screen = useGameStore((s) => s.screen);
  const toastText = useGameStore((s) => s.toastText);
  const players = useGameStore((s) => s.players);
  const pawns = useGameStore((s) => s.pawns);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const dice = useGameStore((s) => s.dice);
  const movesAvailable = useGameStore((s) => s.movesAvailable);
  const selectedDieIndex = useGameStore((s) => s.selectedDieIndex);
  const hasRolled = useGameStore((s) => s.hasRolled);
  const isRolling = useGameStore((s) => s.isRolling);
  const isTournament = useGameStore((s) => s.isTournament);
  const prefs = useGameStore((s) => s.prefs);
  const gameStarted = useGameStore((s) => s.gameStarted);
  const mySeat = useGameStore((s) => s.mySeat);
  const isOnline = useGameStore((s) => s.isOnline);

  // Exact responsive fit-scale engine supporting both Web Landscape (1280x720) & Mobile Portrait (720x1280)
  const prevWindowLandscapeRef = useRef<boolean>(
    typeof window !== 'undefined' ? window.innerWidth >= window.innerHeight : true,
  );

  const recomputeLayoutRef = useRef<() => void>(() => {});

  useEffect(() => {
    const timers: number[] = [];
    let rafId = 0;

    const getViewportSize = () => {
      const shellRect = viewportShellRef.current?.getBoundingClientRect();
      const vv = window.visualViewport;
      const vw =
        (shellRect && shellRect.width > 0 ? shellRect.width : 0) ||
        (vv && vv.width > 0 ? vv.width : 0) ||
        window.innerWidth ||
        1280;
      const vh =
        (shellRect && shellRect.height > 0 ? shellRect.height : 0) ||
        (vv && vv.height > 0 ? vv.height : 0) ||
        window.innerHeight ||
        720;
      return { vw, vh };
    };

    const computeLayout = () => {
      const { vw, vh } = getViewportSize();
      const windowLandscape =
        Math.abs(vw - vh) < 1
          ? window.matchMedia?.('(orientation: landscape)').matches ?? true
          : vw > vh;

      // If the physical device rotated between portrait and landscape, auto-follow the new orientation
      let effectiveOverride = viewModeOverrideRef.current;
      if (windowLandscape !== prevWindowLandscapeRef.current) {
        prevWindowLandscapeRef.current = windowLandscape;
        if (effectiveOverride !== 'auto') {
          effectiveOverride = 'auto';
          viewModeOverrideRef.current = 'auto';
          setViewModeOverride('auto');
        }
      }

      const targetLandscape =
        effectiveOverride === 'auto'
          ? windowLandscape
          : effectiveOverride === 'landscape';

      const logicalW = targetLandscape ? 1280 : 720;
      const logicalH = targetLandscape ? 720 : 1280;
      const fitScale = Math.min(vw / logicalW, vh / logicalH);

      const prev = layoutRef.current;
      if (
        prev.isLandscape !== targetLandscape ||
        prev.logicalW !== logicalW ||
        prev.logicalH !== logicalH ||
        Math.abs(prev.fitScale - fitScale) > 0.0005
      ) {
        layoutRef.current = { isLandscape: targetLandscape, logicalW, logicalH, fitScale };
        setLayoutMetrics({ isLandscape: targetLandscape, logicalW, logicalH, fitScale });
      }
      document.documentElement.style.setProperty('--fit-scale', String(fitScale));
      sceneRef.current?.resize(logicalW, logicalH);
    };

    const scheduleOrientationSettle = () => {
      window.scrollTo?.(0, 0);
      computeLayout();
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => computeLayout());
      [80, 200, 420].forEach((delay) => {
        const id = window.setTimeout(() => computeLayout(), delay);
        timers.push(id);
      });
    };

    recomputeLayoutRef.current = computeLayout;
    computeLayout();

    window.addEventListener('resize', computeLayout);
    window.addEventListener('orientationchange', scheduleOrientationSettle);
    window.visualViewport?.addEventListener('resize', computeLayout);
    window.screen?.orientation?.addEventListener?.('change', scheduleOrientationSettle);

    const mql = window.matchMedia?.('(orientation: landscape)');
    mql?.addEventListener?.('change', scheduleOrientationSettle);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && viewportShellRef.current) {
      ro = new ResizeObserver(() => computeLayout());
      ro.observe(viewportShellRef.current);
    }

    return () => {
      window.removeEventListener('resize', computeLayout);
      window.removeEventListener('orientationchange', scheduleOrientationSettle);
      window.visualViewport?.removeEventListener('resize', computeLayout);
      window.screen?.orientation?.removeEventListener?.('change', scheduleOrientationSettle);
      mql?.removeEventListener?.('change', scheduleOrientationSettle);
      ro?.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      timers.forEach((id) => clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    recomputeLayoutRef.current();
  }, [viewModeOverride]);

  const handleToggleAspectRatio = () => {
    setViewModeOverride((prev) => {
      const currentlyLandscape =
        prev === 'auto' ? layoutRef.current.isLandscape : prev === 'landscape';
      const next = currentlyLandscape ? 'portrait' : 'landscape';
      viewModeOverrideRef.current = next;
      return next;
    });
  };

  // Check ?room=CODE invite query param or saved reconnect session on mount (once across StrictMode)
  useEffect(() => {
    if (bootInviteHandled) return;
    bootInviteHandled = true;
    const params = new URLSearchParams(window.location.search);
    const code = (params.get('room') || params.get('invite') || '').trim().toUpperCase();
    if (code) {
      const existingName = runSdk.getOnlineName().trim();
      const savedName = existingName || 'Guest';
      const savedWish = runSdk.getOnlineWish();
      multiplayerClient.joinRoom(code, savedName, savedWish, !!existingName).then((ok) => {
        if (!ok) useGameStore.getState().setActiveModal('lobby');
      });
    } else {
      multiplayerClient.tryAutoReconnect();
    }
  }, []);

  // Unlock AudioContext & preload core SFX on first user interaction
  useEffect(() => {
    const onFirstTap = () => {
      sfx.unlockAudio();
      window.removeEventListener('pointerdown', onFirstTap, true);
    };
    window.addEventListener('pointerdown', onFirstTap, true);
    return () => window.removeEventListener('pointerdown', onFirstTap, true);
  }, []);

  // Local 1s countdown timer
  useEffect(() => {
    const id = setInterval(() => {
      useGameStore.getState().tickLocalTimer();
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Mount & tear down PixiJS WebGL LudoScene whenever playing screen mounts
  useEffect(() => {
    if (screen !== 'playing' || !stageContainerRef.current) return;

    const scene = new LudoScene(stageContainerRef.current, {
      onPawnTap: (pIdx, pawnIdx) => {
        const st = useGameStore.getState();
        if (st.turnAutoPlay) return;
        if (!st.isOnline) {
          st.handleLocalPawnTap(pIdx, pawnIdx);
          return;
        }
        if (st.mySeat !== st.currentPlayer || pIdx !== st.currentPlayer || !st.hasRolled || st.isRolling) return;
        const pawn = st.pawns[pIdx][pawnIdx];
        if (!pawn) return;

        let steps: number | null = null;
        let dieIdx: number | 'combined' = -1;

        if (pawn.status === 'home') {
          const sixIdx = st.movesAvailable.findIndex((v) => v === 6);
          if (sixIdx >= 0) {
            dieIdx = sixIdx;
            steps = 6;
          }
        } else {
          const isLone = isLoneTokenOnTrack(st.pawns, pIdx);
          const total = st.movesAvailable.reduce((a, b) => a + b, 0);
          const canCombined =
            isLone &&
            st.movesAvailable.length > 1 &&
            canMovePawn(st.pawns, pIdx, pawnIdx, total, st.dice, st.movesAvailable);
          const sel = st.selectedDieIndex;
          const canSel =
            sel !== null &&
            st.movesAvailable[sel] !== undefined &&
            canMovePawn(st.pawns, pIdx, pawnIdx, st.movesAvailable[sel], st.dice, st.movesAvailable);
          const fbIdx = st.movesAvailable.findIndex((v) =>
            canMovePawn(st.pawns, pIdx, pawnIdx, v, st.dice, st.movesAvailable),
          );

          if (canSel && sel !== null) {
            dieIdx = sel;
            steps = st.movesAvailable[sel];
          } else if (fbIdx >= 0) {
            dieIdx = fbIdx;
            steps = st.movesAvailable[fbIdx];
          } else if (canCombined) {
            dieIdx = 'combined';
            steps = total;
          }
        }

        if (steps !== null && dieIdx !== -1) {
          if (st.attemptOnlineMoveWithCoachCheck(pawnIdx, steps, dieIdx)) {
            multiplayerClient.movePawn(pawnIdx, steps, dieIdx);
          }
        }
      },
      onBaseTap: (pIdx) => {
        const st = useGameStore.getState();
        if (st.turnAutoPlay) return;
        if (!st.isOnline) {
          st.handleLocalBaseTap(pIdx);
          return;
        }
        if (st.mySeat !== st.currentPlayer || pIdx !== st.currentPlayer || !st.hasRolled || st.isRolling) return;
        if (!st.movesAvailable.includes(6)) return;
        const homeIdx = st.pawns[pIdx].findIndex((p) => p.status === 'home');
        if (homeIdx >= 0) {
          const sixIdx = st.movesAvailable.findIndex((v) => v === 6);
          if (sixIdx >= 0 && st.attemptOnlineMoveWithCoachCheck(homeIdx, 6, sixIdx)) {
            multiplayerClient.movePawn(homeIdx, 6, sixIdx);
          }
        }
      },
      onDiceTap: () => {
        const st = useGameStore.getState();
        if (!st.gameStarted || st.matchOver || st.hasRolled || st.isRolling || st.turnAutoPlay) return;
        if (st.isOnline) {
          if (st.mySeat === st.currentPlayer) multiplayerClient.rollDice(false);
        } else if (!st.players[st.currentPlayer]?.isAI) {
          st.rollLocalDice(false);
        }
      },
      onNameplatesChange: (plates) => {
        setNameplates(plates);
      },
    });

    sceneRef.current = scene;
    scene.init(layoutRef.current.logicalW, layoutRef.current.logicalH).then(() => {
      useGameStore.getState().setSceneHandlers({
        spawnReaction: (pIdx, emoji) => scene.spawnReaction(pIdx, emoji),
        showSpeech: (pIdx, text) => scene.showSpeechBubble(pIdx, text),
      });
      const st = useGameStore.getState();
      scene.syncState({
        players: st.players,
        pawns: st.pawns,
        currentPlayer: st.currentPlayer,
        dice: st.dice,
        movesAvailable: st.movesAvailable,
        selectedDieIndex: st.selectedDieIndex,
        hasRolled: st.hasRolled,
        isRolling: st.isRolling,
        isTournament: st.isTournament,
        boardThemeId: st.prefs.boardThemeId,
        tournamentBoardThemeId: st.prefs.tournamentBoardThemeId,
        diceStyle: st.prefs.diceStyle,
        backgroundId: st.prefs.backgroundId,
        rotateBoard: st.prefs.rotateBoard,
        cameraTilt: st.prefs.cameraTilt ?? 0.75,
        gameStarted: st.gameStarted,
        mySeat: st.mySeat,
        isOnline: st.isOnline,
      });
      scene.resize(layoutRef.current.logicalW, layoutRef.current.logicalH);
    });

    return () => {
      useGameStore.getState().setSceneHandlers({});
      scene.destroy();
      sceneRef.current = null;
      setNameplates([]);
    };
  }, [screen]);

  // Push store snapshots & layout changes into PixiJS scene
  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.syncState({
      players,
      pawns,
      currentPlayer,
      dice,
      movesAvailable,
      selectedDieIndex,
      hasRolled,
      isRolling,
      isTournament,
      boardThemeId: prefs.boardThemeId,
      tournamentBoardThemeId: prefs.tournamentBoardThemeId,
      diceStyle: prefs.diceStyle,
      backgroundId: prefs.backgroundId,
      rotateBoard: prefs.rotateBoard,
      cameraTilt: prefs.cameraTilt ?? 0.75,
      gameStarted,
      mySeat,
      isOnline,
    });
    sceneRef.current.resize(layoutMetrics.logicalW, layoutMetrics.logicalH);
  }, [
    players,
    pawns,
    currentPlayer,
    dice,
    movesAvailable,
    selectedDieIndex,
    hasRolled,
    isRolling,
    isTournament,
    prefs,
    gameStarted,
    mySeat,
    isOnline,
    layoutMetrics.logicalW,
    layoutMetrics.logicalH,
  ]);

  const containerClass = layoutMetrics.isLandscape ? 'landscape' : '';

  return (
    <div id="viewport-shell" ref={viewportShellRef}>
      <div
        id="game-container"
        className={containerClass}
        style={{
          transform: `translate(-50%, -50%) scale(${layoutMetrics.fitScale})`,
        }}
      >
        {screen === 'menu' && <MainMenu />}
        {screen === 'setup' && <SetupScreen />}
        {screen === 'playing' && (
          <>
            <div id="game-stage" ref={stageContainerRef} />
            <Hud
              onToggleAspectRatio={handleToggleAspectRatio}
              nameplates={nameplates}
              logicalW={layoutMetrics.logicalW}
              logicalH={layoutMetrics.logicalH}
            />
          </>
        )}

        <Modals />

        {toastText && (
          <div id="toast-pill">
            <span>{toastText}</span>
          </div>
        )}
      </div>
    </div>
  );
};
