import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type NameplateScreenPos } from '../game/ludoScene';
import {
  canAnyPawnMove,
  canMovePawn,
  getPlayerColor,
  getPlayerProgressPercent,
  isLoneTokenOnTrack,
  stripSeatTag,
} from '../game/rules';
import { voiceNoteRecorder } from '../network/audioCapture';
import { multiplayerClient } from '../network/multiplayerClient';
import { whisperRecorder } from '../network/whisperRecorder';
import { useGameStore } from '../state/store';
import { translate } from '../i18n';

interface HudProps {
  onToggleAspectRatio: () => void;
  nameplates: NameplateScreenPos[];
  logicalW: number;
  logicalH: number;
}

export const Hud: React.FC<HudProps> = ({
  onToggleAspectRatio,
  nameplates,
  logicalW,
  logicalH,
}) => {
  const {
    players,
    pawns,
    currentPlayer,
    dice,
    movesAvailable,
    selectedDieIndex,
    hasRolled,
    isRolling,
    isTournament,
    isOnline,
    mySeat,
    turnSecondsLeft,
    turnAutoPlay,
    prefs,
    winStats,
    wishUsedThisMatch,
    roomCode,
    onlineTimerConfig,
    speakingSeat,
    onlineSeats,
    incomingWhispers,
    pendingVoiceNotes,
    whisperRecordingSeat,
    selectDieIndex,
    rollLocalDice,
    setActiveModal,
    openProfileModal,
    toggleAiVoiceMute,
    playIncomingWhisper,
    dismissIncomingWhisper,
    playVoiceNote,
    dismissVoiceNote,
  } = useGameStore();

  const [isRecording, setIsRecording] = useState(() => voiceNoteRecorder.isRecording());
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextClickRef = useRef(false);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleSeatPointerDown = (seatIdx: number, canWhisperTarget: boolean, hasPendingWhisper: boolean) => {
    clearLongPress();
    suppressNextClickRef.current = false;
    if (!canWhisperTarget || hasPendingWhisper) return;
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      suppressNextClickRef.current = true;
      void whisperRecorder.start(seatIdx);
    }, 450);
  };

  const handleSeatPointerEnd = (seatIdx: number) => {
    clearLongPress();
    if (whisperRecorder.isRecording() && whisperRecorder.getTargetSeat() === seatIdx) {
      whisperRecorder.stopAndSend();
    }
  };

  useEffect(() => {
    const unsub = voiceNoteRecorder.subscribe(setIsRecording);
    return () => {
      unsub();
      clearLongPress();
      if (voiceNoteRecorder.isRecording()) {
        voiceNoteRecorder.cancel();
      }
      if (whisperRecorder.isRecording()) {
        whisperRecorder.cancel();
      }
    };
  }, []);

  // Exact original updateAIJudge: Top 3 leaders with short name + %
  const top3Judges = useMemo(() => {
    const progressValues = players.map((p, idx) => {
      const { percentage } = getPlayerProgressPercent(pawns, idx);
      const cleanName = stripSeatTag(p.name);
      return {
        idx,
        shortName: cleanName.split(' ')[0].substring(0, 8),
        fullName: cleanName,
        color: getPlayerColor(idx, isTournament),
        isAI: p.isAI,
        val: percentage,
      };
    });
    const totalSum = progressValues.reduce((acc, item) => acc + item.val, 0);
    const sortedTop3 = [...progressValues].sort((a, b) => b.val - a.val).slice(0, 3);
    const top3Sum = sortedTop3.reduce((acc, item) => acc + item.val, 0);
    return sortedTop3.map((item) => {
      const pct = Math.round(item.val);
      const widthPct = totalSum > 1 && top3Sum > 0 ? Math.max(18, (item.val / top3Sum) * 100) : 33.33;
      return { ...item, pct, widthPct };
    });
  }, [players, pawns, isTournament]);

  // Exact original updateWinStatsDisplay: Top 3 ranked players (#1, #2, #3) with Win:X and $bal
  const top3Rankings = useMemo(() => {
    return players
      .map((p, idx) => {
        const cleanName = stripSeatTag(p.name);
        const wins = winStats.wins[p.name] ?? winStats.wins[cleanName] ?? 0;
        const bal = winStats.balances[p.name] ?? winStats.balances[cleanName] ?? 5;
        return {
          idx,
          cleanName,
          wins,
          bal,
          color: getPlayerColor(idx, isTournament),
        };
      })
      .sort((a, b) => {
        if (isTournament && b.bal !== a.bal) return b.bal - a.bal;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return a.idx - b.idx;
      })
      .slice(0, 3);
  }, [players, winStats, isTournament]);

  const isMyTurn = isOnline ? mySeat === currentPlayer : !players[currentPlayer]?.isAI;
  const canRoll = isMyTurn && !hasRolled && !isRolling && !turnAutoPlay;
  const wishAvailable = isMyTurn && !hasRolled && !isRolling && !turnAutoPlay && !wishUsedThisMatch[currentPlayer];

  const timerEnabled = isOnline ? onlineTimerConfig.enabled : prefs.turnTimerEnabled;
  const timerDuration = isOnline ? onlineTimerConfig.duration : prefs.turnTimerDuration;
  const timerPercent =
    timerEnabled && timerDuration > 0
      ? Math.max(0, Math.min(100, (turnSecondsLeft / timerDuration) * 100))
      : 0;

  const isLone = isLoneTokenOnTrack(pawns, currentPlayer);
  const combinedTotal = movesAvailable.reduce((a, b) => a + b, 0);
  const canCombinedMove =
    isMyTurn &&
    !turnAutoPlay &&
    hasRolled &&
    isLone &&
    movesAvailable.length > 1 &&
    pawns[currentPlayer]?.some(
      (p, i) => p.status === 'on-path' && canMovePawn(pawns, currentPlayer, i, combinedTotal, dice, movesAvailable),
    );

  const isDoubleOrLucky = dice[0] === 6 && dice[1] === 6;

  const handleRoll = (useWish = false) => {
    if (!canRoll) return;
    if (isOnline) {
      multiplayerClient.rollDice(useWish);
    } else {
      rollLocalDice(useWish);
    }
  };

  const handleCombinedMove = () => {
    if (!canCombinedMove) return;
    const lonePawnIdx = pawns[currentPlayer].findIndex((p) => p.status === 'on-path');
    if (lonePawnIdx < 0) return;
    if (isOnline) {
      if (useGameStore.getState().attemptOnlineMoveWithCoachCheck(lonePawnIdx, combinedTotal, 'combined')) {
        multiplayerClient.movePawn(lonePawnIdx, combinedTotal, 'combined');
      }
    } else {
      useGameStore.getState().handleLocalPawnTap(currentPlayer, lonePawnIdx);
    }
  };

  const handleToggleVoiceRecord = () => {
    void voiceNoteRecorder.toggle();
  };

  const handleOpenQuickChat = () => {
    const targetSeat =
      isOnline && typeof mySeat === 'number'
        ? mySeat
        : !players[currentPlayer]?.isAI
          ? currentPlayer
          : Math.max(
              0,
              players.findIndex((p) => !p.isAI),
            );
    openProfileModal(targetSeat);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 100 }}>
      {/* Top-Left Play With Friends Button */}
      <button
        id="online-friends-btn-ingame"
        type="button"
        onClick={() => setActiveModal('lobby')}
        className={isOnline ? 'online-mode' : ''}
      >
        <span>{isOnline ? '🟢' : '🌐'}</span>
        <span>{roomCode ? `ROOM ${roomCode}` : 'PLAY WITH FRIENDS'}</span>
      </button>

      {/* Top-Right Fullscreen / Orientation Ratio Toggle Button */}
      <button
        id="ratio-toggle-btn"
        type="button"
        onClick={onToggleAspectRatio}
        title="Toggle Portrait / Landscape View"
      >
        ⛶
      </button>

      {/* Portrait Game Title */}
      <h1 id="title">{isTournament ? '👑 TOURNAMENT LUDO 5 WAY' : 'LUDO DETHRONED 5 WAY'}</h1>

      {/* Clean Top-3 AI Judge Progress Bar (Progress % & Speaking Status Only) */}
      <div id="ai-judge-bar" className={isTournament ? 'tournament' : ''}>
        {top3Judges.map((entry) => {
          const isAiSpeakingNow = speakingSeat === entry.idx;
          return (
            <div
              key={entry.idx}
              id={`judge-${entry.idx}`}
              className="judge-segment"
              style={{
                width: `${entry.widthPct}%`,
                backgroundColor: entry.color,
                boxShadow: isAiSpeakingNow
                  ? 'inset 0 0 0 3px #f1c40f'
                  : currentPlayer === entry.idx
                    ? 'inset 0 0 0 2px #ffffff'
                    : undefined,
              }}
            >
              <div className="judge-name" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {isAiSpeakingNow ? <span>🗣️</span> : null}
                <span>
                  {entry.shortName}: {entry.pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Portrait Ranking Bar (Exact Original Top 3: #1, #2, #3) */}
      <div id="ranking-bar" className={isTournament ? 'tournament' : ''}>
        {top3Rankings.map((entry, rankIdx) => (
          <div
            key={entry.idx}
            className="rank-segment"
            onClick={() => openProfileModal(entry.idx)}
            style={{
              backgroundColor: entry.color,
              cursor: 'pointer',
              boxShadow: currentPlayer === entry.idx ? 'inset 0 0 0 2px #fff' : undefined,
            }}
          >
            <div className="rank-header-row">
              <span className="rank-badge">#{rankIdx + 1}</span>
              <span className="rank-name">{entry.cleanName}</span>
            </div>
            <div className="rank-stats-row">
              <span className="rank-wins">Win:{entry.wins}</span>
              {isTournament && <span className="rank-balance">${entry.bal}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Whisper-Only Layer for Board Nameplates (Online Remote Connected Humans + Incoming Whisper Badges) */}
      {isOnline &&
        nameplates.map((plate) => {
          const seatPlayer = players[plate.seatIdx];
          if (!seatPlayer) return null;
          const cleanName = stripSeatTag(seatPlayer.name);
          const isMe = mySeat === plate.seatIdx;
          const canWhisperTarget =
            !seatPlayer.isAI && !isMe && !!onlineSeats[plate.seatIdx]?.connected;
          const pendingWhisper = incomingWhispers[plate.seatIdx];
          if (!canWhisperTarget && !pendingWhisper) return null;

          const isWhisperTargetNow = whisperRecordingSeat === plate.seatIdx;
          const badgeX = Math.max(22, Math.min(logicalW - 22, plate.x + Math.max(36, plate.w * 0.42)));
          const badgeY = Math.max(22, Math.min(logicalH - 22, plate.y - Math.max(15, plate.h * 0.48)));

          return (
            <React.Fragment key={`plate-whisper-${plate.seatIdx}`}>
              {(canWhisperTarget || !!pendingWhisper) && (
                <button
                  type="button"
                  className={`nameplate-hit-btn ${isWhisperTargetNow ? 'is-whisper-target' : ''} ${pendingWhisper ? 'has-pending-whisper' : ''}`}
                  title={
                    pendingWhisper
                      ? `Tap to listen to private whisper from ${cleanName}`
                      : isWhisperTargetNow
                        ? `Tap to send private whisper to ${cleanName}`
                        : `Whisper to ${cleanName} (Tap or Hold)`
                  }
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    handleSeatPointerDown(plate.seatIdx, canWhisperTarget, !!pendingWhisper);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    handleSeatPointerEnd(plate.seatIdx);
                  }}
                  onPointerCancel={() => handleSeatPointerEnd(plate.seatIdx)}
                  onPointerLeave={() => clearLongPress()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (suppressNextClickRef.current) {
                      suppressNextClickRef.current = false;
                      return;
                    }
                    if (pendingWhisper) {
                      playIncomingWhisper(plate.seatIdx);
                      return;
                    }
                    if (!canWhisperTarget) return;
                    if (
                      whisperRecorder.isRecording() &&
                      whisperRecorder.getTargetSeat() === plate.seatIdx
                    ) {
                      whisperRecorder.stopAndSend();
                    } else {
                      void whisperRecorder.start(plate.seatIdx);
                    }
                  }}
                  style={{
                    left: `${plate.x}px`,
                    top: `${plate.y}px`,
                    width: `${Math.max(88, plate.w)}px`,
                    height: `${Math.max(36, plate.h)}px`,
                    transform: `translate(-50%, -50%) rotate(${plate.angleDeg}deg)`,
                  }}
                  aria-label={
                    pendingWhisper
                      ? `Listen to private whisper from ${cleanName}`
                      : `Private whisper to ${cleanName}`
                  }
                />
              )}

              {pendingWhisper && (
                <button
                  type="button"
                  className="nameplate-status-badge whisper-pill"
                  style={{ left: `${badgeX}px`, top: `${badgeY}px` }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    playIncomingWhisper(plate.seatIdx);
                  }}
                  title="Tap to listen to private whisper"
                >
                  🔊 🤫
                </button>
              )}
            </React.Fragment>
          );
        })}

      {/* Turn Timer Bar */}
      {timerEnabled && timerDuration > 0 && (
        <div id="turn-timer-container">
          <div
            id="turn-timer-bar"
            className={
              turnSecondsLeft <= 15
                ? 'timer-danger'
                : timerPercent <= 30
                  ? 'timer-warning'
                  : ''
            }
            style={{ width: `${timerPercent}%` }}
          />
          <div id="turn-timer-text">
            {turnAutoPlay ? '🤖 Auto-playing...' : `⏳ ${turnSecondsLeft}s`}
          </div>
        </div>
      )}

      {/* Promotional Content Ad Banner (Exact Original Web Sidebar & Mobile Banner) */}
      <div
        id="ad-banner"
        style={{ opacity: hasRolled || isRolling ? 1 : 0.8 }}
      >
        Promotional Content Section
      </div>

      {/* Bottom-Left Actions: Lucky Wish + Quick Chat / Message Icon */}
      <div id="bottom-left-actions">
        {wishAvailable && (
          <button
            id="wish-btn"
            type="button"
            onClick={() => handleRoll(true)}
            title={`Use Lucky Wish (${players[currentPlayer]?.wish.join(' + ')})`}
          >
            <span>✨</span>
          </button>
        )}
        <button
          id="quick-msg-btn"
          type="button"
          onClick={handleOpenQuickChat}
          title="Quick Chat & Messages"
        >
          <span>💬</span>
        </button>
      </div>

      {/* Classic Roll Hint & Dice Results HUD */}
      {hasRolled && !isRolling && movesAvailable.length > 0 ? (
        <div id="dice-hud">
          {movesAvailable.map((val, idx) => {
            const playable = canAnyPawnMove(pawns, currentPlayer, [val], dice);
            const selected = movesAvailable.length > 1 && selectedDieIndex === idx;
            return (
              <button
                key={`${idx}-${val}`}
                type="button"
                disabled={!isMyTurn || !playable || turnAutoPlay}
                onClick={() => selectDieIndex(idx)}
                className={`dice-val ${selected ? 'selected' : ''} ${isDoubleOrLucky ? 'bonus' : ''}`}
                style={{
                  opacity: playable && !turnAutoPlay ? 1 : 0.4,
                  borderColor: selected ? '#ffffff' : getPlayerColor(currentPlayer, isTournament),
                }}
              >
                {val}
              </button>
            );
          })}
          {canCombinedMove && (
            <button
              type="button"
              disabled={turnAutoPlay}
              onClick={handleCombinedMove}
              className="dice-val selected"
              style={{
                width: 'auto',
                padding: '0 16px',
                background: '#2ecc71',
                color: '#000',
                fontSize: '20px',
              }}
            >
              USE {combinedTotal}
            </button>
          )}
        </div>
      ) : (
        <button
          id="roll-hint"
          type="button"
          disabled={!canRoll}
          onClick={() => handleRoll(false)}
          style={{
            cursor: canRoll ? 'pointer' : 'default',
            opacity: canRoll ? 1 : 0.85,
            pointerEvents: canRoll ? 'auto' : 'none',
          }}
        >
          {turnAutoPlay
            ? "⏱️ Time's up! Auto-playing..."
            : isRolling
              ? 'Rolling...'
              : canRoll
                ? translate(prefs.language, 'roll_hint')
                : `${stripSeatTag(players[currentPlayer]?.name || 'Player')}'s turn!`}
        </button>
      )}

      {/* Bottom-Right Compact Audio, AI Voice Mute & Settings Buttons */}
      <div id="music-controls-overlay">
        <button
          type="button"
          onClick={toggleAiVoiceMute}
          className="music-btn"
          style={
            prefs.aiVoiceMuted
              ? { background: 'rgba(231, 76, 60, 0.72)', borderColor: '#ffb3ad' }
              : speakingSeat !== null
                ? { borderColor: '#f1c40f', boxShadow: '0 0 14px rgba(241, 196, 15, 0.75)' }
                : undefined
          }
          title={prefs.aiVoiceMuted ? 'Unmute AI Voices' : 'Mute AI Voices'}
        >
          {prefs.aiVoiceMuted ? '🔇' : '🗣️'}
        </button>
        {isOnline && (
          <button
            type="button"
            onClick={handleToggleVoiceRecord}
            className="music-btn"
            style={
              isRecording
                ? { background: '#e74c3c', borderColor: '#fff', animation: 'pulse-red-timer 0.5s infinite alternate' }
                : undefined
            }
            title="Voice Note"
          >
            🎤
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveModal('music')}
          className="music-btn"
          title="Toggle Music"
        >
          🎵
        </button>
        <button
          type="button"
          onClick={() => setActiveModal('settings')}
          className="music-btn"
          title="Game Settings"
        >
          ⚙️
        </button>
      </div>

      {/* Tap-to-Listen Whisper & Voice Note Pills + Active Whisper Recording Indicator (Online Only) */}
      {isOnline &&
        (whisperRecordingSeat !== null ||
          Object.keys(incomingWhispers).length > 0 ||
          pendingVoiceNotes.length > 0) && (
          <div
            style={{
              position: 'absolute',
              left: '14px',
              bottom: '130px',
              zIndex: 1850,
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              pointerEvents: 'auto',
            }}
          >
            {whisperRecordingSeat !== null && (
              <div className="flex items-center gap-2 rounded-full border border-[#e9d5ff] bg-[#6b21a8]/95 px-3 py-1.5 text-xs font-bold text-white shadow-lg">
                <span>
                  🤫 Whispering to {stripSeatTag(players[whisperRecordingSeat]?.name || '')}...
                </span>
                <button
                  type="button"
                  onClick={() => whisperRecorder.stopAndSend()}
                  className="cursor-pointer rounded-full bg-[#2ecc71] px-2 py-0.5 text-[10px] font-bold text-black"
                >
                  SEND
                </button>
                <button
                  type="button"
                  onClick={() => whisperRecorder.cancel()}
                  className="cursor-pointer rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] text-white"
                >
                  ✕
                </button>
              </div>
            )}

            {Object.values(incomingWhispers).map((w) => (
              <div
                key={w.id}
                className="flex items-center gap-1.5 rounded-full border border-[#e9d5ff] bg-[#581c87]/92 px-3 py-1.5 text-xs font-bold text-white shadow-lg"
              >
                <button
                  type="button"
                  onClick={() => playIncomingWhisper(w.fromSeat)}
                  className="flex cursor-pointer items-center gap-1.5 text-left"
                >
                  <span>🔊</span>
                  <span>
                    Whisper from {stripSeatTag(w.senderName)} ({w.duration}s) — Tap
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => dismissIncomingWhisper(w.fromSeat)}
                  className="ml-1 cursor-pointer rounded-full bg-black/35 px-1.5 py-0.5 text-[10px] text-white/80 hover:text-white"
                  title="Dismiss whisper"
                >
                  ✕
                </button>
              </div>
            ))}

            {pendingVoiceNotes.map((vn) => (
              <div
                key={vn.id}
                className="flex items-center gap-1.5 rounded-full border border-[#86efac] bg-[#14532d]/92 px-3 py-1.5 text-xs font-bold text-white shadow-lg"
              >
                <button
                  type="button"
                  onClick={() => playVoiceNote(vn.id)}
                  className="flex cursor-pointer items-center gap-1.5 text-left"
                >
                  <span>🔊</span>
                  <span>
                    Voice from {stripSeatTag(vn.sender)} ({vn.duration || 2}s) — Tap
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => dismissVoiceNote(vn.id)}
                  className="ml-1 cursor-pointer rounded-full bg-black/35 px-1.5 py-0.5 text-[10px] text-white/80 hover:text-white"
                  title="Dismiss voice note"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
};
