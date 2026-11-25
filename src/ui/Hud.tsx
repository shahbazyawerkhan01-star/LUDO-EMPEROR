import React, { useEffect, useMemo, useState } from 'react';
import { type NameplateScreenPos } from '../game/ludoScene';
import {
  canMovePawn,
  evaluateRivalryState,
  getLegalMoves,
  getPlayerColor,
  getPlayerProgressPercent,
  isLoneTokenOnTrack,
  resolveSeatDicePalette,
  shadeRgb,
  stripSeatTag,
} from '../game/rules';
import { voiceNoteRecorder } from '../network/audioCapture';
import { multiplayerClient } from '../network/multiplayerClient';
import { useGameStore } from '../state/store';
import { translate } from '../i18n';

function drawDie(
  ctx: CanvasRenderingContext2D,
  size: number,
  value: number,
  faceRgb: [number, number, number],
  sideRgb: [number, number, number],
  pipColor: string,
  borderColor: string,
  styleId: string,
  isBonus: boolean,
): void {
  const pad = 2;
  const s = size - pad * 2;
  const r = size * 0.26;
  ctx.clearRect(0, 0, size, size);

  // Subtle 3D extruded bevel base underneath face
  const traceRoundedRect = (x: number, y: number, w: number, h: number, rad: number) => {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  };

  ctx.save();
  traceRoundedRect(pad, pad, s, s, r);
  const topLight: [number, number, number] = [
    Math.min(255, Math.round(faceRgb[0] * 1.1 + 14)),
    Math.min(255, Math.round(faceRgb[1] * 1.1 + 14)),
    Math.min(255, Math.round(faceRgb[2] * 1.1 + 14)),
  ];
  const grad = ctx.createLinearGradient(pad, pad, pad + s, pad + s);
  grad.addColorStop(0, `rgb(${topLight[0]}, ${topLight[1]}, ${topLight[2]})`);
  grad.addColorStop(0.55, `rgb(${faceRgb[0]}, ${faceRgb[1]}, ${faceRgb[2]})`);
  grad.addColorStop(1, `rgb(${sideRgb[0]}, ${sideRgb[1]}, ${sideRgb[2]})`);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.clip();

  // Subtle bottom-right bevel shade band for crisp 3D depth
  const bevelDark = shadeRgb(faceRgb, 0.52);
  ctx.strokeStyle = `rgba(${bevelDark[0]}, ${bevelDark[1]}, ${bevelDark[2]}, 0.42)`;
  ctx.lineWidth = 4;
  traceRoundedRect(pad + 1, pad + 1, s - 2, s - 2, Math.max(4, r - 2));
  ctx.stroke();

  if (styleId === 'marble') {
    ctx.strokeStyle = 'rgba(120, 125, 135, 0.25)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(pad + s * 0.1, pad + s * 0.72);
    ctx.bezierCurveTo(pad + s * 0.4, pad + s * 0.48, pad + s * 0.65, pad + s * 0.56, pad + s * 0.92, pad + s * 0.22);
    ctx.stroke();
  } else if (styleId === 'galaxy') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    [
      [0.24, 0.2],
      [0.74, 0.3],
      [0.42, 0.8],
      [0.82, 0.72],
    ].forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(pad + s * px, pad + s * py, 1.3, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (styleId === 'ice' || styleId === 'holographic') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.moveTo(pad, pad + s * 0.35);
    ctx.lineTo(pad + s * 0.35, pad);
    ctx.lineTo(pad + s * 0.6, pad);
    ctx.lineTo(pad, pad + s * 0.6);
    ctx.closePath();
    ctx.fill();
  } else if (styleId === 'fire') {
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(pad + 2, pad + 2, s - 4, s - 4);
  }

  ctx.restore();

  // Outer rim stroke matching active seat shade / accent
  traceRoundedRect(pad, pad, s, s, r);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = isBonus ? '#ffd700' : borderColor;
  ctx.stroke();

  const dotCoords: Record<number, Array<[number, number]>> = {
    1: [[0.5, 0.5]],
    2: [[0.28, 0.28], [0.72, 0.72]],
    3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
    6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
  };
  const pips = dotCoords[value] || dotCoords[1];
  const pipR = s * 0.098;
  pips.forEach(([ux, uy]) => {
    const px = pad + s * ux;
    const py = pad + s * uy;
    ctx.fillStyle = pipColor;
    ctx.beginPath();
    ctx.arc(px, py, pipR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pipColor === '#2a2a2a' ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.26)';
    ctx.beginPath();
    ctx.arc(px - pipR * 0.25, py - pipR * 0.25, pipR * 0.34, 0, Math.PI * 2);
    ctx.fill();
  });
}

