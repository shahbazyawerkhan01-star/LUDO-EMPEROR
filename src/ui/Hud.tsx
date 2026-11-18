import React, { useMemo, useRef, useState } from 'react';
import {
  canAnyPawnMove,
  canMovePawn,
  getPlayerColor,
  getPlayerProgressPercent,
  isLoneTokenOnTrack,
  stripSeatTag,
} from '../game/rules';
import { multiplayerClient } from '../network/multiplayerClient';
import { useGameStore } from '../state/store';
import { translate } from '../i18n';

const REACTION_EMOJIS = ['😂', '❤️', '🔥', '😡', '👍'];

interface HudProps {
  onToggleAspectRatio: () => void;
}

export const Hud: React.FC<HudProps> = ({ onToggleAspectRatio }) => {
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
    prefs,
    winStats,
    wishUsedThisMatch,
    roomCode,
    onlineTimerConfig,
    speakingSeat,
    selectDieIndex,
    rollLocalDice,
    setActiveModal,
    openProfileModal,
    triggerReaction,
    toggleAiVoiceMute,
    toggleSeatMute,
    showToast,
  } = useGameStore();

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Exact original updateAIJudge: Top 3 leaders with short name + % + inline reaction tray
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
  const canRoll = isMyTurn && !hasRolled && !isRolling;
  const wishAvailable = isMyTurn && !hasRolled && !isRolling && !wishUsedThisMatch[currentPlayer];

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
      multiplayerClient.movePawn(lonePawnIdx, combinedTotal, 'combined');
    } else {
      useGameStore.getState().handleLocalPawnTap(currentPlayer, lonePawnIdx);
    }
  };

  const handleToggleVoiceRecord = async () => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('Microphone unavailable in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      const startedAt = Date.now();
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = typeof reader.result === 'string' ? reader.result : '';
          if (!base64) return;
          const dur = Math.max(1, Math.min(10, Math.round((Date.now() - startedAt) / 1000)));
          if (isOnline) {
            multiplayerClient.sendVoiceNote(base64, dur);
            showToast('Voice note sent!');
          } else {
            new Audio(base64).play().catch(() => {});
            showToast('Voice note recorded!');
          }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
        }
      }, 6500);
    } catch {
      showToast('Microphone permission denied.');
    }
  };

  const sendEmoji = (seatIdx: number, emoji: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOnline) {
      multiplayerClient.sendReaction(emoji);
    } else {
      triggerReaction(seatIdx, emoji);
    }
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

      {/* Exact Original Top-3 AI Judge Progress Bar with Inline Emoji & Mute Controls */}
      <div id="ai-judge-bar" className={isTournament ? 'tournament' : ''}>
        {top3Judges.map((entry) => {
          const isSeatMuted = prefs.aiVoiceMuted || prefs.mutedSeats.includes(entry.idx);
          const isSpeakingNow = speakingSeat === entry.idx;
          return (
            <div
              key={entry.idx}
              id={`judge-${entry.idx}`}
              className="judge-segment"
              style={{
                width: `${entry.widthPct}%`,
                backgroundColor: entry.color,
                boxShadow: isSpeakingNow
                  ? 'inset 0 0 0 3px #f1c40f'
                  : currentPlayer === entry.idx
                    ? 'inset 0 0 0 2px #ffffff'
                    : undefined,
              }}
            >
              <div className="judge-name">
                {isSpeakingNow ? '🗣️ ' : ''}
                {entry.shortName}: {entry.pct}%
              </div>
              <div
                className="emoji-tray"
                style={{ fontSize: entry.widthPct < 24 ? '10px' : '13px' }}
              >
                <button
                  type="button"
                  className="react-btn"
                  title={
                    entry.isAI
                      ? isSeatMuted
                        ? `Unmute ${entry.fullName}`
                        : `Mute ${entry.fullName}`
                      : 'Send Voice Note'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!entry.isAI) {
                      handleToggleVoiceRecord();
                    } else if (prefs.aiVoiceMuted) {
                      toggleAiVoiceMute();
                    } else {
                      toggleSeatMute(entry.idx);
                    }
                  }}
                  style={{ fontSize: '12px', opacity: entry.isAI && isSeatMuted ? 0.55 : 0.92 }}
                >
                  {entry.isAI ? (isSeatMuted ? '🔇' : '🔊') : '🎤'}
                </button>
                <button
                  type="button"
                  className="react-btn"
                  title="Player Profile & Chat"
                  onClick={(e) => {
                    e.stopPropagation();
                    openProfileModal(entry.idx);
                  }}
                  style={{ opacity: 0.85 }}
                >
                  💬
                </button>
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="react-btn"
                    onClick={(e) => sendEmoji(entry.idx, emoji, e)}
                  >
                    {emoji}
                  </button>
                ))}
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
            ⏳ {turnSecondsLeft}s
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

      {/* Lucky Wish Floating Button (Bottom-Left) */}
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
                disabled={!isMyTurn || !playable}
                onClick={() => selectDieIndex(idx)}
                className={`dice-val ${selected ? 'selected' : ''} ${isDoubleOrLucky ? 'bonus' : ''}`}
                style={{
                  opacity: playable ? 1 : 0.4,
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
          onClick={() => handleRoll(false)}
          style={{
            cursor: canRoll ? 'pointer' : 'default',
            opacity: canRoll ? 1 : 0.85,
            pointerEvents: canRoll ? 'auto' : 'none',
          }}
        >
          {isRolling
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
    </div>
  );
};
