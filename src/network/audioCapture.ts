import { useGameStore } from '../state/store';
import { multiplayerClient } from './multiplayerClient';
import { voiceCallManager } from './voiceCallManager';

export const MAX_VOICE_NOTE_MS = 6500;
export const MAX_VOICE_NOTE_BYTES = 80_000;

const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/aac',
  'audio/ogg;codecs=opus',
];

export function pickSupportedAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  for (const mime of AUDIO_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {}
  }
  return undefined;
}

export function normalizeAudioMime(rawMime?: string): string {
  const base = (rawMime || '').split(';')[0].trim().toLowerCase();
  if (base === 'audio/wave' || base === 'audio/x-wav') return 'audio/wav';
  if (base.startsWith('audio/')) {
    return base;
  }
  return 'audio/webm';
}

export function createAudioRecorderWithFallback(
  stream: MediaStream,
  preferredMime?: string,
  audioBitsPerSecond = 24_000,
): MediaRecorder {
  const opts: MediaRecorderOptions = {};
  if (preferredMime) opts.mimeType = preferredMime;
  try {
    return new MediaRecorder(stream, { ...opts, audioBitsPerSecond });
  } catch {
    return preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream);
  }
}

export async function acquireMicStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

function detectMimeFromBytes(bytes: Uint8Array, fallbackMime: string): string {
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return 'audio/wav';
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'audio/webm';
  }
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return 'audio/ogg';
  }
  return fallbackMime;
}

export function binaryPayloadToAudioUrl(raw: unknown, rawMime?: string): string | null {
  if (typeof window === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return null;
  }
  const safeMime = normalizeAudioMime(rawMime);
  try {
    if (raw instanceof ArrayBuffer) {
      const bytes = new Uint8Array(raw);
      return URL.createObjectURL(new Blob([bytes], { type: detectMimeFromBytes(bytes, safeMime) }));
    }
    if (ArrayBuffer.isView(raw)) {
      const bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
      const copy = new Uint8Array(bytes);
      return URL.createObjectURL(new Blob([copy], { type: detectMimeFromBytes(copy, safeMime) }));
    }
    if (
      typeof raw === 'object' &&
      raw !== null &&
      (raw as { type?: unknown }).type === 'Buffer' &&
      Array.isArray((raw as { data?: unknown }).data)
    ) {
      const bytes = new Uint8Array((raw as { data: number[] }).data);
      return URL.createObjectURL(new Blob([bytes], { type: detectMimeFromBytes(bytes, safeMime) }));
    }
    if (raw instanceof Blob) {
      return URL.createObjectURL(raw);
    }
    if (typeof raw === 'string' && raw.startsWith('data:audio/')) {
      return raw;
    }
  } catch {}
  return null;
}

export function revokeAudioUrl(url?: string): void {
  if (!url || !url.startsWith('blob:')) return;
  try {
    URL.revokeObjectURL(url);
  } catch {}
}

/**
 * Encodes Float32 mono PCM chunks into a universal RIFF PCM WAV ArrayBuffer
 * guaranteed to fit within `maxBytes` and be natively playable on 100% of browsers
 * (iOS Safari, Android Chrome, Desktop Chrome, Firefox, Edge).
 */
export function encodeNormalizedWavFromChunks(
  chunks: Float32Array[],
  inputSampleRate: number,
  maxBytes: number,
): { buffer: ArrayBuffer; peak: number; durationSec: number } | null {
  let totalSamples = 0;
  for (const c of chunks) totalSamples += c.length;
  if (totalSamples < 512 || inputSampleRate <= 0) return null;

  const merged = new Float32Array(totalSamples);
  let offset = 0;
  let sum = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    for (let i = 0; i < c.length; i++) sum += c[i];
    offset += c.length;
  }

  // Remove DC offset and measure peak amplitude
  const mean = sum / totalSamples;
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    const v = merged[i] - mean;
    merged[i] = v;
    const av = Math.abs(v);
    if (av > peak) peak = av;
  }

  if (peak < 0.0005) {
    return null;
  }

  const durationSec = totalSamples / inputSampleRate;
  const safeBudget = Math.max(1024, maxBytes - 512);

  // Pick highest quality WAV format >= 8000Hz that fits in safeBudget
  let targetRate = 12_000;
  let bitsPerSample: 8 | 16 = 16;

  if (durationSec * 12_000 * 2 + 44 <= safeBudget) {
    targetRate = 12_000;
    bitsPerSample = 16;
  } else if (durationSec * 8_000 * 2 + 44 <= safeBudget) {
    targetRate = 8_000;
    bitsPerSample = 16;
  } else if (durationSec * 10_000 + 44 <= safeBudget) {
    targetRate = 10_000;
    bitsPerSample = 8;
  } else {
    targetRate = 8_000;
    bitsPerSample = 8;
  }

  const bytesPerSample = bitsPerSample === 16 ? 2 : 1;
  const maxOutSamples = Math.floor((safeBudget - 44) / bytesPerSample);
  const outSamples = Math.max(1, Math.min(maxOutSamples, Math.round(durationSec * targetRate)));
  const ratio = totalSamples / outSamples;

  // Normalize cleanly up to ~0.88 peak so even quiet mics are crisp & loud
  const normGain = Math.min(12.0, 0.88 / peak);

  const dataByteLen = outSamples * bytesPerSample;
  const wavBuf = new ArrayBuffer(44 + dataByteLen);
  const view = new DataView(wavBuf);

  const writeStr = (pos: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(pos + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataByteLen, true);

  for (let i = 0; i < outSamples; i++) {
    // Simple box-averaged downsampling prevents aliasing harshness
    const startIdx = Math.floor(i * ratio);
    const endIdx = Math.min(totalSamples, Math.max(startIdx + 1, Math.floor((i + 1) * ratio)));
    let acc = 0;
    for (let j = startIdx; j < endIdx; j++) {
      acc += merged[j];
    }
    let sample = (acc / (endIdx - startIdx)) * normGain;
    // Soft limit peaks > 0.92
    if (sample > 0.92) sample = 0.92 + 0.08 * Math.tanh((sample - 0.92) * 3);
    else if (sample < -0.92) sample = -0.92 - 0.08 * Math.tanh((-sample - 0.92) * 3);
    sample = Math.max(-1, Math.min(1, sample));

    if (bitsPerSample === 16) {
      view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
    } else {
      view.setUint8(44 + i, Math.round((sample + 1) * 127.5));
    }
  }

  return { buffer: wavBuf, peak, durationSec: outSamples / targetRate };
}