const HudDieFace: React.FC<{
  value: number;
  styleId: string;
  seatIdx: number;
  isTournament: boolean;
  isBonus: boolean;
}> = ({ value, styleId, seatIdx, isTournament, isBonus }) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const logical = 76;
    cvs.width = logical * dpr;
    cvs.height = logical * dpr;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const palette = resolveSeatDicePalette(seatIdx, isTournament, styleId);
    drawDie(
      ctx,
      logical,
      value,
      palette.faceRgb,
      palette.sideRgb,
      palette.pipColor,
      palette.borderColor,
      styleId,
      isBonus,
    );
  }, [value, styleId, seatIdx, isTournament, isBonus]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={`Die ${value}`}
      style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
    />
  );
};

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

  const legalMoves = useMemo(
    () => (hasRolled && !isRolling ? getLegalMoves(pawns, currentPlayer, movesAvailable, dice) : []),
    [hasRolled, isRolling, pawns, currentPlayer, movesAvailable, dice],
  );

  const handleCombinedMove = () => {
    if (!canCombinedMove) return;
    const lonePawnIdx = pawns[currentPlayer].findIndex((p) => p.status === 'on-path');
    if (lonePawnIdx < 0) return;
    if (isOnline) {
      if (useGameStore.getState().attemptOnlineMoveWithCoachCheck(lonePawnIdx, combinedTotal, 'combined')) {
        multiplayerClient.movePawn(lonePawnIdx, combinedTotal, 'combined');
      }
    } else {
      useGameStore.getState().handleLocalCombinedMove(currentPlayer, lonePawnIdx);
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
              onClick={() => openProfileModal(entry.idx)}
              title={
                isDethroneTarget
                  ? `Dethrone Target (${rivalry.leaderPct}%)`
                  : `View ${entry.fullName}`
              }
              style={{
                width: `${entry.widthPct}%`,
                backgroundColor: entry.color,
                cursor: 'pointer',
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
      {(() => {
        const activeSeatColor = getPlayerColor(currentPlayer, isTournament);
        if (hasRolled && !isRolling && movesAvailable.length > 0) {
          return (
            <div id="dice-hud">
              {movesAvailable.map((val, idx) => {
                const singlePlayable = legalMoves.some((m) => m.dieIdx === idx);
                const playable =
                  singlePlayable || (canCombinedMove && legalMoves.some((m) => m.dieIdx === 'combined'));
                const selected = movesAvailable.length > 1 && selectedDieIndex === idx;
                return (
                  <button
                    key={`${idx}-${val}`}
                    type="button"
                    disabled={!isMyTurn || !singlePlayable || turnAutoPlay}
                    onClick={() => selectDieIndex(idx)}
                    className={`dice-val ${selected ? 'selected' : ''} ${isDoubleOrLucky ? 'bonus' : ''}`}
                    style={{
                      opacity: playable && !turnAutoPlay ? 1 : 0.43,
                      borderColor: selected ? '#ffffff' : activeSeatColor,
                      boxShadow: selected
                        ? `0 0 0 2px ${activeSeatColor}, 0 0 24px ${activeSeatColor}cc`
                        : playable
                          ? `0 6px 18px rgba(0, 0, 0, 0.5), 0 0 12px ${activeSeatColor}66`
                          : '0 4px 12px rgba(0, 0, 0, 0.35)',
                      padding: '4px',
                    }}
                  >
                    <HudDieFace
                      value={val}
                      styleId={prefs.diceStyle}
                      seatIdx={currentPlayer}
                      isTournament={isTournament}
                      isBonus={isDoubleOrLucky}
                    />
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
                    background: activeSeatColor,
                    borderColor: '#ffffff',
                    boxShadow: `0 0 22px ${activeSeatColor}cc`,
                    color: resolveSeatDicePalette(currentPlayer, isTournament, 'classic').pipColor,
                    fontSize: '20px',
                  }}
                >
                  USE {combinedTotal}
                </button>
              )}
            </div>
          );
        }

        const waitingIdle = canRoll;
        return (
          <button
            id="roll-hint"
            type="button"
            disabled={!canRoll}
            onClick={() => handleRoll(false)}
            className={waitingIdle ? 'waiting-idle' : ''}
            style={{
              cursor: canRoll ? 'pointer' : 'default',
              opacity: canRoll ? 1 : 0.88,
              pointerEvents: canRoll ? 'auto' : 'none',
              borderColor: waitingIdle ? activeSeatColor : `${activeSeatColor}77`,
              boxShadow: waitingIdle
                ? `0 0 20px ${activeSeatColor}88, inset 0 0 12px ${activeSeatColor}33`
                : `0 4px 14px rgba(0, 0, 0, 0.35)`,
            }}
          >
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: activeSeatColor,
                boxShadow: `0 0 8px ${activeSeatColor}`,
                flexShrink: 0,
              }}
            />
            <span>
              {turnAutoPlay
                ? "⏱️ Time's up! Auto-playing..."
                : isRolling
                  ? 'Rolling...'
                  : canRoll
                    ? translate(prefs.language, 'roll_hint')
                    : `${stripSeatTag(players[currentPlayer]?.name || 'Player')}'s turn!`}
            </span>
          </button>
        );
      })()}

      {/* Bottom-Right Compact Audio, Music, AI Voice Mute & Settings Buttons */}
      <div id="music-controls-overlay">
        <button
          type="button"
          onClick={() => setActiveModal('music')}
          className="music-btn"
          style={
            prefs.musicId !== 'none' && (prefs.musicVolume ?? 0.45) > 0.005
              ? { borderColor: '#f1c40f', boxShadow: '0 0 12px rgba(241, 196, 15, 0.5)' }
              : { opacity: 0.72 }
          }
          title="Background Music"
        >
          🎵
        </button>
        <button
          id="board-ai-mute-btn"
          type="button"
          onClick={toggleAiVoiceMute}
          className="music-btn ai-mute-btn"
          style={
            prefs.aiVoiceMuted
              ? {
                  background: 'rgba(231, 76, 60, 0.85)',
                  borderColor: '#ffb3ad',
                  color: '#ffffff',
                }
              : speakingSeat !== null
                ? {
                    background: 'rgba(39, 174, 96, 0.45)',
                    borderColor: '#f1c40f',
                    boxShadow: '0 0 14px rgba(241, 196, 15, 0.75)',
                  }
                : {
                    background: 'rgba(22, 101, 52, 0.72)',
                    borderColor: 'rgba(74, 222, 128, 0.75)',
                  }
          }
          title={prefs.aiVoiceMuted ? 'Unmute AI Voices' : 'Mute AI Voices'}
          aria-label={prefs.aiVoiceMuted ? 'Unmute AI Voices' : 'Mute AI Voices'}
        >
          <span>{prefs.aiVoiceMuted ? '🔇' : '🗣️'}</span>
          <span>{prefs.aiVoiceMuted ? 'AI OFF' : 'AI ON'}</span>
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
