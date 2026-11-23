import React, { useEffect, useState } from 'react';
import { BACKGROUNDS, BOARD_THEMES, DICE_STYLES, getPlayerColor, stripSeatTag } from '../game/rules';
import { MUSIC_TRACKS, sfx } from '../game/sfx';
import { LANGUAGE_OPTIONS, translate } from '../i18n';
import { voiceNoteRecorder } from '../network/audioCapture';
import { multiplayerClient } from '../network/multiplayerClient';
import { useGameStore } from '../state/store';
import { ChatDrawerModal } from './ChatDrawerModal';
import { MultiplayerLobbyModal } from './MultiplayerLobbyModal';
import { TutorialModal } from './TutorialModal';
import { WhisperComposerModal } from './WhisperComposerModal';

const QUICK_CHAT_PRESETS = [
  'Good move! 👏',
  'Play fast! ⏱️',
  'So lucky! 🍀',
  'Watch out! 🔥',
  'Oops! 😅',
  'Well played! 👍',
];

export const Modals: React.FC = () => {
  const {
    activeModal,
    profileSeatIdx,
    wishSeatIdx,
    prefs,
    players,
    winStats,
    rankings,
    winner,
    isTournament,
    isOnline,
    mySeat,
    onlineSeats,
    turnAutoPlay,
    pendingGulMove,
    incomingWhispers,
    chatMessages,
    whisperModalOpen,
    setActiveModal,
    openWhisperModal,
    updatePrefs,
    updatePlayer,
    resetWinStats,
    confirmCoachSkipMove,
    confirmGulChoice,
    speakPlayerText,
    toggleAiVoiceMute,
    toggleSeatMute,
    playIncomingWhisper,
    dismissIncomingWhisper,
    playVoiceNote,
    triggerAiLine,
    triggerReaction,
    startLocalMatch,
    exitMatchToMenu,
    showToast,
  } = useGameStore();

  const [profileMsg, setProfileMsg] = useState('');
  const [wishSeat, setWishSeat] = useState(0);
  const [recordingVoice, setRecordingVoice] = useState(() => voiceNoteRecorder.isRecording());

  useEffect(() => {
    setWishSeat(wishSeatIdx);
  }, [wishSeatIdx]);

  useEffect(() => {
    const unsub = voiceNoteRecorder.subscribe(setRecordingVoice);
    return () => {
      unsub();
    };
  }, []);

  if (!activeModal && !whisperModalOpen) return null;
  if (activeModal === 'lobby') {
    return (
      <>
        <MultiplayerLobbyModal />
        <WhisperComposerModal />
      </>
    );
  }
  if (activeModal === 'chat') {
    return (
      <>
        <ChatDrawerModal />
        <WhisperComposerModal />
      </>
    );
  }
  if (!activeModal && whisperModalOpen) {
    return <WhisperComposerModal />;
  }

  const close = () => {
    setActiveModal(null);
  };

  const handleProfileVoiceRecord = () => {
    void voiceNoteRecorder.toggle();
  };

  const isMirrorMessageModal =
    activeModal === 'profile' ||
    activeModal === 'coachSkip' ||
    activeModal === 'gulPass';

  return (
    <div
      onClick={(e) => {
        if (
          e.target === e.currentTarget &&
          (activeModal === 'profile' || activeModal === 'coachSkip' || activeModal === 'howto')
        ) {
          close();
        }
      }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 4000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isMirrorMessageModal ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.78)',
        backdropFilter: isMirrorMessageModal ? 'blur(4px)' : 'blur(8px)',
        padding: '16px',
      }}
    >
      {/* 1. Settings Modal */}
      {activeModal === 'settings' && (
        <div className="royal-modal-card modal-scroll w-full max-w-[460px] max-h-[90vh] space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="royal-modal-title text-2xl">⚙️ {translate(prefs.language, 'settings')}</h2>
            <button
              type="button"
              onClick={close}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-white/10 font-bold text-white hover:bg-white/20"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <label className="mb-1 block font-display text-xs font-bold text-[#f1c40f] uppercase">
                Board Theme
              </label>
              <select
                value={prefs.boardThemeId}
                onChange={(e) => updatePrefs({ boardThemeId: e.target.value })}
                className="w-full rounded-xl border border-white/20 bg-black/80 px-3 py-2.5 text-sm font-semibold text-white"
              >
                {Object.entries(BOARD_THEMES).map(([id, theme]) => (
                  <option key={id} value={id}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-display text-xs font-bold text-[#f1c40f] uppercase">
                3D Dice Style
              </label>
              <select
                value={prefs.diceStyle}
                onChange={(e) => updatePrefs({ diceStyle: e.target.value })}
                className="w-full rounded-xl border border-white/20 bg-black/80 px-3 py-2.5 text-sm font-semibold text-white"
              >
                {Object.entries(DICE_STYLES).map(([id, ds]) => (
                  <option key={id} value={id}>
                    {ds.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-display text-xs font-bold text-[#f1c40f] uppercase">
                Background Texture
              </label>
              <select
                value={prefs.backgroundId}
                onChange={(e) => updatePrefs({ backgroundId: e.target.value })}
                className="w-full rounded-xl border border-white/20 bg-black/80 px-3 py-2.5 text-sm font-semibold text-white"
              >
                {BACKGROUNDS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-display text-xs font-bold text-[#f1c40f] uppercase">
                Language
              </label>
              <select
                value={prefs.language}
                onChange={(e) => updatePrefs({ language: e.target.value })}
                className="w-full rounded-xl border border-white/20 bg-black/80 px-3 py-2.5 text-sm font-semibold text-white"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-display text-xs font-bold text-[#f1c40f] uppercase">
                Turn Timer
              </label>
              <select
                value={prefs.turnTimerEnabled ? prefs.turnTimerDuration : 0}
                onChange={(e) => {
                  const val = Number(e.target.value) as 60 | 90 | 120 | 0;
                  updatePrefs({ turnTimerEnabled: val !== 0, turnTimerDuration: val });
                }}
                className="w-full rounded-xl border border-white/20 bg-black/80 px-3 py-2.5 text-sm font-semibold text-white"
              >
                <option value={60}>60 Seconds</option>
                <option value={90}>90 Seconds</option>
                <option value={120}>120 Seconds</option>
                <option value={0}>Off</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block font-display text-xs font-bold text-[#f1c40f] uppercase">
                Capture Warning (Compulsory Rule)
              </label>
              <select
                value={prefs.captureWarningMode ?? 'first3'}
                onChange={(e) => {
                  const val = e.target.value as 'first3' | 'always' | 'off';
                  updatePrefs({ captureWarningMode: val });
                }}
                className="w-full rounded-xl border border-white/20 bg-black/80 px-3 py-2.5 text-sm font-semibold text-white"
              >
                <option value="first3">Newcomers (First 3 Matches per Player)</option>
                <option value="always">Always ON</option>
                <option value="off">Off</option>
              </select>
            </div>

            <div>
              <div className="mb-1 flex justify-between font-display text-xs font-bold text-[#f1c40f]">
                <span>PENTAGON PERSPECTIVE TILT</span>
                <span className="tabular-nums">{Math.round((prefs.cameraTilt ?? 0.75) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.55}
                max={1.0}
                step={0.01}
                value={prefs.cameraTilt ?? 0.75}
                onChange={(e) => updatePrefs({ cameraTilt: Number(e.target.value) })}
                className="w-full accent-[#f1c40f]"
              />
            </div>

            <div>
              <div className="mb-1 flex justify-between font-display text-xs font-bold text-[#f1c40f]">
                <span>SFX &amp; VOICE VOLUME</span>
                <span className="tabular-nums">{Math.round(prefs.volume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={prefs.volume}
                onChange={(e) => updatePrefs({ volume: Number(e.target.value) })}
                className="w-full accent-[#f1c40f]"
              />
            </div>

            <div>
              <div className="mb-1 flex justify-between font-display text-xs font-bold text-[#f1c40f]">
                <span>MUSIC VOLUME</span>
                <span className="tabular-nums">{Math.round(prefs.musicVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={prefs.musicVolume}
                onChange={(e) => updatePrefs({ musicVolume: Number(e.target.value) })}
                className="w-full accent-[#2ecc71]"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-3 py-2.5">
              <div className="flex flex-col">
                <span className="font-display text-xs font-bold text-white uppercase">
                  AI Speaking Voices
                </span>
                {prefs.mutedSeats.length > 0 && !prefs.aiVoiceMuted && (
                  <button
                    type="button"
                    onClick={() => updatePrefs({ mutedSeats: [] })}
                    className="mt-0.5 cursor-pointer text-left text-[11px] font-semibold text-[#f1c40f] underline"
                  >
                    Unmute {prefs.mutedSeats.length} individually muted AI
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={toggleAiVoiceMute}
                className="cursor-pointer rounded-lg px-3.5 py-1 font-display text-xs font-bold"
                style={{
                  background: prefs.aiVoiceMuted ? '#e74c3c' : '#2ecc71',
                  color: prefs.aiVoiceMuted ? '#fff' : '#000',
                }}
              >
                {prefs.aiVoiceMuted ? '🔇 MUTED' : '🗣️ ON'}
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-3 py-2.5">
              <div className="flex flex-col">
                <span className="font-display text-xs font-bold text-white uppercase">
                  Auto-Play Voice Notes
                </span>
                <span className="text-[11px] text-white/65">
                  {prefs.autoPlayVoiceNotes !== false
                    ? 'Plays incoming notes aloud (tap ▶ in chat anytime)'
                    : 'Tap ▶ Play in room chat to listen'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextVal = !(prefs.autoPlayVoiceNotes !== false);
                  updatePrefs({ autoPlayVoiceNotes: nextVal });
                  showToast(nextVal ? '🔊 Auto-Play Voice Notes: ON' : '🔇 Auto-Play Voice Notes: OFF');
                }}
                className="cursor-pointer rounded-lg px-3.5 py-1 font-display text-xs font-bold"
                style={{
                  background: prefs.autoPlayVoiceNotes !== false ? '#2ecc71' : 'rgba(255,255,255,0.12)',
                  color: prefs.autoPlayVoiceNotes !== false ? '#000' : '#fff',
                }}
              >
                {prefs.autoPlayVoiceNotes !== false ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-3 py-2.5">
              <span className="font-display text-xs font-bold text-white uppercase">
                Auto-Rotate Board Toward Active Seat
              </span>
              <button
                type="button"
                onClick={() => {
                  const nextRotate = !prefs.rotateBoard;
                  updatePrefs({ rotateBoard: nextRotate });
                  showToast(nextRotate ? '🔄 Auto-Rotate Board: ON' : 'Auto-Rotate Board: OFF');
                }}
                className="cursor-pointer rounded-lg px-3.5 py-1 font-display text-xs font-bold"
                style={{
                  background: prefs.rotateBoard ? '#2ecc71' : 'rgba(255,255,255,0.12)',
                  color: prefs.rotateBoard ? '#000' : '#fff',
                }}
              >
                {prefs.rotateBoard ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={() => setActiveModal('howto')}
              className="w-full cursor-pointer rounded-xl bg-[#f1c40f] py-3 font-display text-sm font-bold text-black"
            >
              📖 HOW TO PLAY
            </button>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={resetWinStats}
                className="flex-1 cursor-pointer rounded-xl border border-[#e74c3c]/60 bg-[#e74c3c]/20 py-2.5 font-display text-xs font-bold text-[#ffb3ad]"
              >
                RESET STATS
              </button>
              {useGameStore.getState().screen === 'playing' && (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    exitMatchToMenu();
                  }}
                  className="flex-1 cursor-pointer rounded-xl border border-white/25 bg-white/10 py-2.5 font-display text-xs font-bold text-white"
                >
                  🚪 EXIT MATCH
                </button>
              )}
              <button
                type="button"
                onClick={close}
                className="flex-1 cursor-pointer rounded-xl bg-[#27ae60] py-2.5 font-display text-sm font-bold text-white"
              >
                DONE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Music Modal */}
      {activeModal === 'music' && (
        <div className="royal-modal-card modal-scroll w-full max-w-[440px] max-h-[90vh] space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="royal-modal-title text-2xl">🎵 BACKGROUND MUSIC</h2>
            <button
              type="button"
              onClick={close}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-white/10 font-bold text-white"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2">
            {MUSIC_TRACKS.filter((t) => t.id !== 'custom').map((track) => (
              <button
                key={track.id}
                type="button"
                onClick={() => updatePrefs({ musicId: track.id })}
                className={`music-option ${prefs.musicId === track.id ? 'active' : ''}`}
              >
                <span className="font-display font-bold">{track.label}</span>
                {prefs.musicId === track.id && <span>🔊</span>}
              </button>
            ))}

            <label className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#f1c40f]/55 bg-[#f1c40f]/10 py-3 font-display text-sm font-bold text-[#f1c40f] hover:bg-[#f1c40f]/20">
              <span>📁 UPLOAD CUSTOM AUDIO</span>
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const ok = await sfx.setCustomMusicFile(file);
                  if (ok) {
                    updatePrefs({ musicId: 'custom' });
                    showToast('Custom music playing!');
                  } else {
                    showToast('Could not decode audio file.');
                  }
                }}
              />
            </label>
          </div>
        </div>
      )}

      {/* 3. How To Play Modal */}
      {activeModal === 'howto' && <TutorialModal onClose={close} />}

      {/* 4. Local Lucky Wish Modal */}
      {activeModal === 'wish' && (
        <div className="royal-modal-card w-full max-w-[420px] space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="royal-modal-title text-2xl">✨ SET LUCKY WISH</h2>
            <button
              type="button"
              onClick={close}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-white/10 font-bold text-white"
            >
              ✕
            </button>
          </div>

          <p className="text-xs text-white/75">
            Choose each player&apos;s one-time guaranteed dice wish. Double 6 (6, 6) is blocked.
          </p>

          <select
            value={wishSeat}
            onChange={(e) => setWishSeat(Number(e.target.value))}
            className="w-full rounded-xl border border-white/20 bg-black/80 px-3 py-2.5 text-sm font-semibold text-white"
          >
            {players.map((p, i) => (
              <option key={i} value={i}>
                Seat {i + 1}: {stripSeatTag(p.name)} ({p.wish.join(' + ')})
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-3">
            {[0, 1].map((dieIdx) => (
              <div key={dieIdx} className="space-y-1.5">
                <span className="font-display text-xs font-bold text-[#f1c40f]">
                  DIE {dieIdx + 1}
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[1, 2, 3, 4, 5, 6].map((n) => {
                    const active = players[wishSeat]?.wish[dieIdx] === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          const cur = [...players[wishSeat].wish] as [number, number];
                          cur[dieIdx] = n;
                          if (cur[0] === 6 && cur[1] === 6) {
                            cur[1] = 5;
                            showToast('(6, 6) not allowed — adjusted to (6, 5)');
                          }
                          updatePlayer(wishSeat, { wish: cur });
                        }}
                        className="h-10 cursor-pointer rounded-xl font-display text-base font-bold"
                        style={{
                          background: active ? '#f1c40f' : 'rgba(255,255,255,0.08)',
                          color: active ? '#000' : '#fff',
                          border: active ? '2px solid #fff' : '1px solid rgba(255,255,255,0.18)',
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={close}
            className="w-full cursor-pointer rounded-xl bg-[#27ae60] py-3 font-display text-base font-bold text-white"
          >
            CONFIRM WISH
          </button>
        </div>
      )}

      {/* 5. Seat Profile / Chat / Voice (Crystal Mirror-Glass Window) */}
      {activeModal === 'profile' && profileSeatIdx !== null && (() => {
        const seatPlayer = players[profileSeatIdx];
        const isHumanSeat = !seatPlayer?.isAI;
        const isMyProfile = isOnline && mySeat === profileSeatIdx;
        const isSeatLocallyMuted = prefs.mutedSeats.includes(profileSeatIdx);

        return (
          <div className="mirror-message-card w-full max-w-[400px] space-y-4">
            <div className="flex items-center justify-between border-b border-white/35 pb-3">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/55 text-xl"
                  style={{ backgroundColor: getPlayerColor(profileSeatIdx, isTournament) }}
                >
                  {seatPlayer?.icon || '🤴'}
                </span>
                <div>
                  <h2
                    className="flex items-center gap-2 font-display text-xl font-bold text-white"
                    style={{
                      textShadow: '0 2px 6px rgba(0, 0, 0, 0.98)',
                    }}
                  >
                    <span>{stripSeatTag(seatPlayer?.name || '')}</span>
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="mirror-glass-btn flex h-9 w-9 cursor-pointer items-center justify-center rounded-full font-bold text-white"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!profileMsg.trim()) return;
                if (isOnline) {
                  multiplayerClient.sendChat(profileMsg.trim());
                } else {
                  speakPlayerText(profileSeatIdx, profileMsg.trim());
                }
                setProfileMsg('');
                close();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                maxLength={80}
                value={profileMsg}
                onChange={(e) => setProfileMsg(e.target.value)}
                placeholder="Say something..."
                className="mirror-glass-input flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
              />
              <button
                type="submit"
                className="cursor-pointer rounded-xl border border-white/70 bg-[#f1c40f]/90 px-4 font-display text-sm font-bold text-black shadow-md hover:bg-[#f1c40f]"
                style={{ textShadow: 'none' }}
              >
                SEND
              </button>
            </form>

            {/* Ludo-style 1-Tap Quick-Chat Presets */}
            <div className="grid grid-cols-3 gap-1.5">
              {QUICK_CHAT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    if (isOnline) {
                      multiplayerClient.sendChat(preset);
                    } else {
                      speakPlayerText(profileSeatIdx, preset);
                    }
                    close();
                  }}
                  className="mirror-glass-btn cursor-pointer truncate rounded-lg px-2 py-2 text-xs font-bold text-white hover:border-[#f1c40f]"
                >
                  {preset}
                </button>
              ))}
            </div>

            {seatPlayer?.isAI && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => toggleSeatMute(profileSeatIdx)}
                  className="mirror-glass-btn cursor-pointer rounded-xl py-2.5 font-display text-xs font-bold text-white"
                  style={{
                    background: isSeatLocallyMuted
                      ? 'rgba(231, 76, 60, 0.45)'
                      : 'rgba(0, 0, 0, 0.24)',
                  }}
                >
                  {isSeatLocallyMuted ? '🔊 UNMUTE THIS AI' : '🔇 MUTE THIS AI'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerAiLine(profileSeatIdx, 'banter');
                    close();
                  }}
                  className="mirror-glass-btn cursor-pointer rounded-xl border-[#f1c40f]/75 bg-[#f1c40f]/25 py-2.5 font-display text-xs font-bold text-[#ffe57f]"
                >
                  🗣️ SPEAK NOW
                </button>
              </div>
            )}

            {/* Per-Player Mute Button for Remote Online Human Players */}
            {isOnline && isHumanSeat && !isMyProfile && (
              <button
                type="button"
                onClick={() => toggleSeatMute(profileSeatIdx)}
                className="mirror-glass-btn w-full cursor-pointer rounded-xl py-2 font-display text-xs font-bold text-white"
                style={{
                  background: isSeatLocallyMuted
                    ? 'rgba(231, 76, 60, 0.55)'
                    : 'rgba(255, 255, 255, 0.1)',
                }}
              >
                {isSeatLocallyMuted ? '🔊 UNMUTE PLAYER' : '🔇 MUTE PLAYER'}
              </button>
            )}

            {isOnline && (
              <button
                type="button"
                onClick={handleProfileVoiceRecord}
                className="mirror-glass-btn w-full cursor-pointer rounded-xl py-2.5 font-display text-sm font-bold text-white"
                style={{ background: recordingVoice ? 'rgba(231, 76, 60, 0.78)' : 'rgba(0, 0, 0, 0.24)' }}
              >
                {recordingVoice ? '⏹️ STOP & SEND VOICE MSG' : '🎤 VOICE MSG (ALL)'}
              </button>
            )}

            {isOnline && (() => {
              const recentVoice = chatMessages
                .filter((m) => !!m.audioData && m.kind !== 'whisper_in' && m.kind !== 'whisper_out')
                .slice(-3)
                .reverse();
              if (recentVoice.length === 0) return null;
              return (
                <div className="space-y-1.5 rounded-xl border border-white/25 bg-black/25 p-2.5">
                  <div className="font-display text-[10px] font-bold text-[#86efac] uppercase">
                    🎤 Recent Voice Notes
                  </div>
                  <div className="flex flex-col gap-1">
                    {recentVoice.map((vn) => (
                      <div key={vn.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-semibold text-white">
                          {stripSeatTag(vn.sender)} ({vn.duration || 2}s)
                        </span>
                        <button
                          type="button"
                          onClick={() => playVoiceNote(vn.id)}
                          className="cursor-pointer rounded-full border border-[#86efac] bg-[#166534] px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-[#15803d]"
                        >
                          ▶ Play
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Private Targeted Whisper Controls (Remote Human Seats in Online Multiplayer Only) */}
            {isOnline && isHumanSeat && !isMyProfile && (() => {
              const incomingFromSeat = incomingWhispers[profileSeatIdx];
              const isRemoteConnected = !!onlineSeats[profileSeatIdx]?.connected;
              return (
                <div className="space-y-2 rounded-2xl border border-[#c084fc]/60 bg-[#581c87]/30 p-3">
                  {incomingFromSeat && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => playIncomingWhisper(profileSeatIdx)}
                        className="flex-1 cursor-pointer rounded-xl border border-[#e9d5ff] bg-[#7e22ce] py-2 font-display text-xs font-bold text-white shadow hover:bg-[#9333ea]"
                      >
                        🔊 PLAY UNHEARD WHISPER ({incomingFromSeat.duration}s)
                      </button>
                      <button
                        type="button"
                        onClick={() => dismissIncomingWhisper(profileSeatIdx)}
                        className="cursor-pointer rounded-xl border border-white/30 bg-black/35 px-2.5 py-2 text-xs font-bold text-white"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!isRemoteConnected}
                    onClick={() => openWhisperModal([profileSeatIdx])}
                    className="w-full cursor-pointer rounded-xl border border-[#d8b4fe]/75 bg-[#7e22ce]/70 py-2.5 font-display text-xs font-bold text-white hover:bg-[#9333ea] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    🤫 Whisper
                  </button>
                </div>
              );
            })()}

            <div className="grid grid-cols-5 gap-2">
              {['😂', '🔥', '👍', '😡', '👑', '🎲', '⚔️', '😭', '👏', '😈'].map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    if (isOnline) multiplayerClient.sendReaction(em);
                    else triggerReaction(profileSeatIdx, em);
                    close();
                  }}
                  className="mirror-glass-btn flex h-11 w-full cursor-pointer items-center justify-center rounded-xl text-2xl"
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 6. Coach Skip Capture Confirmation (Crystal Mirror-Glass Window) */}
      {activeModal === 'coachSkip' && !turnAutoPlay && (
        <div className="mirror-message-card w-full max-w-[400px] space-y-4 text-center">
          <div className="text-4xl">⚠️</div>
          <h2 className="royal-modal-title text-xl">CAPTURE OPPORTUNITY!</h2>
          <p className="text-xs font-semibold leading-relaxed text-white">
            Compulsory capture rule: if you finish your turn without meeting an available capture on the open track, every non-capturing candidate token returns to base!
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={turnAutoPlay}
              onClick={close}
              className="cursor-pointer rounded-xl border border-white/65 bg-[#27ae60]/80 py-3 font-display text-sm font-bold text-white shadow-md hover:bg-[#27ae60]"
            >
              GO BACK &amp; CAPTURE
            </button>
            <button
              type="button"
              disabled={turnAutoPlay}
              onClick={() => {
                const st = useGameStore.getState();
                const pending = st.pendingCoachMove;
                confirmCoachSkipMove();
                if (st.isOnline && pending) {
                  multiplayerClient.movePawn(pending.pawnIdx, pending.steps, pending.dieIdx);
                }
              }}
              className="mirror-glass-btn cursor-pointer rounded-xl border-[#ffb3ad] bg-[#e74c3c]/45 py-3 font-display text-sm font-bold text-white"
            >
              MOVE ANYWAY
            </button>
          </div>
        </div>
      )}

      {/* 7. Gul or Pass Choice (Crystal Mirror-Glass Window) */}
      {activeModal === 'gulPass' && pendingGulMove && !turnAutoPlay && (
        <div className="mirror-message-card w-full max-w-[400px] space-y-4 text-center">
          <div className="text-4xl">👑</div>
          <h2 className="royal-modal-title text-2xl">GUL OR PASS?</h2>
          <p className="text-xs font-semibold leading-relaxed text-white">
            Your token reached Centre Home (69)! Choose <strong>GUL (ENTER)</strong> for a bonus turn, or <strong>PASS</strong> to keep it on your home path.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={turnAutoPlay}
              onClick={() => {
                if (useGameStore.getState().turnAutoPlay) return;
                if (isOnline) {
                  setActiveModal(null);
                  multiplayerClient.submitGulChoice('gul');
                } else {
                  confirmGulChoice('gul');
                }
              }}
              className="cursor-pointer rounded-xl border border-white/75 bg-[#f1c40f]/90 py-3 font-display text-base font-bold text-black shadow-md hover:bg-[#f1c40f]"
              style={{ textShadow: 'none' }}
            >
              GUL (ENTER)
            </button>
            <button
              type="button"
              disabled={turnAutoPlay}
              onClick={() => {
                if (useGameStore.getState().turnAutoPlay) return;
                if (isOnline) {
                  setActiveModal(null);
                  multiplayerClient.submitGulChoice('pass');
                } else {
                  confirmGulChoice('pass');
                }
              }}
              className="mirror-glass-btn cursor-pointer rounded-xl py-3 font-display text-base font-bold text-white"
            >
              PASS
            </button>
          </div>
        </div>
      )}

      {/* 8. Tournament Rules Modal (Coming Soon Preview) */}
      {activeModal === 'tournamentRules' && (
        <div className="royal-modal-card w-full max-w-[440px] space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="royal-modal-title text-2xl">🏆 {translate(prefs.language, 'tourney_rules_title')}</h2>
              <span className="rounded-md border border-[#f1c40f]/55 bg-[#f1c40f]/20 px-2 py-0.5 font-display text-[11px] font-bold tracking-wider text-[#f1c40f] uppercase">
                Coming Soon
              </span>
            </div>
            <button
              type="button"
              onClick={close}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-white/10 font-bold text-white"
            >
              ✕
            </button>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="rounded-xl border border-white/15 bg-white/5 p-3">
              <div className="font-display text-sm font-bold text-[#f1c40f]">
                {translate(prefs.language, 'fee_title')}
              </div>
              <div className="mt-1 text-white/75">{translate(prefs.language, 'fee_desc')}</div>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/5 p-3">
              <div className="font-display text-sm font-bold text-[#2ecc71]">
                {translate(prefs.language, 'reward_title')}
              </div>
              <div className="mt-1 text-white/75">{translate(prefs.language, 'reward_desc')}</div>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/5 p-3">
              <div className="font-display text-sm font-bold text-[#00d4ff]">
                {translate(prefs.language, 'm100_title')} / {translate(prefs.language, 'm1000_title')}
              </div>
              <div className="mt-1 text-white/75">Bonus rewards unlocked at 100 &amp; 1,000 lifetime wins.</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              showToast('🏆 Tournament Mode is Coming Soon!');
              close();
            }}
            className="w-full cursor-pointer rounded-xl border border-[#f1c40f]/45 bg-[#f1c40f]/15 py-3 font-display text-base font-bold text-[#f1c40f] hover:bg-[#f1c40f]/25"
          >
            🔒 COMING SOON — STAY TUNED
          </button>
        </div>
      )}

      {/* 9. Victory / Match Leaderboard Modal */}
      {activeModal === 'victory' && (
        <div className="royal-modal-card w-full max-w-[460px] space-y-4">
          <div className="text-center">
            <div className="text-5xl">🏆</div>
            <h2 className="royal-modal-title mt-1 text-2xl">
              {winner !== null ? `${stripSeatTag(players[winner]?.name || 'Player')} WINS!` : 'MATCH FINISHED!'}
            </h2>
            <p className="text-xs text-white/70">
              All 4 tokens reached their coloured home stretch.
            </p>
          </div>

          <div className="space-y-2">
            {rankings.map((r) => (
              <div
                key={r.seat}
                className="flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 text-center font-bold">{r.badge || `#${r.rank}`}</span>
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: getPlayerColor(r.seat, isTournament) }}
                  />
                  <span className="font-display text-sm font-bold text-white">
                    {stripSeatTag(r.name)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-white/85 tabular-nums">
                  <span>⚔️ {r.captures_made}</span>
                  <span>⚠️ {r.penalties}</span>
                  <span className="font-extrabold text-[#f1c40f]">{r.percentage}%</span>
                  {isTournament && (
                    <span className="font-bold text-[#2ecc71]">
                      ${winStats.balances[r.name] ?? winStats.balances[stripSeatTag(r.name)] ?? 5}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                if (isOnline) {
                  multiplayerClient.disconnectAndReset();
                } else {
                  exitMatchToMenu();
                }
              }}
              className="cursor-pointer rounded-xl border border-white/25 bg-white/10 py-3 font-display text-sm font-bold text-white"
            >
              MAIN MENU
            </button>
            {!isOnline && (
              <button
                type="button"
                onClick={() => startLocalMatch(isTournament)}
                className="cursor-pointer rounded-xl bg-[#27ae60] py-3 font-display text-sm font-bold text-white"
              >
                PLAY AGAIN
              </button>
            )}
          </div>
        </div>
      )}
      <WhisperComposerModal />
    </div>
  );
};
