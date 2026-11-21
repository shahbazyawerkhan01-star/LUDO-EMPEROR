import { stripSeatTag } from '../game/rules';
import { useGameStore } from '../state/store';
import { acquireMicStream, UniversalAudioCapture } from './audioCapture';
import { multiplayerClient } from './multiplayerClient';
import { voiceCallManager } from './voiceCallManager';

const MAX_WHISPER_DURATION_MS = 5500;
const WHISPER_COOLDOWN_MS = 5000;
const MAX_WHISPER_BYTES = 60_000;

class WhisperRecorder {
  private capture: UniversalAudioCapture | null = null;
  private starting = false;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private targetSeat: number | null = null;
  private lastSentAt = 0;
  private cancelled = false;
  private stopRequested = false;

  public isRecording(): boolean {
    return this.starting || (this.capture !== null && this.capture.isRecording());
  }

  public getTargetSeat(): number | null {
    return this.targetSeat;
  }

  public async start(targetSeat: number): Promise<boolean> {
    const st = useGameStore.getState();
    if (!st.isOnline || st.matchOver || st.mySeat === targetSeat) return false;
    const seat = st.onlineSeats[targetSeat];
    if (!seat || seat.isAI || !seat.connected) {
      st.showToast('Whispers can only be sent to connected human players.');
      return false;
    }

    const now = Date.now();
    if (now - this.lastSentAt < WHISPER_COOLDOWN_MS) {
      const waitSec = Math.ceil((WHISPER_COOLDOWN_MS - (now - this.lastSentAt)) / 1000);
      st.showToast(`🤫 Wait ${waitSec}s before sending another whisper`);
      return false;
    }

    if (this.isRecording()) {
      this.stopAndSend();
      return false;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      st.showToast('Microphone unavailable.');
      return false;
    }

    this.starting = true;
    this.cancelled = false;
    this.stopRequested = false;
    this.targetSeat = targetSeat;

    const cap = new UniversalAudioCapture(MAX_WHISPER_BYTES);
    cap.initContextInGesture();

    try {
      voiceCallManager.suspendMicForVoiceNote();
      const stream = await acquireMicStream();
      this.starting = false;

      if (this.cancelled || this.stopRequested || this.targetSeat === null) {
        stream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        cap.dispose();
        this.targetSeat = null;
        useGameStore.getState().setWhisperRecordingSeat(null);
        voiceCallManager.resumeMicAfterVoiceNote();
        return false;
      }

      this.capture = cap;
      cap.startWithStream(stream);
      useGameStore.getState().setWhisperRecordingSeat(targetSeat);
      const targetName = stripSeatTag(useGameStore.getState().players[targetSeat]?.name || `Player ${targetSeat + 1}`);
      useGameStore.getState().showToast(`🤫 Whispering to ${targetName} — speak now, tap SEND`);

      if (this.stopTimer) clearTimeout(this.stopTimer);
      this.stopTimer = setTimeout(() => {
        this.stopAndSend();
      }, MAX_WHISPER_DURATION_MS);

      return true;
    } catch {
      this.starting = false;
      cap.dispose();
      this.capture = null;
      this.targetSeat = null;
      useGameStore.getState().setWhisperRecordingSeat(null);
      voiceCallManager.resumeMicAfterVoiceNote();
      useGameStore.getState().showToast('Microphone permission denied.');
      return false;
    }
  }

  public stopAndSend(): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.starting) {
      this.stopRequested = true;
      return;
    }

    const cap = this.capture;
    const target = this.targetSeat;
    const wasCancelled = this.cancelled;
    this.capture = null;
    this.targetSeat = null;
    useGameStore.getState().setWhisperRecordingSeat(null);

    if (!cap) {
      voiceCallManager.resumeMicAfterVoiceNote();
      return;
    }

    void cap.stop().then((result) => {
      voiceCallManager.resumeMicAfterVoiceNote();
      if (wasCancelled || this.cancelled || target === null || !result) return;
      if (result.silent) {
        useGameStore.getState().showToast('🤫 No microphone sound detected — check mic & try again');
        return;
      }
      if (result.buffer.byteLength < 64) return;
      if (result.buffer.byteLength > MAX_WHISPER_BYTES) {
        useGameStore.getState().showToast('🤫 Whisper clip too large — keep under 5.5 seconds');
        return;
      }

      multiplayerClient.sendWhisper([target], result.buffer, result.mimeType, (res) => {
        if (res?.success) {
          this.lastSentAt = Date.now();
          const targetName = stripSeatTag(
            useGameStore.getState().players[target]?.name || `Player ${target + 1}`,
          );
          useGameStore.getState().showToast(`🤫 Whisper sent privately to ${targetName}`);
        } else if (res?.error) {
          useGameStore.getState().showToast(`🤫 ${res.error}`);
        }
      });
    });
  }

  public cancel(): void {
    this.cancelled = true;
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.capture) {
      this.capture.dispose();
      this.capture = null;
    }
    this.targetSeat = null;
    useGameStore.getState().setWhisperRecordingSeat(null);
    voiceCallManager.resumeMicAfterVoiceNote();
  }
}

export const whisperRecorder = new WhisperRecorder();