export interface CapturedAudioResult {
  buffer: ArrayBuffer;
  mimeType: string;
  silent?: boolean;
}

/**
 * Dual-pipeline microphone recorder:
 * 1) Primary: WebAudio mono Float32 PCM capture -> normalized universal `audio/wav` (cross-browser iOS/Android/Desktop).
 * 2) Fallback: MediaRecorder (WebM/MP4) if ScriptProcessor produced 0 frames.
 */
export class UniversalAudioCapture {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private muteNode: GainNode | null = null;
  private pcmChunks: Float32Array[] = [];
  private pcmRate = 44100;
  private pcmPeak = 0;

  private mediaRecorder: MediaRecorder | null = null;
  private mrChunks: Blob[] = [];
  private mrMime = 'audio/webm';
  private maxBytes: number;
  private active = false;
  private stopped = false;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  public initContextInGesture(): void {
    if (typeof window === 'undefined') return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        this.audioCtx = new Ctx();
        if (this.audioCtx.state !== 'running') {
          void this.audioCtx.resume().catch(() => {});
        }
      }
    } catch {
      this.audioCtx = null;
    }
  }

  public startWithStream(stream: MediaStream): void {
    this.stream = stream;
    this.active = true;
    this.stopped = false;
    this.pcmChunks = [];
    this.pcmPeak = 0;
    this.mrChunks = [];

    // 1. WebAudio live PCM capture
    try {
      if (!this.audioCtx) this.initContextInGesture();
      if (this.audioCtx) {
        if (this.audioCtx.state !== 'running') {
          void this.audioCtx.resume().catch(() => {});
        }
        this.pcmRate = this.audioCtx.sampleRate || 44100;
        const src = this.audioCtx.createMediaStreamSource(stream);
        const proc = this.audioCtx.createScriptProcessor(2048, 1, 1);
        const mute = this.audioCtx.createGain();
        mute.gain.value = 0;

        proc.onaudioprocess = (ev) => {
          if (!this.active || this.stopped) return;
          const input = ev.inputBuffer.getChannelData(0);
          const copy = new Float32Array(input.length);
          copy.set(input);
          this.pcmChunks.push(copy);
          for (let i = 0; i < input.length; i += 4) {
            const av = Math.abs(input[i]);
            if (av > this.pcmPeak) this.pcmPeak = av;
          }
        };

        src.connect(proc);
        proc.connect(mute);
        mute.connect(this.audioCtx.destination);
        this.sourceNode = src;
        this.processorNode = proc;
        this.muteNode = mute;
      }
    } catch {}

    // 2. Fallback MediaRecorder in case AudioContext didn't deliver frames
    try {
      const preferredMime = pickSupportedAudioMimeType();
      const mr = createAudioRecorderWithFallback(stream, preferredMime, 24_000);
      this.mrMime = normalizeAudioMime(mr.mimeType || preferredMime);
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) this.mrChunks.push(e.data);
      };
      mr.start(250);
      this.mediaRecorder = mr;
    } catch {
      this.mediaRecorder = null;
    }
  }

  public isRecording(): boolean {
    return this.active && !this.stopped;
  }

  public async stop(): Promise<CapturedAudioResult | null> {
    if (this.stopped) return null;
    this.stopped = true;
    this.active = false;

    const totalPcmSamples = this.pcmChunks.reduce((acc, c) => acc + c.length, 0);
    const capturedChunks = this.pcmChunks.slice();
    const capturedRate = this.pcmRate;
    const peak = this.pcmPeak;

    let mrBlob: Blob | null = null;
    const mr = this.mediaRecorder;
    if (mr && mr.state === 'recording') {
      mrBlob = await new Promise<Blob | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 600);
        mr.onstop = () => {
          clearTimeout(timer);
          if (this.mrChunks.length === 0) {
            resolve(null);
            return;
          }
          const actualMime = normalizeAudioMime(mr.mimeType || this.mrMime);
          resolve(new Blob(this.mrChunks, { type: actualMime }));
        };
        try {
          mr.stop();
        } catch {
          clearTimeout(timer);
          resolve(null);
        }
      });
    }

    this.dispose();

    // Prefer universal PCM WAV whenever WebAudio captured real audio
    if (totalPcmSamples >= 512) {
      if (peak < 0.0005) {
        return { buffer: new ArrayBuffer(0), mimeType: 'audio/wav', silent: true };
      }
      const wav = encodeNormalizedWavFromChunks(capturedChunks, capturedRate, this.maxBytes);
      if (wav) {
        return { buffer: wav.buffer, mimeType: 'audio/wav' };
      }
    }

    // Fallback to MediaRecorder container if WebAudio wasn't available
    if (mrBlob && mrBlob.size >= 64) {
      try {
        const buf = await mrBlob.arrayBuffer();
        if (buf.byteLength >= 64) {
          return { buffer: buf, mimeType: normalizeAudioMime(mrBlob.type || this.mrMime) };
        }
      } catch {}
    }

    return null;
  }

  public dispose(): void {
    this.active = false;
    this.stopped = true;
    try {
      this.processorNode && (this.processorNode.onaudioprocess = null);
      this.sourceNode?.disconnect();
      this.processorNode?.disconnect();
      this.muteNode?.disconnect();
    } catch {}
    this.sourceNode = null;
    this.processorNode = null;
    this.muteNode = null;

    if (this.mediaRecorder) {
      try {
        if (this.mediaRecorder.state === 'recording') this.mediaRecorder.stop();
      } catch {}
      this.mediaRecorder = null;
    }
    this.mrChunks = [];
    this.pcmChunks = [];

    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      this.stream = null;
    }
    if (this.audioCtx) {
      try {
        void this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
  }
}

