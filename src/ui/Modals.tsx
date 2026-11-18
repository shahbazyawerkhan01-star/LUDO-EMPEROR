import React, { useEffect, useRef, useState } from 'react';
import { BACKGROUNDS, BOARD_THEMES, DICE_STYLES, getPlayerColor, stripSeatTag } from '../game/rules';
import { MUSIC_TRACKS, sfx } from '../game/sfx';
import { LANGUAGE_OPTIONS, TUTORIAL_SLIDES, translate } from '../i18n';
import { multiplayerClient } from '../network/multiplayerClient';
import { useGameStore } from '../state/store';
import { MultiplayerLobbyModal } from './MultiplayerLobbyModal';

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
    pendingGulMove,
    setActiveModal,
    updatePrefs,
    updatePlayer,
    resetWinStats,
    confirmCoachSkipMove,
    confirmGulChoice,
    speakPlayerText,
    toggleAiVoiceMute,
    toggleSeatMute,
    triggerAiLine,
    triggerReaction,
    startLocalMatch,
    exitMatchToMenu,
    showToast,
  } = useGameStore();

  const [slideIdx, setSlideIdx] = useState(0);
  const [profileMsg, setProfileMsg] = useState('');
  const [wishSeat, setWishSeat] = useState(0);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    setWishSeat(wishSeatIdx);
  }, [wishSeatIdx]);

  if (!activeModal) return null;
  if (activeModal === 'lobby') return <MultiplayerLobbyModal />;

  const close = () => setActiveModal(null);

  const handleProfileVoiceRecord = async () => {
    if (recordingVoice && mrRef.current) {
      mrRef.current.stop();
      setRecordingVoice(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('Microphone unavailable.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      const t0 = Date.now();
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = typeof reader.result === 'string' ? reader.result : '';
          if (!base64) return;
          const dur = Math.max(1, Math.min(10, Math.round((Date.now() - t0) / 1000)));
          if (isOnline) {
            multiplayerClient.sendVoiceNote(base64, dur);
            showToast('Voice note sent!');
          } else {
            new Audio(base64).play().catch(() => {});
            showToast('Voice note played!');
          }
          close();
        };
        reader.readAsDataURL(blob);
      };
      mrRef.current = mr;
      mr.start();
      setRecordingVoice(true);
    } catch {
      showToast('Microphone permission denied.');
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 4000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
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
      {activeModal === 'howto' && (
        <div className="royal-modal-card w-full max-w-[460px] space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="royal-modal-title text-xl">📖 {translate(prefs.language, 'guide_title')}</h2>
            <button
              type="button"
              onClick={close}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-white/10 font-bold text-white"
            >
              ✕
            </button>
          </div>

          <div className="rounded-2xl border border-[#f1c40f]/35 bg-white/5 p-5 text-center">
            <div className="font-display text-xs font-bold tracking-wider text-[#f1c40f] uppercase">
              {TUTORIAL_SLIDES[slideIdx].badge}
            </div>
            <div className="my-2 text-5xl">{TUTORIAL_SLIDES[slideIdx].icon}</div>
            <h3 className="font-display text-xl font-bold text-white">
              {TUTORIAL_SLIDES[slideIdx].title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-white/80">
              {TUTORIAL_SLIDES[slideIdx].desc}
            </p>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSlideIdx((slideIdx - 1 + TUTORIAL_SLIDES.length) % TUTORIAL_SLIDES.length)}
              className="cursor-pointer rounded-xl border border-white/25 bg-white/10 px-4 py-2 font-display text-sm font-bold text-white"
            >
              ◀ PREV
            </button>
            <span className="font-display text-sm font-bold text-[#f1c40f] tabular-nums">
              {slideIdx + 1} / {TUTORIAL_SLIDES.length}
            </span>
            <button
              type="button"
              onClick={() => setSlideIdx((slideIdx + 1) % TUTORIAL_SLIDES.length)}
              className="cursor-pointer rounded-xl bg-[#f1c40f] px-4 py-2 font-display text-sm font-bold text-black"
            >
              NEXT ▶
            </button>
          </div>
        </div>
      )}

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

      {/* 5. Seat Profile / Chat / Voice */}
      {activeModal === 'profile' && profileSeatIdx !== null && (
        <div className="royal-modal-card w-full max-w-[400px] space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2
              className="font-display text-xl font-bold"
              style={{ color: getPlayerColor(profileSeatIdx, isTournament) }}
            >
              {players[profileSeatIdx]?.icon || '🤴'} {stripSeatTag(players[profileSeatIdx]?.name || '')}
            </h2>
            <button
              type="button"
              onClick={close}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-white/10 font-bold text-white"
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
              className="flex-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white outline-none"
            />
            <button
              type="submit"
              className="cursor-pointer rounded-xl bg-[#f1c40f] px-4 font-display text-sm font-bold text-black"
            >
              SEND
            </button>
          </form>

          {players[profileSeatIdx]?.isAI && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => toggleSeatMute(profileSeatIdx)}
                className="cursor-pointer rounded-xl border border-white/20 py-2.5 font-display text-xs font-bold text-white"
                style={{
                  background: prefs.mutedSeats.includes(profileSeatIdx)
                    ? 'rgba(231, 76, 60, 0.45)'
                    : 'rgba(255, 255, 255, 0.08)',
                }}
              >
                {prefs.mutedSeats.includes(profileSeatIdx) ? '🔊 UNMUTE THIS AI' : '🔇 MUTE THIS AI'}
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerAiLine(profileSeatIdx, 'banter');
                  close();
                }}
                className="cursor-pointer rounded-xl border border-[#f1c40f]/50 bg-[#f1c40f]/20 py-2.5 font-display text-xs font-bold text-[#f1c40f]"
              >
                🗣️ SPEAK NOW
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleProfileVoiceRecord}
            className="w-full cursor-pointer rounded-xl border border-white/25 py-2.5 font-display text-sm font-bold text-white"
            style={{ background: recordingVoice ? '#e74c3c' : 'rgba(255,255,255,0.08)' }}
          >
            {recordingVoice ? '⏹️ STOP & SEND VOICE MSG' : '🎤 VOICE MSG'}
          </button>

          <div className="flex justify-center gap-2">
            {['😂', '🔥', '👍', '😡', '👑'].map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => {
                  if (isOnline) multiplayerClient.sendReaction(em);
                  else triggerReaction(profileSeatIdx, em);
                  close();
                }}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-white/15 bg-white/10 text-xl hover:bg-white/25"
              >
                {em}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 6. Coach Skip Capture Confirmation */}
      {activeModal === 'coachSkip' && (
        <div className="royal-modal-card w-full max-w-[400px] space-y-4 text-center">
          <div className="text-4xl">⚠️</div>
          <h2 className="royal-modal-title text-xl">CAPTURE OPPORTUNITY!</h2>
          <p className="text-xs leading-relaxed text-white/80">
            Compulsory capture rule: if you finish your turn without capturing an available opponent token on the open track, your token returns to base!
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={close}
              className="cursor-pointer rounded-xl bg-[#27ae60] py-3 font-display text-sm font-bold text-white"
            >
              GO BACK &amp; CAPTURE
            </button>
            <button
              type="button"
              onClick={confirmCoachSkipMove}
              className="cursor-pointer rounded-xl border border-[#e74c3c] bg-[#e74c3c]/20 py-3 font-display text-sm font-bold text-[#ffb3ad]"
            >
              MOVE ANYWAY
            </button>
          </div>
        </div>
      )}

      {/* 7. Gul or Pass Choice */}
      {activeModal === 'gulPass' && pendingGulMove && (
        <div className="royal-modal-card w-full max-w-[400px] space-y-4 text-center">
          <div className="text-4xl">👑</div>
          <h2 className="royal-modal-title text-2xl">GUL OR PASS?</h2>
          <p className="text-xs leading-relaxed text-white/80">
            Your token reached Centre Home (69)! Choose <strong>GUL (ENTER)</strong> for a bonus turn, or <strong>PASS</strong> to keep it on your home path.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                if (isOnline) {
                  setActiveModal(null);
                  multiplayerClient.submitGulChoice('gul');
                } else {
                  confirmGulChoice('gul');
                }
              }}
              className="cursor-pointer rounded-xl bg-[#f1c40f] py-3 font-display text-base font-bold text-black"
            >
              GUL (ENTER)
            </button>
            <button
              type="button"
              onClick={() => {
                if (isOnline) {
                  setActiveModal(null);
                  multiplayerClient.submitGulChoice('pass');
                } else {
                  confirmGulChoice('pass');
                }
              }}
              className="cursor-pointer rounded-xl border border-white/25 bg-white/10 py-3 font-display text-base font-bold text-white"
            >
              PASS
            </button>
          </div>
        </div>
      )}

      {/* 8. Tournament Rules Modal */}
      {activeModal === 'tournamentRules' && (
        <div className="royal-modal-card w-full max-w-[440px] space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="royal-modal-title text-2xl">🏆 {translate(prefs.language, 'tourney_rules_title')}</h2>
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
            onClick={() => startLocalMatch(true)}
            className="w-full cursor-pointer rounded-xl bg-[#f1c40f] py-3 font-display text-base font-bold text-black"
          >
            {translate(prefs.language, 'start_tourney')}
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
    </div>
  );
};
