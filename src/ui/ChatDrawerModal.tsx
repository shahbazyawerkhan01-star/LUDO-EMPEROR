import React, { useEffect, useState } from 'react';
import { getPlayerColor, stripSeatTag } from '../game/rules';
import { voiceNoteRecorder } from '../network/audioCapture';
import { multiplayerClient } from '../network/multiplayerClient';
import { useGameStore } from '../state/store';

const QUICK_CHAT_PRESETS = [
  'Good move! 👏',
  'Play fast! ⏱️',
  'So lucky! 🍀',
  'Watch out! 🔥',
  'Oops! 😅',
  'Well played! 👍',
];

const QUICK_EMOJIS = ['😂', '🔥', '👍', '😡', '👑', '🎲', '⚔️', '😭', '👏', '😈'];

export const ChatDrawerModal: React.FC = () => {
  const {
    activeModal,
    isOnline,
    matchOver,
    mySeat,
    currentPlayer,
    players,
    isTournament,
    secretWhispers,
    chatMessages,
    setActiveModal,
    openWhisperModal,
    playVoiceNote,
    speakPlayerText,
    triggerReaction,
  } = useGameStore();

  const [chatText, setChatText] = useState('');
  const [recordingVoice, setRecordingVoice] = useState(() => voiceNoteRecorder.isRecording());

  useEffect(() => {
    return voiceNoteRecorder.subscribe(setRecordingVoice);
  }, []);

  if (activeModal !== 'chat') return null;

  const close = () => setActiveModal(null);

  const localSpeakerSeat =
    isOnline && typeof mySeat === 'number'
      ? mySeat
      : !players[currentPlayer]?.isAI
        ? currentPlayer
        : Math.max(
            0,
            players.findIndex((p) => !p.isAI),
          );

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    if (isOnline) {
      multiplayerClient.sendChat(chatText.trim());
    } else {
      speakPlayerText(localSpeakerSeat, chatText.trim());
    }
    setChatText('');
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 4000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(4px)',
        padding: '16px',
      }}
    >
      <div className="mirror-message-card modal-scroll flex max-h-[88vh] w-full max-w-[440px] flex-col gap-3 overflow-y-auto">
        {/* Header with Whisper Button */}
        <div className="flex items-center justify-between gap-2 border-b border-white/25 pb-2.5">
          <div>
            <h2 className="font-display text-lg font-bold text-[#f1c40f]">
              💬 {isOnline ? 'ROOM CHAT & SOCIAL' : 'QUICK CHAT & EMOTES'}
            </h2>
            {isOnline && (
              <div className="text-[11px] font-semibold text-white/75">
                {secretWhispers
                  ? '🕶️ Whispers: Hidden Mode'
                  : '👁️ Whispers: Transparent Mode'}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isOnline && !matchOver && (
              <button
                type="button"
                onClick={() => openWhisperModal()}
                className="cursor-pointer rounded-xl border border-[#e9d5ff]/80 bg-[#7e22ce]/85 px-3 py-1.5 font-display text-xs font-bold text-white shadow hover:bg-[#9333ea]"
              >
                🤫 Whisper
              </button>
            )}
            <button
              type="button"
              onClick={close}
              className="mirror-glass-btn flex h-8 w-8 cursor-pointer items-center justify-center rounded-full font-bold text-white"
              aria-label="Close Chat"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Chat / Whisper / Voice Log */}
        {isOnline && (
          <div className="modal-scroll max-h-44 space-y-1.5 overflow-y-auto rounded-2xl border border-white/20 bg-black/35 p-3 text-xs">
            {chatMessages.length === 0 ? (
              <div className="text-white/60">No messages yet. Say hello or send a whisper!</div>
            ) : (
              chatMessages.map((m) => {
                const kind = m.kind || (m.audioData ? 'voice' : 'text');
                const cleanSender = stripSeatTag(m.sender || `Seat ${m.seatIndex + 1}`);
                const seatColor = getPlayerColor(m.seatIndex, isTournament);

                if (kind === 'whisper_in') {
                  return (
                    <div
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#c084fc]/55 bg-[#581c87]/45 px-2.5 py-1.5"
                    >
                      <span className="font-bold text-[#f3e8ff]">
                        🤫 {cleanSender} → You
                      </span>
                      {m.audioData && (
                        <button
                          type="button"
                          onClick={() => playVoiceNote(m.id)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#e9d5ff]/80 bg-[#7e22ce] px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-[#9333ea]"
                        >
                          ▶ {m.duration || 2}s
                        </button>
                      )}
                    </div>
                  );
                }

                if (kind === 'whisper_out') {
                  return (
                    <div
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d8b4fe]/45 bg-[#3b0764]/50 px-2.5 py-1.5"
                    >
                      <span className="font-bold text-[#e9d5ff]">
                        🤫 You → {(m.targetNames || []).join(', ')}
                      </span>
                      {m.audioData && (
                        <button
                          type="button"
                          onClick={() => playVoiceNote(m.id)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#e9d5ff]/75 bg-[#6b21a8] px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-[#7e22ce]"
                        >
                          ▶ {m.duration || 2}s
                        </button>
                      )}
                    </div>
                  );
                }

                if (kind === 'whisper_notice') {
                  return (
                    <div
                      key={m.id}
                      className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] italic text-[#fde68a]"
                    >
                      {m.sender} {m.text}
                    </div>
                  );
                }

                return (
                  <div key={m.id} className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold" style={{ color: seatColor }}>
                      {cleanSender}:
                    </span>
                    {m.audioData ? (
                      <button
                        type="button"
                        onClick={() => playVoiceNote(m.id)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#2ecc71]/60 bg-[#27ae60]/30 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-[#27ae60]/55"
                      >
                        ▶ {m.duration || 2}s
                      </button>
                    ) : (
                      <span className="text-white">{m.text}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Quick-Chat Presets */}
        <div className="grid grid-cols-3 gap-1.5">
          {QUICK_CHAT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                if (isOnline) {
                  multiplayerClient.sendChat(preset);
                } else {
                  speakPlayerText(localSpeakerSeat, preset);
                  close();
                }
              }}
              className="mirror-glass-btn cursor-pointer truncate rounded-lg px-2 py-2 text-xs font-bold text-white hover:border-[#f1c40f]"
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Public Voice Note + Text Input */}
        <div className="space-y-2">
          {isOnline && (
            <button
              type="button"
              onClick={() => void voiceNoteRecorder.toggle()}
              className="mirror-glass-btn w-full cursor-pointer rounded-xl py-2 font-display text-xs font-bold text-white"
              style={{
                background: recordingVoice
                  ? 'rgba(231, 76, 60, 0.78)'
                  : 'rgba(20, 83, 45, 0.45)',
              }}
            >
              {recordingVoice ? '⏹️ STOP & SEND VOICE NOTE (ROOM)' : '🎤 VOICE NOTE (ALL)'}
            </button>
          )}

          <form onSubmit={handleSendText} className="flex gap-2">
            <input
              type="text"
              maxLength={100}
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Type message..."
              className="mirror-glass-input flex-1 rounded-xl px-3 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              className="cursor-pointer rounded-xl border border-white/70 bg-[#f1c40f]/90 px-4 font-display text-sm font-bold text-black shadow-md hover:bg-[#f1c40f]"
              style={{ textShadow: 'none' }}
            >
              SEND
            </button>
          </form>
        </div>

        {/* Quick Reactions */}
        <div className="grid grid-cols-5 gap-1.5">
          {QUICK_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => {
                if (isOnline) multiplayerClient.sendReaction(em);
                else triggerReaction(localSpeakerSeat, em);
                if (!isOnline) close();
              }}
              className="mirror-glass-btn flex h-10 w-full cursor-pointer items-center justify-center rounded-xl text-xl"
            >
              {em}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
