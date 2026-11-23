import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getPlayerColor, stripSeatTag } from '../game/rules';
import {
  acquireMicStream,
  binaryPayloadToAudioUrl,
  UniversalAudioCapture,
} from '../network/audioCapture';
import { multiplayerClient } from '../network/multiplayerClient';
import { voiceCallManager } from '../network/voiceCallManager';
import { useGameStore } from '../state/store';

const MAX_WHISPER_BYTES = 60_000;
const MAX_WHISPER_MS = 5500;
const WHISPER_COOLDOWN_MS = 5000;
const HOLD_THRESHOLD_MS = 380;

let lastWhisperSentAt = 0;

export const WhisperComposerModal: React.FC = () => {
  const {
    whisperModalOpen,
    whisperPreselectSeats,
    isOnline,
    matchOver,
    mySeat,
    players,
    onlineSeats,
    isTournament,
    secretWhispers,
    closeWhisperModal,
    appendOutgoingWhisper,
    showToast,
  } = useGameStore();

  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const captureRef = useRef<UniversalAudioCapture | null>(null);
  const startingRef = useRef(false);
  const cancelOnStartRef = useRef(false);
  const stopOnStartRef = useRef(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const pointerDownAtRef = useRef(0);
  const wasRecordingAtDownRef = useRef(false);
  const pointerActiveRef = useRef(false);
  const selectedSeatsRef = useRef<number[]>([]);
  selectedSeatsRef.current = selectedSeats;

  const opponentSeats = useMemo(() => {
    return [0, 1, 2, 3, 4].filter((s) => s !== mySeat);
  }, [mySeat]);

  const connectedHumanOpponents = useMemo(() => {
    return opponentSeats.filter((s) => {
      const seat = onlineSeats[s];
      return !!seat && !seat.isAI && !!seat.connected;
    });
  }, [opponentSeats, onlineSeats]);

  const clearTimers = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  };

  const cleanupCapture = (cancel = true) => {
    clearTimers();
    startingRef.current = false;
    cancelOnStartRef.current = true;
    stopOnStartRef.current = false;
    const cap = captureRef.current;
    captureRef.current = null;
    if (cap) {
      void cap.stop(cancel);
    }
    voiceCallManager.resumeMicAfterVoiceNote();
    setRecording(false);
    setElapsedMs(0);
    setMicLevel(0);
  };

  useEffect(() => {
    if (!whisperModalOpen) {
      cleanupCapture(true);
      setInlineError(null);
      setSending(false);
      return;
    }
    const validPreselect = whisperPreselectSeats.filter((s) =>
      connectedHumanOpponents.includes(s),
    );
    if (validPreselect.length > 0) {
      setSelectedSeats(validPreselect);
    } else if (connectedHumanOpponents.length > 0) {
      setSelectedSeats([connectedHumanOpponents[0]]);
    } else {
      setSelectedSeats([]);
    }
    setInlineError(null);
    setSending(false);
  }, [whisperModalOpen, whisperPreselectSeats, connectedHumanOpponents]);

  useEffect(() => {
    return () => {
      cleanupCapture(true);
    };
  }, []);

  if (!whisperModalOpen || !isOnline || matchOver) return null;

  const toggleSeat = (seatIdx: number) => {
    if (recording || sending) return;
    setInlineError(null);
    setSelectedSeats((prev) =>
      prev.includes(seatIdx) ? prev.filter((s) => s !== seatIdx) : [...prev, seatIdx],
    );
  };

  const handleClose = () => {
    cleanupCapture(true);
    closeWhisperModal();
  };

  const finishAndSend = async (cancel = false) => {
    clearTimers();
    if (startingRef.current) {
      if (cancel) cancelOnStartRef.current = true;
      else stopOnStartRef.current = true;
      return;
    }
    const cap = captureRef.current;
    captureRef.current = null;
    setRecording(false);
    setElapsedMs(0);
    setMicLevel(0);

    if (!cap) {
      voiceCallManager.resumeMicAfterVoiceNote();
      return;
    }

    const result = await cap.stop(cancel);
    voiceCallManager.resumeMicAfterVoiceNote();

    if (cancel || !result) {
      return;
    }

    if (result.silent) {
      const msg = 'NO_SOUND: No microphone sound detected — speak closer and try again.';
      setInlineError(msg);
      showToast('🤫 No microphone sound detected — try again');
      return;
    }

    if (result.buffer.byteLength < 64) {
      const msg = 'Clip too short — hold or tap and speak for at least half a second.';
      setInlineError(msg);
      showToast('🤫 Whisper too short — try again');
      return;
    }

    if (result.buffer.byteLength > MAX_WHISPER_BYTES) {
      const msg = 'Whisper clip too large — keep under 5.5s.';
      setInlineError(msg);
      showToast('🤫 Whisper clip too large (max 5.5s)');
      return;
    }

    const targets = selectedSeatsRef.current.filter((s) => connectedHumanOpponents.includes(s));
    if (targets.length === 0) {
      const msg = 'Select at least 1 connected human opponent.';
      setInlineError(msg);
      return;
    }

    setSending(true);
    multiplayerClient.sendWhisper(targets, result.buffer, result.mimeType, (res) => {
      setSending(false);
      if (res?.success) {
        lastWhisperSentAt = Date.now();
        const delivered = res.deliveredTo && res.deliveredTo.length > 0 ? res.deliveredTo : targets;
        const targetNames = delivered.map(
          (s) => stripSeatTag(onlineSeats[s]?.name || players[s]?.name || `Seat ${s + 1}`),
        );
        const dur = res.duration || result.durationSec || 2;
        const localUrl = binaryPayloadToAudioUrl(result.buffer, result.mimeType);
        if (localUrl) {
          appendOutgoingWhisper({
            id: `whisper_out_${Date.now()}_${delivered.join('_')}`,
            toSeats: delivered,
            targetNames,
            audioUrl: localUrl,
            duration: dur,
            timestamp: Date.now(),
          });
        }
        showToast(`🤫 Whisper sent privately to ${targetNames.join(', ')}`);
        closeWhisperModal();
      } else {
        const err = res?.error || 'Could not send whisper.';
        setInlineError(err);
        showToast(`🤫 ${err}`);
      }
    });
  };

  const beginRecording = async () => {
    if (recording || startingRef.current || sending) return;
    setInlineError(null);

    if (selectedSeatsRef.current.length === 0) {
      setInlineError('Select at least 1 connected human opponent first.');
      return;
    }

    const now = Date.now();
    if (now - lastWhisperSentAt < WHISPER_COOLDOWN_MS) {
      const waitSec = Math.ceil((WHISPER_COOLDOWN_MS - (now - lastWhisperSentAt)) / 1000);
      const msg = `Wait ${waitSec}s before sending another whisper.`;
      setInlineError(msg);
      showToast(`🤫 ${msg}`);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setInlineError('Microphone unavailable on this browser.');
      showToast('Microphone unavailable.');
      return;
    }

    startingRef.current = true;
    cancelOnStartRef.current = false;
    stopOnStartRef.current = false;

    const cap = new UniversalAudioCapture(MAX_WHISPER_BYTES, {
      onLevel: (lv) => setMicLevel(lv),
    });
    cap.initContextInGesture();

    try {
      voiceCallManager.suspendMicForVoiceNote();
      const stream = await acquireMicStream();
      startingRef.current = false;

      if (cancelOnStartRef.current) {
        stream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        cap.dispose();
        voiceCallManager.resumeMicAfterVoiceNote();
        return;
      }

      captureRef.current = cap;
      cap.startWithStream(stream);
      startedAtRef.current = Date.now();
      setRecording(true);
      setElapsedMs(0);

      clearTimers();
      timerIntervalRef.current = setInterval(() => {
        setElapsedMs(Math.min(MAX_WHISPER_MS, Date.now() - startedAtRef.current));
      }, 60);

      autoStopTimerRef.current = setTimeout(() => {
        void finishAndSend(false);
      }, MAX_WHISPER_MS);

      if (stopOnStartRef.current) {
        stopOnStartRef.current = false;
        void finishAndSend(false);
      }
    } catch {
      startingRef.current = false;
      cap.dispose();
      captureRef.current = null;
      voiceCallManager.resumeMicAfterVoiceNote();
      setRecording(false);
      setInlineError('Microphone permission denied.');
      showToast('Microphone permission denied.');
    }
  };

  const handleMicPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (sending || connectedHumanOpponents.length === 0) return;
    pointerActiveRef.current = true;
    pointerDownAtRef.current = Date.now();
    wasRecordingAtDownRef.current = recording || startingRef.current;
    if (!wasRecordingAtDownRef.current) {
      void beginRecording();
    }
  };

  const handleMicPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!pointerActiveRef.current) return;
    pointerActiveRef.current = false;
    const heldMs = Date.now() - pointerDownAtRef.current;

    if (wasRecordingAtDownRef.current) {
      // Second tap while already recording -> stop & send
      void finishAndSend(false);
    } else if (heldMs > HOLD_THRESHOLD_MS) {
      // Hold (>380ms) then release -> send immediately on release
      void finishAndSend(false);
    }
    // Quick tap (<=380ms): keep recording active until user taps again or hits 5.5s limit
  };

  const handleMicPointerCancel = () => {
    pointerActiveRef.current = false;
  };

  const elapsedSecStr = (elapsedMs / 1000).toFixed(1);
  const meterPct = Math.round(Math.max(4, Math.min(100, micLevel * 100)));

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !recording && !sending) {
          handleClose();
        }
      }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 4300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(5px)',
        padding: '16px',
      }}
    >
      <div className="mirror-message-card modal-scroll flex max-h-[90vh] w-full max-w-[440px] flex-col gap-3.5 overflow-y-auto border-[#c084fc]/70">
        {/* Header + Privacy Subtitle */}
        <div className="flex items-start justify-between gap-2 border-b border-white/25 pb-3">
          <div>
            <h2 className="font-display text-xl font-bold text-[#e9d5ff]">
              🤫 Private Voice Whisper
            </h2>
            <p
              className="mt-1 text-xs font-bold"
              style={{ color: secretWhispers ? '#d8b4fe' : '#fde047' }}
            >
              {secretWhispers
                ? '🕶️ Hidden Mode (Room cannot see whispers)'
                : '👁️ Transparent Mode (Room sees who whispered)'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="mirror-glass-btn flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full font-bold text-white"
            aria-label="Close Whisper Composer"
          >
            ✕
          </button>
        </div>

        {/* Recipients List (All 4 Opponent Seats) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-display font-bold text-white/85 uppercase">
              Select Recipients ({selectedSeats.length} chosen)
            </span>
            {connectedHumanOpponents.length > 1 && !recording && !sending && (
              <button
                type="button"
                onClick={() =>
                  setSelectedSeats(
                    selectedSeats.length === connectedHumanOpponents.length
                      ? []
                      : [...connectedHumanOpponents],
                  )
                }
                className="cursor-pointer text-[11px] font-bold text-[#d8b4fe] underline"
              >
                {selectedSeats.length === connectedHumanOpponents.length
                  ? 'Clear All'
                  : 'Select All Humans'}
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {opponentSeats.map((seatIdx) => {
              const seat = onlineSeats[seatIdx];
              const playerCfg = players[seatIdx];
              const isHumanConnected = !!seat && !seat.isAI && !!seat.connected;
              const isSelected = selectedSeats.includes(seatIdx);
              const seatColor = getPlayerColor(seatIdx, isTournament);
              const cleanName = stripSeatTag(
                seat?.name || playerCfg?.name || `Seat ${seatIdx + 1}`,
              );

              return (
                <button
                  key={seatIdx}
                  type="button"
                  disabled={!isHumanConnected || recording || sending}
                  onClick={() => toggleSeat(seatIdx)}
                  className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition"
                  style={{
                    cursor: isHumanConnected && !recording && !sending ? 'pointer' : 'not-allowed',
                    opacity: isHumanConnected ? 1 : 0.48,
                    background: isSelected
                      ? 'rgba(147, 51, 234, 0.36)'
                      : 'rgba(255, 255, 255, 0.06)',
                    borderColor: isSelected
                      ? '#e9d5ff'
                      : 'rgba(255, 255, 255, 0.18)',
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white/50 text-sm"
                      style={{ backgroundColor: seatColor }}
                    >
                      {seat?.icon || playerCfg?.icon || '🤴'}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-display text-sm font-bold text-white">
                        {cleanName}
                      </div>
                      <div className="text-[11px] text-white/65">
                        {!seat
                          ? 'Empty Seat (Disabled)'
                          : seat.isAI
                            ? '🤖 AI Bot (Disabled)'
                            : !seat.connected
                              ? 'Offline (Disabled)'
                              : `Seat ${seatIdx + 1} • Ready for whisper`}
                      </div>
                    </div>
                  </div>
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-extrabold"
                    style={{
                      borderColor: isSelected ? '#e9d5ff' : 'rgba(255,255,255,0.3)',
                      background: isSelected ? '#9333ea' : 'rgba(0,0,0,0.3)',
                      color: '#fff',
                    }}
                  >
                    {isSelected ? '✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {connectedHumanOpponents.length === 0 && (
            <div className="rounded-xl border border-[#f1c40f]/45 bg-[#f1c40f]/10 px-3 py-2.5 text-xs font-semibold text-[#fde68a]">
              No connected human opponents available right now (AI bots and disconnected seats
              cannot receive whispers).
            </div>
          )}
        </div>

        {/* Inline Error */}
        {inlineError && (
          <div className="rounded-xl border border-[#e74c3c]/70 bg-[#e74c3c]/25 px-3 py-2 text-xs font-bold text-[#ffd0cb]">
            ⚠️ {inlineError}
          </div>
        )}

        {/* Mic Recording Bar + Live Meter */}
        {recording && (
          <div className="space-y-2 rounded-2xl border border-[#e74c3c]/70 bg-black/45 p-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-2 text-[#ff8a80]">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full bg-[#e74c3c]"
                  style={{ animation: 'pulse-red-timer 0.55s infinite alternate' }}
                />
                <span>Recording private whisper...</span>
              </div>
              <span className="font-mono text-white tabular-nums">
                {elapsedSecStr}s / 5.5s
              </span>
            </div>

            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#a855f7] via-[#ec4899] to-[#2ecc71] transition-[width] duration-75"
                style={{ width: `${meterPct}%` }}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void finishAndSend(true)}
                className="cursor-pointer rounded-lg border border-white/30 bg-black/50 px-3 py-1 text-xs font-bold text-white hover:bg-white/15"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Dual Hold-or-Tap Mic Control */}
        <button
          type="button"
          disabled={connectedHumanOpponents.length === 0 || sending}
          onPointerDown={handleMicPointerDown}
          onPointerUp={handleMicPointerUp}
          onPointerCancel={handleMicPointerCancel}
          className="w-full cursor-pointer touch-none rounded-2xl border py-3.5 font-display text-sm font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-45"
          style={{
            borderColor: recording ? '#ffb3ad' : '#e9d5ff',
            background: recording
              ? 'linear-gradient(135deg, #c0392b, #e74c3c)'
              : 'linear-gradient(135deg, #6b21a8, #9333ea)',
          }}
        >
          {sending
            ? '⏳ Sending Private Whisper...'
            : recording
              ? '⏹️ Tap or Release to Send Whisper'
              : '🎙️ Hold (>0.4s) or Tap to Record Whisper (Max 5.5s)'}
        </button>

        <div className="text-center text-[11px] text-white/60">
          Hold &amp; release to send immediately, or quick tap to start and tap again to send.
        </div>
      </div>
    </div>
  );
};