class VoiceNoteRecorder {
  private capture: UniversalAudioCapture | null = null;
  private starting = false;
  private cancelRequested = false;
  private stopRequested = false;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(recording: boolean) => void>();

  public isRecording(): boolean {
    return this.starting || (this.capture !== null && this.capture.isRecording());
  }

  public subscribe(fn: (recording: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(active: boolean): void {
    for (const fn of this.listeners) fn(active);
  }

  public async toggle(): Promise<void> {
    if (this.isRecording()) {
      this.stopAndSend();
      return;
    }
    const st = useGameStore.getState();
    if (!st.isOnline || st.matchOver) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      st.showToast('Microphone unavailable.');
      return;
    }

    this.starting = true;
    this.cancelRequested = false;
    this.stopRequested = false;
    const cap = new UniversalAudioCapture(MAX_VOICE_NOTE_BYTES);
    cap.initContextInGesture();

    try {
      voiceCallManager.suspendMicForVoiceNote();
      const stream = await acquireMicStream();
      this.starting = false;

      if (this.cancelRequested || this.stopRequested) {
        stream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        cap.dispose();
        this.notify(false);
        voiceCallManager.resumeMicAfterVoiceNote();
        return;
      }

      this.capture = cap;
      cap.startWithStream(stream);
      this.notify(true);
      useGameStore.getState().showToast('🎤 Recording voice note — speak now, tap 🎤 to send');

      if (this.stopTimer) clearTimeout(this.stopTimer);
      this.stopTimer = setTimeout(() => {
        this.stopAndSend();
      }, MAX_VOICE_NOTE_MS);
    } catch {
      this.starting = false;
      cap.dispose();
      this.capture = null;
      this.notify(false);
      voiceCallManager.resumeMicAfterVoiceNote();
      useGameStore.getState().showToast('Microphone permission denied.');
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
    if (!cap) return;
    this.capture = null;
    this.notify(false);

    void cap.stop().then((result) => {
      voiceCallManager.resumeMicAfterVoiceNote();
      if (this.cancelRequested || !result) return;
      if (result.silent) {
        useGameStore.getState().showToast('🎤 No microphone sound detected — check mic & try again');
        return;
      }
      if (result.buffer.byteLength < 64) return;
      if (result.buffer.byteLength > MAX_VOICE_NOTE_BYTES) {
        useGameStore.getState().showToast('🎤 Voice note too large — keep under 6.5s');
        return;
      }
      multiplayerClient.sendVoiceNoteBinary(result.buffer, result.mimeType, (res) => {
        if (res?.success) {
          useGameStore.getState().showToast('🎤 Voice note sent!');
        } else if (res?.error) {
          useGameStore.getState().showToast(`🎤 ${res.error}`);
        }
      });
    });
  }

  public cancel(): void {
    this.cancelRequested = true;
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.capture) {
      this.capture.dispose();
      this.capture = null;
    }
    this.notify(false);
    voiceCallManager.resumeMicAfterVoiceNote();
  }
}

export const voiceNoteRecorder = new VoiceNoteRecorder();
