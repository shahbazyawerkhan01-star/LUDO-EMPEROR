import React, { useEffect, useMemo, useState } from 'react';
import { type NameplateScreenPos } from '../game/ludoScene';
import {
  canAnyPawnMove,
  canMovePawn,
  evaluateRivalryState,
  getPlayerColor,
  getPlayerProgressPercent,
  isLoneTokenOnTrack,
  stripSeatTag,
} from '../game/rules';
import { voiceNoteRecorder } from '../network/audioCapture';
import { multiplayerClient } from '../network/multiplayerClient';
import { useGameStore } from '../state/store';
import { translate } from '../i18n';

interface HudProps {
  onToggleAspectRatio: () => void;
  nameplates: NameplateScreenPos[];
}

export const Hud: React.FC<HudProps> = ({
  onToggleAspectRatio,
  nameplates,
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
    whisperBadges,
    pendingVoiceNotes,
    selectDieIndex,
    rollLocalDice,
    setActiveModal,
    openProfileModal,
    openWhisperModal,
    toggleAiVoiceMute,
    playIncomingWhisper,
    dismissIncomingWhisper,
    playVoiceNote,
    dismissVoiceNote,
  } = useGameStore();

  const [isRecording, setIsRecording] = useState(() => voiceNoteRecorder.isRecording());

  useEffect(() => {
    const unsub = voiceNoteRecorder.subscribe(setIsRecording);
    return () => {
      unsub();
      if (voiceNoteRecorder.isRecording()) {
        voiceNoteRecorder.cancel();
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

  const rivalry = useMemo(() => evaluateRivalryState(pawns, -1), [pawns]);

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
    setActiveModal('chat');
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
          const isDethroneTarget =
            rivalry.tier === 'dethrone' && rivalry.leaderIdx === entry.idx;
          return (
            <div
              key={entry.idx}
              id={`judge-${entry.idx}`}
              className="judge-segment"
              title={
                isDethroneTarget
                  ? `Dethrone Target (${rivalry.leaderPct}%)`
                  : undefined
              }
              style={{
                width: `${entry.widthPct}%`,
                backgroundColor: entry.color,
                boxShadow: isAiSpeakingNow
                  ? 'inset 0 0 0 3px #f1c40f'
                  : isDethroneTarget
                    ? 'inset 0 0 0 2px #ff4757'
                    : currentPlayer === entry.idx
                      ? 'inset 0 0 0 2px #ffffff'
                      : undefined,
              }}
            >
              <div className="judge-name" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {isAiSpeakingNow ? <span>🗣️</span> : isDethroneTarget ? <span>🎯</span> : null}
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
        {top3Rankings.map((entry, rankIdx) => {
          const isDethroneTarget =
            rivalry.tier === 'dethrone' && rivalry.leaderIdx === entry.idx;
          return (
            <div
              key={entry.idx}
              className="rank-segment"
              onClick={() => openProfileModal(entry.idx)}
              title={
                isDethroneTarget
                  ? `Dethrone Target (${rivalry.leaderPct}%)`
                  : undefined
              }
              style={{
                backgroundColor: entry.color,
                cursor: 'pointer',
                boxShadow: isDethroneTarget
                  ? 'inset 0 0 0 2px #ff4757'
                  : currentPlayer === entry.idx
                    ? 'inset 0 0 0 2px #fff'
                    : undefined,
              }}
            >
              <div className="rank-header-row">
                <span className="rank-badge">{isDethroneTarget ? '🎯' : `#${rankIdx + 1}`}</span>
                <span className="rank-name">{entry.cleanName}</span>
              </div>
              <div className="rank-stats-row">
                <span className="rank-wins">Win:{entry.wins}</span>
                {isTournament && <span className="rank-balance">${entry.bal}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Whisper Layer for Board Nameplates (Rendered Directly Inside Each Rotated Nameplate) */}
      {isOnline &&
        nameplates.map((plate) => {
          const seatPlayer = players[plate.seatIdx];
          if (!seatPlayer) return null;
          const cleanName = stripSeatTag(seatPlayer.name);
          const isMe = mySeat === plate.seatIdx;
          const canWhisperTarget =
            !seatPlayer.isAI && !isMe && !!onlineSeats[plate.seatIdx]?.connected;
          const pendingWhisper = incomingWhispers[plate.seatIdx];
          const hasPulseBadge = !!whisperBadges[plate.seatIdx];
          const isSeatMuted = !isMe && prefs.mutedSeats.includes(plate.seatIdx);
          if (!canWhisperTarget && !pendingWhisper && !hasPulseBadge && !isSeatMuted) return null;

          const plateW = Math.max(88, plate.w);
          const plateH = Math.max(22, plate.h);
          const badgeSize = Math.max(16, Math.min(22, Math.round(plateH - 2)));
          const iconFontSize = Math.max(11, badgeSize - 7);

          return (
            <div
              key={`plate-whisper-${plate.seatIdx}`}
              className="nameplate-overlay"
              style={{
                left: `${plate.x}px`,
                top: `${plate.y}px`,
                width: `${plateW}px`,
                height: `${plateH}px`,
                transform: `translate(-50%, -50%) rotate(${plate.angleDeg}deg)`,
              }}
            >
              {(canWhisperTarget || !!pendingWhisper) && (
                <button
                  type="button"
                  className={`nameplate-hit-btn ${pendingWhisper ? 'has-pending-whisper' : ''}`}
                  title={
                    pendingWhisper
                      ? `Tap to play unheard whisper from ${cleanName}`
                      : `Open Private Whisper to ${cleanName}`
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (pendingWhisper) {
                      playIncomingWhisper(plate.seatIdx);
                      return;
                    }
                    if (canWhisperTarget) {
                      openWhisperModal([plate.seatIdx]);
                    }
                  }}
                  aria-label={
                    pendingWhisper
                      ? `Play whisper from ${cleanName}`
                      : `Whisper to ${cleanName}`
                  }
                />
              )}

              {pendingWhisper ? (
                <button
                  type="button"
                  className="nameplate-status-badge whisper-pill"
                  style={{ height: `${badgeSize}px`, fontSize: `${Math.max(10, badgeSize - 8)}px` }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    playIncomingWhisper(plate.seatIdx);
                  }}
                  title="Tap to play private whisper"
                >
                  🔊 🤫
                </button>
              ) : hasPulseBadge ? (
                <button
                  type="button"
                  className="nameplate-status-badge whisper-pulse"
                  style={{
                    width: `${badgeSize}px`,
                    height: `${badgeSize}px`,
                    fontSize: `${iconFontSize}px`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canWhisperTarget) openWhisperModal([plate.seatIdx]);
                  }}
                  title={`${cleanName} whispered to you — tap to reply`}
                >
                  🤫
                </button>
              ) : isSeatMuted ? (
                <button
                  type="button"
                  className="nameplate-status-badge muted-badge"
                  style={{
                    height: `${badgeSize}px`,
                    fontSize: `${Math.max(10, badgeSize - 8)}px`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canWhisperTarget) openWhisperModal([plate.seatIdx]);
                  }}
                  title={`${cleanName} is muted`}
                >
                  {canWhisperTarget ? '🔇 🤫' : '🔇'}
                </button>
              ) : canWhisperTarget ? (
                <button
                  type="button"
                  className="nameplate-status-badge whisper-hint"
                  style={{
                    width: `${badgeSize}px`,
                    height: `${badgeSize}px`,
                    fontSize: `${iconFontSize}px`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    openWhisperModal([plate.seatIdx]);
                  }}
                  title={`Whisper privately to ${cleanName}`}
                >
                  🤫
                </button>
              ) : null}
            </div>
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

      {/* Autoplay-Blocked Fallback Whisper & Voice Note Pills (Online Only) */}
      {isOnline &&
        (Object.keys(incomingWhispers).length > 0 || pendingVoiceNotes.length > 0) && (
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
