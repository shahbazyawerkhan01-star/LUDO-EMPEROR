import {
  isAnimalCharacter,
  type AnimalArchetypeId,
  type CharacterArchetypeId,
  type CharacterCelebrationKind,
  type CharacterGender,
} from './characterTokens';

export interface MusicTrackOption {
  id: string;
  label: string;
  url?: string;
}

export const STATIC_AUDIO_FILES: Record<string, string> = {
  dice: '/audio/dice-roll.mp3',
  whoosh: '/audio/whoosh.mp3',
  move: '/audio/pawn-move.mp3',
  click: '/audio/click.mp3',
  heartbeat: '/audio/heartbeat.mp3',
  notification: '/audio/notification.mp3',
};

export const MUSIC_TRACKS: MusicTrackOption[] = [
  { id: 'none', label: 'None (Off)' },
  { id: 'bgm_classic_ludo', label: 'Classic Ludo', url: '/audio/bgm-classic-ludo.mp3' },
  { id: 'bgm_royal_ambience', label: 'Royal Ambience', url: '/audio/bgm-royal-ambience.mp3' },
  { id: 'bgm_modern_beats', label: 'Modern Chill', url: '/audio/bgm-modern-beats.mp3' },
  { id: 'bgm_afro_reggaeton', label: 'Afro Reggaeton', url: '/audio/bgm-afro-reggaeton.mp3' },
  { id: 'bgm_downtempo', label: 'Downtempo Chill', url: '/audio/bgm-downtempo.mp3' },
  { id: 'bgm_guitar_v5', label: 'Acoustic Guitar 1', url: '/audio/bgm-guitar-v5.mp3' },
  { id: 'bgm_guitar_v9', label: 'Acoustic Guitar 2', url: '/audio/bgm-guitar-v9.mp3' },
  { id: 'bgm_latin', label: 'Latin Groove', url: '/audio/bgm-latin.mp3' },
  { id: 'bgm_nature', label: 'Nature Ambient', url: '/audio/bgm-nature.mp3' },
  { id: 'bgm_rap', label: 'Urban Beat', url: '/audio/bgm-rap.mp3' },
  { id: 'custom', label: 'Custom (Device Library)' },
];

class SfxManager {
  private audioCtx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmGain: GainNode | null = null;
  private activeMusicId = 'none';
  private musicRunId = 0;
  private customUrl: string | null = null;
  private sfxVolume = 0.7;
  private musicVolume = 0.45;
  private aiVoiceMuted = false;
  private isSpeaking = false;
  private speechClearTimer: ReturnType<typeof setTimeout> | null = null;
  private speechWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private talkBleepTimer: ReturnType<typeof setTimeout> | null = null;
  private activeBleepOscs: OscillatorNode[] = [];
  private activeSfx = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();
  private lastPlayed = new Map<string, number>();
  private activeTtsAudio: HTMLAudioElement | null = null;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private activeClipAudio: HTMLAudioElement | null = null;
  private activeClipSource: AudioBufferSourceNode | null = null;
  private activeClipSafetyTimer: ReturnType<typeof setTimeout> | null = null;
  private clipBufferCache = new Map<string, AudioBuffer | 'failed'>();
  private clipLoadingCache = new Map<string, Promise<AudioBuffer | 'failed'>>();
  private noiseBuffer: AudioBuffer | null = null;
  private activeTtsIsAi = false;
  private activeTtsPriority: 'high' | 'normal' = 'normal';
  private routineAiPaused = false;
  private liveVoiceDucking = false;
  private speechRunId = 0;
  private activeSpeechKey = '';
  private activeOnEnd: (() => void) | null = null;
  private staticManifestChecked = false;
  private staticManifestLanguages: Set<string> | null = null;
  private speechQueue: Array<{
    clean: string;
    lang: string;
    isAi: boolean;
    gender: 'male' | 'female';
    seatIdx: number;
    priority: 'high' | 'normal';
    staticClipUrl?: string;
    onStart?: () => void;
    onEnd?: () => void;
  }> = [];

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        this.audioCtx = new Ctx();
      }
    }
    if (this.audioCtx && this.audioCtx.state !== 'running') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public unlockAudio(): void {
    this.ensureContext();
    void this.preloadCore();
  }

  public setVolumes(sfxVolume: number, musicVolume = this.musicVolume): void {
    this.sfxVolume = Math.max(0, Math.min(1, sfxVolume));
    this.musicVolume = Math.max(0, Math.min(1, musicVolume));
    if (this.bgmGain && this.audioCtx) {
      try {
        this.bgmGain.gain.setTargetAtTime(this.musicVolume, this.audioCtx.currentTime, 0.05);
      } catch {
        this.bgmGain.gain.value = this.musicVolume;
      }
    }
    this.applyActiveTtsVolume();
    if (this.sfxVolume <= 0.01) {
      this.stopSpeech();
    }
  }

  public setLiveVoiceActive(active: boolean): void {
    if (this.liveVoiceDucking === active) return;
    this.liveVoiceDucking = active;
    this.applyActiveTtsVolume();
  }

  private getEffectiveTtsVolume(isAi: boolean): number {
    const duckScale = isAi && this.liveVoiceDucking ? 0.25 : 1;
    return Math.max(0, Math.min(1, this.sfxVolume * duckScale));
  }

  private applyActiveTtsVolume(): void {
    if (this.activeTtsAudio) {
      try {
        this.activeTtsAudio.volume = this.getEffectiveTtsVolume(this.activeTtsIsAi);
      } catch {}
    }
  }

  public setAiVoiceMuted(muted: boolean): void {
    this.aiVoiceMuted = muted;
    if (muted) {
      this.speechQueue = this.speechQueue.filter((item) => !item.isAi);
      if (this.activeTtsIsAi) {
        this.skipCurrentSpeech();
      }
    }
  }

  public setRoutineAiPaused(paused: boolean): void {
    this.routineAiPaused = paused;
    if (paused) {
      this.speechQueue = this.speechQueue.filter(
        (item) => !(item.isAi && item.priority === 'normal'),
      );
      if (this.activeTtsIsAi && this.activeTtsPriority === 'normal') {
        this.skipCurrentSpeech();
      }
    }
  }

  public isVoiceBusy(): boolean {
    return this.isSpeaking || this.speechQueue.length > 0;
  }

  public removeQueuedSeat(seatIdx: number): void {
    this.speechQueue = this.speechQueue.filter((item) => item.seatIdx !== seatIdx);
  }

  private clearActivePlaybackHardware(): void {
    if (this.speechClearTimer) {
      clearTimeout(this.speechClearTimer);
      this.speechClearTimer = null;
    }
    if (this.speechWatchdogTimer) {
      clearTimeout(this.speechWatchdogTimer);
      this.speechWatchdogTimer = null;
    }
    if (this.talkBleepTimer) {
      clearTimeout(this.talkBleepTimer);
      this.talkBleepTimer = null;
    }
    if (this.activeBleepOscs.length > 0) {
      for (const osc of this.activeBleepOscs) {
        try {
          osc.stop();
          osc.disconnect();
        } catch {}
      }
      this.activeBleepOscs = [];
    }
    if (this.activeTtsAudio) {
      try {
        this.activeTtsAudio.onplaying = null;
        this.activeTtsAudio.onended = null;
        this.activeTtsAudio.onerror = null;
        this.activeTtsAudio.pause();
        this.activeTtsAudio.currentTime = 0;
        this.activeTtsAudio.removeAttribute('src');
        this.activeTtsAudio.load();
      } catch {}
      this.activeTtsAudio = null;
    }
    this.activeUtterance = null;
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {}
    this.activeTtsIsAi = false;
    this.isSpeaking = false;
    this.activeSpeechKey = '';
  }

  public skipCurrentSpeech(): void {
    this.speechRunId += 1;
    const endCb = this.activeOnEnd;
    this.activeOnEnd = null;
    this.clearActivePlaybackHardware();
    endCb?.();
    this.processNextSpeech();
  }

  public stopSpeech(): void {
    this.speechRunId += 1;
    this.speechQueue = [];
    const endCb = this.activeOnEnd;
    this.activeOnEnd = null;
    this.clearActivePlaybackHardware();
    endCb?.();
  }

  public async preloadCore(): Promise<void> {
    await Promise.all([
      this.loadClip('dice', STATIC_AUDIO_FILES.dice),
      this.loadClip('move', STATIC_AUDIO_FILES.move),
      this.loadClip('click', STATIC_AUDIO_FILES.click),
      this.loadClip('whoosh', STATIC_AUDIO_FILES.whoosh),
      this.loadClip('heartbeat', STATIC_AUDIO_FILES.heartbeat),
      this.loadClip('notification', STATIC_AUDIO_FILES.notification),
    ]);
  }

  public async loadClip(id: string, url: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(id)) return this.buffers.get(id) || null;
    if (this.loading.has(id)) return this.loading.get(id)!;

    const p = (async () => {
      try {
        const ctx = this.ensureContext();
        if (!ctx) return null;
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const buf = await resp.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf);
        this.buffers.set(id, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        this.loading.delete(id);
      }
    })();

    this.loading.set(id, p);
    return p;
  }

  private stopSfxId(id: string): void {
    const prev = this.activeSfx.get(id);
    if (!prev) return;
    this.activeSfx.delete(id);
    try {
      prev.source.onended = null;
      prev.source.stop();
      prev.source.disconnect();
      prev.gain.disconnect();
    } catch {}
  }

  public stopHeartbeat(): void {
    this.stopSfxId('heartbeat');
  }

  private playDecodedClip(
    id: string,
    buf: AudioBuffer,
    volScale: number,
    options?: { offsetSec?: number; maxDurSec?: number; fadeOutSec?: number },
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    this.stopSfxId(id);

    const source = ctx.createBufferSource();
    source.buffer = buf;
    const gain = ctx.createGain();
    const targetGain = Math.max(0.0001, Math.min(1, this.sfxVolume * volScale));
    const now = ctx.currentTime;
    const offset = Math.max(0, Math.min(buf.duration - 0.05, options?.offsetSec ?? 0));
    const available = Math.max(0.05, buf.duration - offset);
    const playDur = options?.maxDurSec ? Math.min(available, options.maxDurSec) : available;
    const fadeSec = options?.fadeOutSec ? Math.min(options.fadeOutSec, playDur * 0.45) : 0;

    gain.gain.setValueAtTime(targetGain, now);
    if (fadeSec > 0.01) {
      const fadeStart = now + Math.max(0.02, playDur - fadeSec);
      gain.gain.setValueAtTime(targetGain, fadeStart);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + playDur);
    }

    source.connect(gain);
    gain.connect(ctx.destination);
    this.activeSfx.set(id, { source, gain });
    source.onended = () => {
      const cur = this.activeSfx.get(id);
      if (cur && cur.source === source) {
        this.activeSfx.delete(id);
      }
      try {
        source.disconnect();
        gain.disconnect();
      } catch {}
    };

    if (options?.maxDurSec || offset > 0) {
      source.start(now, offset, playDur);
    } else {
      source.start(now);
    }
  }

  private getVoiceDuckScale(): number {
    if (this.liveVoiceDucking || this.activeClipAudio || this.activeClipSource || this.isSpeaking) {
      return 0.22;
    }
    if (this.activeSfx.has('heartbeat')) {
      return 0.58;
    }
    return 1;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const len = Math.floor(ctx.sampleRate * 0.6);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  private playToneEnv(
    ctx: AudioContext,
    type: OscillatorType,
    startTime: number,
    durSec: number,
    freqStart: number,
    freqEnd: number,
    peakGain: number,
  ): void {
    if (peakGain <= 0.0005) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freqStart), startTime);
    if (Math.abs(freqEnd - freqStart) > 1) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startTime + durSec);
    }
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.012, durSec * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + durSec + 0.015);
  }

  private playNoiseEnv(
    ctx: AudioContext,
    startTime: number,
    durSec: number,
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
    q: number,
    peakGain: number,
  ): void {
    if (peakGain <= 0.0005) return;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(60, freqStart), startTime);
    if (Math.abs(freqEnd - freqStart) > 5) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(60, freqEnd), startTime + durSec);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.01, durSec * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durSec);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(startTime, Math.random() * 0.2, durSec + 0.02);
  }

  private playCaptureImpact(duck = 1): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Punchy low impact + sharp descending strike so capture is unmistakable immediately at t=0
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(240, now);
    osc1.frequency.exponentialRampToValueAtTime(52, now + 0.28);
    gain1.gain.setValueAtTime(Math.min(0.45, this.sfxVolume * 0.42 * duck), now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.32);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(660, now + 0.04);
    osc2.frequency.exponentialRampToValueAtTime(160, now + 0.24);
    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.linearRampToValueAtTime(Math.min(0.32, this.sfxVolume * 0.3 * duck), now + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.03);
    osc2.stop(now + 0.28);
  }

  private playFormantVoice(
    ctx: AudioContext,
    startTime: number,
    durSec: number,
    oscType: OscillatorType,
    freqPoints: Array<[number, number]>,
    filterType: BiquadFilterType,
    cutoffStart: number,
    cutoffEnd: number,
    q: number,
    peakGain: number,
    opts?: { vibratoHz?: number; vibratoDepth?: number; detuneHarmonic?: number },
  ): void {
    if (peakGain <= 0.0005 || freqPoints.length === 0) return;
    const osc = ctx.createOscillator();
    osc.type = oscType;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(80, cutoffStart), startTime);
    if (Math.abs(cutoffEnd - cutoffStart) > 5) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoffEnd), startTime + durSec);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.03, durSec * 0.2));
    gain.gain.setValueAtTime(peakGain * 0.85, startTime + durSec * 0.65);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durSec);

    osc.frequency.setValueAtTime(Math.max(25, freqPoints[0][1]), startTime);
    for (let i = 1; i < freqPoints.length; i++) {
      const [frac, hz] = freqPoints[i];
      osc.frequency.exponentialRampToValueAtTime(Math.max(25, hz), startTime + durSec * Math.max(0.02, Math.min(1, frac)));
    }

    let osc2: OscillatorNode | null = null;
    if (opts?.detuneHarmonic) {
      osc2 = ctx.createOscillator();
      osc2.type = oscType;
      osc2.frequency.setValueAtTime(Math.max(25, freqPoints[0][1] * opts.detuneHarmonic), startTime);
      for (let i = 1; i < freqPoints.length; i++) {
        const [frac, hz] = freqPoints[i];
        osc2.frequency.exponentialRampToValueAtTime(
          Math.max(25, hz * opts.detuneHarmonic),
          startTime + durSec * Math.max(0.02, Math.min(1, frac)),
        );
      }
      osc2.connect(filter);
    }

    let lfo: OscillatorNode | null = null;
    if (opts?.vibratoHz && opts?.vibratoDepth) {
      lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(opts.vibratoHz, startTime);
      lfoGain.gain.setValueAtTime(opts.vibratoDepth, startTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      if (osc2) lfoGain.connect(osc2.frequency);
      lfo.start(startTime);
      lfo.stop(startTime + durSec + 0.02);
    }

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + durSec + 0.025);
    if (osc2) {
      osc2.start(startTime);
      osc2.stop(startTime + durSec + 0.025);
    }
  }

  private playAnimalVoice(
    ctx: AudioContext,
    animalId: AnimalArchetypeId,
    vol: number,
    shortCall = false,
  ): void {
    const now = ctx.currentTime;
    const lenScale = shortCall ? 0.56 : 1.0;

    switch (animalId) {
      case 'animal_lion': {
        // Deep guttural chest Lion Roar (sawtooth detuned growl + chest breath)
        this.playFormantVoice(
          ctx,
          now,
          0.48 * lenScale,
          'sawtooth',
          [
            [0, 145],
            [0.24, 205],
            [0.65, 138],
            [1, 66],
          ],
          'lowpass',
          820,
          240,
          2.2,
          vol * 0.92,
          { vibratoHz: 28, vibratoDepth: 16, detuneHarmonic: 1.018 },
        );
        this.playNoiseEnv(ctx, now + 0.03, 0.34 * lenScale, 'bandpass', 580, 220, 1.5, vol * 0.42);
        break;
      }
      case 'animal_elephant': {
        // Brassy harmonic sweeping Elephant Trumpet
        this.playFormantVoice(
          ctx,
          now,
          0.46 * lenScale,
          'sawtooth',
          [
            [0, 320],
            [0.22, 690],
            [0.58, 560],
            [1, 390],
          ],
          'bandpass',
          1250,
          880,
          2.6,
          vol * 0.95,
          { vibratoHz: 22, vibratoDepth: 26, detuneHarmonic: 1.49 },
        );
        this.playNoiseEnv(ctx, now, 0.16 * lenScale, 'bandpass', 1400, 900, 1.4, vol * 0.35);
        break;
      }
      case 'animal_eagle': {
        // High piercing descending Eagle Screech
        this.playFormantVoice(
          ctx,
          now,
          0.35 * lenScale,
          'triangle',
          [
            [0, 2380],
            [0.18, 3080],
            [0.55, 2280],
            [1, 1420],
          ],
          'bandpass',
          2600,
          1700,
          2.2,
          vol * 0.82,
          { vibratoHz: 42, vibratoDepth: 85, detuneHarmonic: 1.012 },
        );
        this.playNoiseEnv(ctx, now, 0.14 * lenScale, 'highpass', 2400, 3600, 1.8, vol * 0.28);
        break;
      }
      case 'animal_horse': {
        // Expressive trembling Wild Stallion Neigh / Whinny
        this.playFormantVoice(
          ctx,
          now,
          0.48 * lenScale,
          'sawtooth',
          [
            [0, 740],
            [0.18, 920],
            [0.52, 560],
            [1, 310],
          ],
          'bandpass',
          1420,
          680,
          2.8,
          vol * 0.88,
          { vibratoHz: 17, vibratoDepth: 34, detuneHarmonic: 1.008 },
        );
        this.playNoiseEnv(ctx, now, 0.12 * lenScale, 'bandpass', 1100, 720, 1.3, vol * 0.28);
        break;
      }
      case 'animal_wolf': {
        // Haunting sustained Alpha Wolf Howl
        this.playFormantVoice(
          ctx,
          now,
          0.56 * lenScale,
          'triangle',
          [
            [0, 255],
            [0.26, 520],
            [0.64, 490],
            [1, 345],
          ],
          'bandpass',
          740,
          540,
          1.9,
          vol * 0.9,
          { vibratoHz: 6.5, vibratoDepth: 8, detuneHarmonic: 2.0 },
        );
        break;
      }
      case 'animal_frog': {
        // Classic double-pulse Tree Frog Ribbit ("rib-bit!")
        const p1 = shortCall ? 0.06 : 0.085;
        const p2 = shortCall ? 0.085 : 0.125;
        this.playFormantVoice(
          ctx,
          now,
          p1,
          'sawtooth',
          [
            [0, 165],
            [0.5, 340],
            [1, 445],
          ],
          'bandpass',
          620,
          1020,
          3.4,
          vol * 0.88,
          { vibratoHz: 36, vibratoDepth: 32 },
        );
        this.playFormantVoice(
          ctx,
          now + p1 + 0.055,
          p2,
          'sawtooth',
          [
            [0, 190],
            [0.45, 420],
            [1, 610],
          ],
          'bandpass',
          700,
          1220,
          3.6,
          vol * 0.96,
          { vibratoHz: 38, vibratoDepth: 38 },
        );
        break;
      }
      case 'animal_cobra': {
        // Sharp modulated King Cobra Hiss with tongue flutter bursts
        const pulses = shortCall ? 2 : 4;
        for (let i = 0; i < pulses; i++) {
          const t0 = now + i * 0.095;
          this.playNoiseEnv(ctx, t0, 0.09, 'bandpass', 4200, 6200, 2.4, vol * (i % 2 === 0 ? 0.92 : 0.68));
        }
        this.playNoiseEnv(ctx, now, 0.36 * lenScale, 'highpass', 3600, 5200, 1.5, vol * 0.55);
        break;
      }
      case 'animal_gorilla': {
        // Rapid Silverback chest-beat drum pounds + deep guttural primate grunt
        const beats = shortCall ? 2 : 3;
        for (let i = 0; i < beats; i++) {
          const t = now + i * 0.075;
          this.playToneEnv(ctx, 'sine', t, 0.068, 108, 48, vol * 0.95);
          this.playNoiseEnv(ctx, t, 0.04, 'lowpass', 380, 140, 1.0, vol * 0.5);
        }
        this.playFormantVoice(
          ctx,
          now + 0.06,
          0.26 * lenScale,
          'sawtooth',
          [
            [0, 178],
            [0.5, 132],
            [1, 88],
          ],
          'bandpass',
          460,
          280,
          2.2,
          vol * 0.78,
          { vibratoHz: 24, vibratoDepth: 12 },
        );
        break;
      }
      case 'animal_kangaroo': {
        // Heavy tail-kick bound thump + twin rapid marsupial call
        this.playToneEnv(ctx, 'sine', now, 0.095, 145, 58, vol * 0.9);
        this.playFormantVoice(
          ctx,
          now + 0.03,
          0.11 * lenScale,
          'triangle',
          [
            [0, 260],
            [1, 510],
          ],
          'bandpass',
          860,
          1260,
          2.2,
          vol * 0.78,
        );
        if (!shortCall) {
          this.playToneEnv(ctx, 'sine', now + 0.16, 0.095, 155, 62, vol * 0.85);
          this.playFormantVoice(
            ctx,
            now + 0.18,
            0.13,
            'triangle',
            [
              [0, 290],
              [1, 560],
            ],
            'bandpass',
            920,
            1380,
            2.2,
            vol * 0.82,
          );
        }
        break;
      }
      case 'animal_rooster': {
        // Iconic 4-syllable Rooster Crow ("cock-a-doodle-doo!")
        const phrases = shortCall
          ? [
              { off: 0, d: 0.075, f0: 660, f1: 860 },
              { off: 0.09, d: 0.18, f0: 930, f1: 710 },
            ]
          : [
              { off: 0, d: 0.075, f0: 640, f1: 820 },
              { off: 0.095, d: 0.065, f0: 850, f1: 890 },
              { off: 0.18, d: 0.065, f0: 780, f1: 860 },
              { off: 0.265, d: 0.27, f0: 950, f1: 680 },
            ];
        for (const ph of phrases) {
          this.playFormantVoice(
            ctx,
            now + ph.off,
            ph.d,
            'sawtooth',
            [
              [0, ph.f0],
              [0.5, (ph.f0 + ph.f1) * 0.52],
              [1, ph.f1],
            ],
            'bandpass',
            1520,
            1240,
            2.4,
            vol * 0.82,
            { vibratoHz: 14, vibratoDepth: 16 },
          );
        }
        break;
      }
    }
  }

  public playCharacterMoveStep(
    charId: CharacterArchetypeId,
    gender: CharacterGender,
    stepIndex = 0,
    fastCadence = false,
  ): void {
    if (this.sfxVolume <= 0.001) return;
    const nowMs = Date.now();
    const prev = this.lastPlayed.get('char_step') || 0;
    const minGap = fastCadence ? 48 : 58;
    if (nowMs - prev < minGap) return;
    this.lastPlayed.set('char_step', nowMs);

    const ctx = this.ensureContext();
    if (!ctx) return;

    // Anti-ear-fatigue envelope: softer cadence after first 2 hops + voice/whisper ducking
    const stepTaper = stepIndex <= 1 ? 1.0 : stepIndex <= 4 ? 0.65 : 0.48;
    const vol = Math.min(0.32, this.sfxVolume * 0.28 * stepTaper * this.getVoiceDuckScale());
    if (vol <= 0.002) return;

    const now = ctx.currentTime;
    const durScale = fastCadence ? 0.82 : 1.0;
    const isGirl = gender === 'girl';

    switch (charId) {
      case 'belly_dancer': {
        // Soft shimmering bell chime + light rhythmic finger-tap
        const base = isGirl ? 1280 : 760;
        const alt = stepIndex % 2 === 0 ? 1 : 1.12;
        this.playToneEnv(ctx, 'sine', now, 0.065 * durScale, base * alt, base * alt * 1.04, vol * 0.68);
        this.playToneEnv(ctx, 'sine', now + 0.008, 0.055 * durScale, base * 1.5 * alt, base * 1.52 * alt, vol * 0.36);
        this.playToneEnv(ctx, 'triangle', now, 0.04 * durScale, isGirl ? 340 : 210, isGirl ? 240 : 140, vol * 0.45);
        break;
      }
      case 'sprinter_man': {
        // Quick crisp turf-step / brisk foot-tap (sharper stride on boy, lighter brisk cadence on girl)
        const turfFreq = isGirl ? 2100 : 1450;
        this.playNoiseEnv(ctx, now, 0.042 * durScale, 'bandpass', turfFreq, turfFreq * 0.72, 2.2, vol * 0.75);
        this.playToneEnv(ctx, 'triangle', now, 0.038 * durScale, isGirl ? 240 : 165, isGirl ? 115 : 74, vol * 0.65);
        break;
      }
      case 'model_runway': {
        // Clean heel/step click with smooth style accent
        const clickHz = isGirl ? 2250 : 1320;
        this.playNoiseEnv(ctx, now, 0.03 * durScale, 'highpass', clickHz, clickHz * 1.15, 2.5, vol * 0.55);
        this.playToneEnv(ctx, 'triangle', now, 0.045 * durScale, isGirl ? 980 : 520, isGirl ? 640 : 320, vol * 0.7);
        break;
      }
      case 'gymnast': {
        // Light springy vault/hop cue
        const f0 = isGirl ? 510 : 350;
        const f1 = isGirl ? 940 : 650;
        this.playToneEnv(ctx, 'sine', now, 0.068 * durScale, f0, f1, vol * 0.78);
        this.playNoiseEnv(ctx, now, 0.035 * durScale, 'bandpass', 1800, 2600, 1.8, vol * 0.28);
        break;
      }
      case 'wrestler': {
        // Heavy mat/ground thud step (firm & tight on girl, heavy low impact on boy)
        this.playToneEnv(ctx, 'sine', now, 0.072 * durScale, isGirl ? 185 : 132, isGirl ? 76 : 48, vol * 0.95);
        this.playNoiseEnv(ctx, now, 0.05 * durScale, 'lowpass', isGirl ? 820 : 560, 240, 1.2, vol * 0.65);
        break;
      }
      case 'climber_3d': {
        // Rising climb/vault arc + crisp grip tap
        const startF = isGirl ? 490 : 340;
        const endF = isGirl ? 830 : 590;
        this.playToneEnv(ctx, 'triangle', now, 0.064 * durScale, startF, endF, vol * 0.72);
        this.playNoiseEnv(ctx, now + 0.025, 0.028 * durScale, 'bandpass', 2400, 1600, 2.4, vol * 0.36);
        break;
      }
      case 'ninja_fighter': {
        // Very quick clean stealth slice/whoosh
        const w0 = isGirl ? 2700 : 1900;
        const w1 = isGirl ? 4400 : 3000;
        this.playNoiseEnv(ctx, now, 0.045 * durScale, 'bandpass', w0, w1, 2.8, vol * 0.8);
        this.playToneEnv(ctx, 'sine', now, 0.035 * durScale, isGirl ? 860 : 580, isGirl ? 420 : 280, vol * 0.35);
        break;
      }
      case 'skater_3d': {
        // Smooth wheel roll + quick ollie pop
        this.playNoiseEnv(ctx, now, 0.068 * durScale, 'bandpass', isGirl ? 1400 : 950, isGirl ? 1750 : 1200, 1.6, vol * 0.62);
        this.playToneEnv(ctx, 'triangle', now, 0.038 * durScale, isGirl ? 1050 : 760, isGirl ? 480 : 340, vol * 0.65);
        break;
      }
      case 'breakdancer': {
        // Funky short beat/groove tap
        const fA = stepIndex % 2 === 0 ? (isGirl ? 560 : 240) : isGirl ? 720 : 320;
        this.playToneEnv(ctx, 'triangle', now, 0.052 * durScale, fA, fA * 1.15, vol * 0.78);
        this.playNoiseEnv(ctx, now, 0.026 * durScale, 'highpass', isGirl ? 2600 : 1900, 3200, 2.0, vol * 0.45);
        break;
      }
      case 'strongman': {
        // Solid heavy-iron/ground step
        this.playToneEnv(ctx, 'sine', now, 0.074 * durScale, isGirl ? 165 : 115, isGirl ? 72 : 45, vol * 0.92);
        this.playToneEnv(ctx, 'sine', now, 0.045 * durScale, isGirl ? 1680 : 1360, isGirl ? 1640 : 1320, vol * 0.28);
        break;
      }
      case 'animal_lion': {
        if (stepIndex === 0) this.playAnimalVoice(ctx, 'animal_lion', vol * 0.72, true);
        this.playNoiseEnv(ctx, now, 0.048 * durScale, 'lowpass', 720, 260, 1.1, vol * 0.78);
        this.playToneEnv(ctx, 'sine', now, 0.055 * durScale, 138, 62, vol * 0.72);
        break;
      }
      case 'animal_elephant': {
        if (stepIndex === 0) this.playAnimalVoice(ctx, 'animal_elephant', vol * 0.7, true);
        this.playToneEnv(ctx, 'sine', now, 0.095 * durScale, 118, 42, vol * 1.0);
        this.playNoiseEnv(ctx, now, 0.065 * durScale, 'lowpass', 480, 160, 1.2, vol * 0.78);
        break;
      }
      case 'animal_eagle': {
        if (stepIndex === 0) this.playAnimalVoice(ctx, 'animal_eagle', vol * 0.65, true);
        this.playNoiseEnv(ctx, now, 0.08 * durScale, 'bandpass', 620, 1450, 1.3, vol * 0.84);
        break;
      }
      case 'animal_horse': {
        if (stepIndex === 0) this.playAnimalVoice(ctx, 'animal_horse', vol * 0.65, true);
        // Classic crisp double-clop horse hoofbeat!
        this.playToneEnv(ctx, 'triangle', now, 0.028 * durScale, 920, 410, vol * 0.85);
        this.playToneEnv(ctx, 'triangle', now + 0.042 * durScale, 0.028 * durScale, 760, 340, vol * 0.78);
        this.playNoiseEnv(ctx, now, 0.022 * durScale, 'bandpass', 2100, 1300, 2.0, vol * 0.45);
        break;
      }
      case 'animal_wolf': {
        if (stepIndex === 0) this.playAnimalVoice(ctx, 'animal_wolf', vol * 0.62, true);
        this.playNoiseEnv(ctx, now, 0.042 * durScale, 'bandpass', 1800, 950, 2.0, vol * 0.74);
        this.playToneEnv(ctx, 'triangle', now, 0.04 * durScale, 210, 105, vol * 0.58);
        break;
      }
      case 'animal_frog': {
        // Springy frog hop + mini ribbit croak on alternating hops
        this.playToneEnv(ctx, 'sine', now, 0.068 * durScale, 280, 740, vol * 0.78);
        if (stepIndex % 2 === 0) {
          this.playAnimalVoice(ctx, 'animal_frog', vol * 0.72, true);
        }
        break;
      }
      case 'animal_cobra': {
        if (stepIndex === 0) this.playAnimalVoice(ctx, 'animal_cobra', vol * 0.68, true);
        this.playNoiseEnv(ctx, now, 0.065 * durScale, 'bandpass', 3600, 5600, 2.2, vol * 0.76);
        break;
      }
      case 'animal_gorilla': {
        if (stepIndex === 0) this.playAnimalVoice(ctx, 'animal_gorilla', vol * 0.74, true);
        this.playToneEnv(ctx, 'sine', now, 0.08 * durScale, 140, 54, vol * 0.96);
        this.playNoiseEnv(ctx, now, 0.045 * durScale, 'lowpass', 520, 190, 1.1, vol * 0.65);
        break;
      }
      case 'animal_kangaroo': {
        if (stepIndex === 0) this.playAnimalVoice(ctx, 'animal_kangaroo', vol * 0.72, true);
        this.playToneEnv(ctx, 'sine', now, 0.085 * durScale, 165, 68, vol * 0.88);
        this.playToneEnv(ctx, 'triangle', now + 0.015, 0.06 * durScale, 290, 560, vol * 0.55);
        break;
      }
      case 'animal_rooster': {
        if (stepIndex === 0) this.playAnimalVoice(ctx, 'animal_rooster', vol * 0.66, true);
        const f = stepIndex % 2 === 0 ? 520 : 660;
        this.playToneEnv(ctx, 'triangle', now, 0.036 * durScale, f, f * 1.18, vol * 0.72);
        this.playNoiseEnv(ctx, now, 0.03 * durScale, 'bandpass', 2200, 3100, 2.0, vol * 0.42);
        break;
      }
    }
  }

  public playCharacterCapture(charId: CharacterArchetypeId, gender: CharacterGender): void {
    const nowMs = Date.now();
    const prev = this.lastPlayed.get('capture') || 0;
    if (nowMs - prev < 80) return;
    this.lastPlayed.set('capture', nowMs);
    if (this.sfxVolume <= 0.001) return;

    this.stopSfxId('move');
    this.stopSfxId('heartbeat');
    const duck = this.getVoiceDuckScale();
    this.playCaptureImpact(duck);

    const whooshBuf = this.buffers.get('whoosh');
    if (whooshBuf) {
      this.playDecodedClip('whoosh', whooshBuf, 0.72 * duck, { offsetSec: 0.48, maxDurSec: 1.05, fadeOutSec: 0.25 });
    }
    this.playCharacterAction(charId, gender, 'capture');
  }

  public playCharacterAction(
    charId: CharacterArchetypeId,
    gender: CharacterGender,
    action: CharacterCelebrationKind | 'preview',
  ): void {
    if (this.sfxVolume <= 0.001) return;
    const nowMs = Date.now();
    const key = `char_act_${action}`;
    const prev = this.lastPlayed.get(key) || 0;
    if (action !== 'preview' && nowMs - prev < 110) return;
    this.lastPlayed.set(key, nowMs);

    const ctx = this.ensureContext();
    if (!ctx) return;

    const duck = action === 'preview' ? 1 : this.getVoiceDuckScale();
    const vol = Math.min(0.42, this.sfxVolume * (action === 'capture' ? 0.36 : 0.32) * duck);
    if (vol <= 0.002) return;

    const now = ctx.currentTime;
    const isGirl = gender === 'girl';

    if (isAnimalCharacter(charId)) {
      this.playAnimalVoice(ctx, charId, vol, false);
      if (action === 'preview') {
        this.playCharacterMoveStep(charId, gender, 1, false);
      }
      return;
    }

    switch (charId) {
      case 'belly_dancer': {
        const notes = isGirl ? [987.77, 1318.5, 1567.98] : [659.25, 880, 1046.5];
        notes.forEach((f, i) => {
          this.playToneEnv(ctx, 'sine', now + i * 0.048, 0.14, f, f * 1.03, vol * 0.7);
        });
        break;
      }
      case 'sprinter_man': {
        this.playNoiseEnv(ctx, now, 0.16, 'bandpass', isGirl ? 1600 : 1100, isGirl ? 3400 : 2500, 1.8, vol * 0.9);
        this.playToneEnv(ctx, 'triangle', now + 0.05, 0.12, isGirl ? 540 : 380, isGirl ? 880 : 620, vol * 0.75);
        break;
      }
      case 'model_runway': {
        const chord = isGirl ? [880, 1108.73, 1318.5] : [440, 554.37, 659.25];
        chord.forEach((f, i) => {
          this.playToneEnv(ctx, 'triangle', now + i * 0.055, 0.18, f, f, vol * 0.68);
        });
        break;
      }
      case 'gymnast': {
        this.playNoiseEnv(ctx, now, 0.12, 'bandpass', 1800, 3400, 2.0, vol * 0.65);
        this.playToneEnv(ctx, 'sine', now, 0.12, isGirl ? 560 : 390, isGirl ? 1240 : 880, vol * 0.75);
        this.playToneEnv(ctx, 'sine', now + 0.13, 0.09, isGirl ? 220 : 155, isGirl ? 95 : 62, vol * 0.85);
        break;
      }
      case 'wrestler': {
        this.playToneEnv(ctx, 'sawtooth', now, 0.22, isGirl ? 210 : 155, isGirl ? 72 : 44, vol * 0.88);
        this.playNoiseEnv(ctx, now, 0.14, 'lowpass', isGirl ? 950 : 620, 180, 1.1, vol * 0.85);
        break;
      }
      case 'climber_3d': {
        this.playToneEnv(ctx, 'triangle', now, 0.14, isGirl ? 440 : 310, isGirl ? 1120 : 790, vol * 0.78);
        this.playToneEnv(ctx, 'sine', now + 0.12, 0.13, isGirl ? 1320 : 980, isGirl ? 1380 : 1020, vol * 0.62);
        break;
      }
      case 'ninja_fighter': {
        this.playNoiseEnv(ctx, now, 0.09, 'bandpass', isGirl ? 2600 : 1900, 4800, 2.6, vol * 0.95);
        this.playToneEnv(ctx, 'sawtooth', now + 0.03, 0.1, isGirl ? 920 : 620, isGirl ? 240 : 150, vol * 0.75);
        break;
      }
      case 'skater_3d': {
        this.playToneEnv(ctx, 'triangle', now, 0.06, isGirl ? 1180 : 860, isGirl ? 520 : 380, vol * 0.85);
        this.playNoiseEnv(ctx, now + 0.05, 0.15, 'bandpass', isGirl ? 1400 : 980, isGirl ? 2100 : 1500, 1.6, vol * 0.72);
        break;
      }
      case 'breakdancer': {
        this.playNoiseEnv(ctx, now, 0.11, 'bandpass', 1200, 3200, 2.2, vol * 0.72);
        this.playToneEnv(ctx, 'triangle', now + 0.09, 0.13, isGirl ? 740 : 360, isGirl ? 980 : 520, vol * 0.86);
        break;
      }
      case 'strongman': {
        this.playToneEnv(ctx, 'sine', now, 0.22, isGirl ? 185 : 130, isGirl ? 68 : 42, vol * 0.95);
        this.playToneEnv(ctx, 'triangle', now + 0.04, 0.18, isGirl ? 1120 : 880, isGirl ? 1090 : 860, vol * 0.45);
        break;
      }
    }

    if (action === 'preview') {
      // Follow immediate move-step feel with crisp preview rhythm
      this.playCharacterMoveStep(charId, gender, 0, false);
    }
  }

  public play(id: keyof typeof STATIC_AUDIO_FILES | 'lucky7' | 'win' | 'capture', volScale = 1): void {
    const now = Date.now();
    const prev = this.lastPlayed.get(id) || 0;
    const minGap = id === 'move' ? 180 : id === 'notification' ? 300 : id === 'heartbeat' ? 1800 : 80;
    if (now - prev < minGap) return;
    this.lastPlayed.set(id, now);

    if (this.sfxVolume <= 0.001) return;

    const duckScale = id === 'heartbeat' || id === 'win' ? 1 : this.getVoiceDuckScale();
    const effVolScale = volScale * duckScale;

    if (id === 'lucky7') {
      this.playChime([523.25, 659.25, 783.99, 1046.5], 0.12);
      return;
    }
    if (id === 'win') {
      this.playChime([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.16);
      return;
    }
    if (id === 'capture') {
      this.stopSfxId('move');
      this.stopSfxId('heartbeat');
      this.playCaptureImpact(duckScale);
      const whooshBuf = this.buffers.get('whoosh');
      if (whooshBuf) {
        // Skip the 0.48s silent lead-in inside whoosh.mp3
        this.playDecodedClip('whoosh', whooshBuf, 0.9 * duckScale, { offsetSec: 0.48, maxDurSec: 1.15, fadeOutSec: 0.25 });
      } else {
        void this.loadClip('whoosh', STATIC_AUDIO_FILES.whoosh).then((buf) => {
          if (buf) this.playDecodedClip('whoosh', buf, 0.9 * duckScale, { offsetSec: 0.48, maxDurSec: 1.15, fadeOutSec: 0.25 });
        });
      }
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx) return;

    const clipOpts =
      id === 'move'
        ? { offsetSec: 0.04, maxDurSec: 0.95, fadeOutSec: 0.18 }
        : id === 'whoosh'
          ? { offsetSec: 0.48, maxDurSec: 1.15, fadeOutSec: 0.25 }
          : id === 'heartbeat'
            ? { offsetSec: 0, maxDurSec: 2.35, fadeOutSec: 0.35 }
            : id === 'notification'
              ? { maxDurSec: 1.4, fadeOutSec: 0.2 }
              : undefined;

    const url = STATIC_AUDIO_FILES[id];
    const existing = this.buffers.get(id);
    if (existing) {
      this.playDecodedClip(id, existing, effVolScale, clipOpts);
    } else if (url) {
      void this.loadClip(id, url).then((buf) => {
        if (buf) {
          this.playDecodedClip(id, buf, effVolScale, clipOpts);
        }
      });
    }
  }

  public diceHit(strength = 1): void {
    if (this.sfxVolume <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const clampedStrength = Math.max(0.15, Math.min(1.2, strength));
    const duckScale = this.getVoiceDuckScale();
    const baseGain = Math.min(0.55, this.sfxVolume * 0.44 * clampedStrength * duckScale);
    if (baseGain <= 0.002) return;

    const triggerClack = (offsetSec: number, gainScale: number, pitchOffset: number) => {
      const t0 = ctx.currentTime + offsetSec;
      const hitGain = baseGain * gainScale;
      // Wooden body resonance knock
      this.playToneEnv(ctx, 'triangle', t0, 0.042, 460 + pitchOffset, 155, hitGain * 0.85);
      // Crisp hard-wood die-on-board clack transient
      this.playNoiseEnv(ctx, t0, 0.032, 'bandpass', 1750 + pitchOffset * 2, 720, 3.2, hitGain * 0.95);
    };

    // Double-die wooden clack separated by ~24ms
    triggerClack(0, 1.0, 0);
    triggerClack(0.024, 0.78, 85);
  }

  public playTurboSkidLaunch(): void {
    const now = Date.now();
    const prev = this.lastPlayed.get('turbo_skid') || 0;
    if (now - prev < 350) return;
    this.lastPlayed.set('turbo_skid', now);

    if (this.sfxVolume <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const duckScale = this.getVoiceDuckScale();
    const g = Math.min(0.45, this.sfxVolume * 0.36 * duckScale);
    if (g <= 0.002) return;

    const t0 = ctx.currentTime;
    // Rising engine rev-up acceleration hum before burnout launch
    this.playToneEnv(ctx, 'sawtooth', t0, 0.42, 82, 290, g * 0.42);
    this.playToneEnv(ctx, 'triangle', t0 + 0.04, 0.38, 125, 420, g * 0.34);
    // Filtered burnout tire smoke hiss
    this.playNoiseEnv(ctx, t0 + 0.05, 0.36, 'bandpass', 720, 2200, 1.8, g * 0.35);
    // Crisp high-speed skid launch whoosh at ~420ms
    this.playNoiseEnv(ctx, t0 + 0.41, 0.28, 'highpass', 950, 1800, 1.2, g * 0.55);
  }

  public diceRoll(durationMs = 500): void {
    if (this.sfxVolume <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const duckScale = this.getVoiceDuckScale();
    const effVolScale = 0.92 * duckScale;
    const maxDurSec = Math.max(0.18, Math.min(1.6, durationMs / 1000));
    const clipOpts = {
      offsetSec: 0.05,
      maxDurSec,
      fadeOutSec: Math.min(0.16, maxDurSec * 0.35),
    };

    const existing = this.buffers.get('dice');
    if (existing) {
      this.playDecodedClip('dice', existing, effVolScale, clipOpts);
    } else {
      void this.loadClip('dice', STATIC_AUDIO_FILES.dice).then((buf) => {
        if (buf) {
          this.playDecodedClip('dice', buf, effVolScale, clipOpts);
        }
      });
    }
  }

  public stopVoiceClip(): void {
    if (this.activeClipSafetyTimer) {
      clearTimeout(this.activeClipSafetyTimer);
      this.activeClipSafetyTimer = null;
    }
    if (this.activeClipSource) {
      try {
        this.activeClipSource.onended = null;
        this.activeClipSource.stop();
        this.activeClipSource.disconnect();
      } catch {}
      this.activeClipSource = null;
    }
    if (this.activeClipAudio) {
      try {
        this.activeClipAudio.onplaying = null;
        this.activeClipAudio.onended = null;
        this.activeClipAudio.onerror = null;
        this.activeClipAudio.pause();
        this.activeClipAudio.removeAttribute('src');
        this.activeClipAudio.load();
      } catch {}
      this.activeClipAudio = null;
    }
  }

  public evictAudioClipCache(url?: string): void {
    if (!url) return;
    this.clipBufferCache.delete(url);
    this.clipLoadingCache.delete(url);
  }

  public async preloadAudioClip(url: string): Promise<AudioBuffer | 'failed'> {
    if (!url) return 'failed';
    const cached = this.clipBufferCache.get(url);
    if (cached) return cached;
    const inflight = this.clipLoadingCache.get(url);
    if (inflight) return inflight;

    const task = (async (): Promise<AudioBuffer | 'failed'> => {
      try {
        const ctx = this.ensureContext();
        if (!ctx) return 'failed';
        const resp = await fetch(url);
        if (!resp.ok) return 'failed';
        const arr = await resp.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arr);
        this.clipBufferCache.set(url, decoded);
        return decoded;
      } catch {
        this.clipBufferCache.set(url, 'failed');
        return 'failed';
      } finally {
        this.clipLoadingCache.delete(url);
      }
    })();

    this.clipLoadingCache.set(url, task);
    return task;
  }

  private getBufferPeak(buf: AudioBuffer): number {
    let peak = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
    }
    return peak;
  }

  public async playAudioClip(
    url: string,
    options?: {
      gain?: number;
      onStart?: () => void;
      onEnded?: () => void;
      onError?: () => void;
    },
  ): Promise<void> {
    if (!url) {
      options?.onError?.();
      return;
    }
    this.stopSpeech();
    this.stopVoiceClip();

    const ctx = this.ensureContext();
    if (ctx && ctx.state !== 'running') {
      ctx.resume().catch(() => {});
    }

    let settled = false;
    const finishOnce = (isError = false) => {
      if (settled) return;
      settled = true;
      if (this.activeClipSafetyTimer) {
        clearTimeout(this.activeClipSafetyTimer);
        this.activeClipSafetyTimer = null;
      }
      if (isError) options?.onError?.();
      else options?.onEnded?.();
    };

    const playDecodedSync = (decoded: AudioBuffer): boolean => {
      if (!ctx || ctx.state !== 'running') return false;
      const peak = this.getBufferPeak(decoded);
      if (decoded.length === 0 || peak <= 0.0001) {
        return false;
      }

      const source = ctx.createBufferSource();
      source.buffer = decoded;

      // Dynamically normalize quiet mic recordings so whispers & voice notes are always clearly audible
      const baseGain = options?.gain ?? 1.9;
      const autoBoost = peak > 0.002 ? Math.min(8.0, Math.max(baseGain, 0.85 / peak)) : baseGain;
      const gain = ctx.createGain();
      gain.gain.value = autoBoost;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 6;

      source.connect(gain);
      gain.connect(comp);
      comp.connect(ctx.destination);

      this.activeClipSource = source;
      this.activeClipSafetyTimer = setTimeout(() => {
        if (this.activeClipSource === source) this.activeClipSource = null;
        finishOnce(false);
      }, Math.max(1500, Math.ceil(decoded.duration * 1000) + 1200));

      source.onended = () => {
        if (this.activeClipSource === source) this.activeClipSource = null;
        try {
          source.disconnect();
          gain.disconnect();
          comp.disconnect();
        } catch {}
        finishOnce(false);
      };
      options?.onStart?.();
      source.start(0);
      return true;
    };

    const tryHtmlPlaybackSync = (allowBufferFallback: boolean) => {
      try {
        const audio = new Audio(url);
        audio.volume = 1;
        audio.muted = false;
        (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
        this.activeClipAudio = audio;
        let started = false;
        let fallbackTriggered = false;

        const attemptBufferFallback = async () => {
          if (fallbackTriggered || settled || started) return;
          fallbackTriggered = true;
          if (this.activeClipAudio === audio) this.activeClipAudio = null;
          if (allowBufferFallback) {
            const res = await this.preloadAudioClip(url);
            if (res !== 'failed' && ctx) {
              if ((ctx.state as string) !== 'running') {
                await Promise.race([
                  ctx.resume().catch(() => {}),
                  new Promise<void>((r) => setTimeout(r, 150)),
                ]);
              }
              if (playDecodedSync(res)) return;
            }
          }
          finishOnce(true);
        };

        audio.onplaying = () => {
          if (started) return;
          started = true;
          options?.onStart?.();
        };
        audio.onended = () => {
          if (this.activeClipAudio === audio) this.activeClipAudio = null;
          finishOnce(false);
        };
        audio.onerror = () => {
          if (started) {
            if (this.activeClipAudio === audio) this.activeClipAudio = null;
            finishOnce(false);
          } else {
            void attemptBufferFallback();
          }
        };

        this.activeClipSafetyTimer = setTimeout(() => {
          if (this.activeClipAudio === audio) this.activeClipAudio = null;
          finishOnce(false);
        }, 9000);

        const p = audio.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            if (!started) {
              started = true;
              options?.onStart?.();
            }
          }).catch(() => {
            void attemptBufferFallback();
          });
        }
      } catch {
        finishOnce(true);
      }
    };

    // Fast 100% synchronous WebAudio path when already decoded AND AudioContext is running
    const cached = this.clipBufferCache.get(url);
    if (cached && cached !== 'failed' && playDecodedSync(cached)) {
      return;
    }

    // Synchronous HTMLAudioElement path preserves user tap gesture on ALL browsers (iOS Safari, Android, Chrome)
    // and falls back cleanly to async decodeAudioData if HTMLAudio rejects or fails to decode.
    tryHtmlPlaybackSync(cached !== 'failed');
    if (!cached) {
      void this.preloadAudioClip(url);
    }
  }

  private playChime(freqs: number[], stepSec: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const baseTime = ctx.currentTime;
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, baseTime + idx * stepSec);
      gain.gain.setValueAtTime(0.001, baseTime + idx * stepSec);
      gain.gain.exponentialRampToValueAtTime(0.22 * this.sfxVolume, baseTime + idx * stepSec + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, baseTime + idx * stepSec + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(baseTime + idx * stepSec);
      osc.stop(baseTime + idx * stepSec + 0.38);
    });
  }

  public async setCustomMusicFile(file: File): Promise<boolean> {
    try {
      const ctx = this.ensureContext();
      if (!ctx) return false;
      const buf = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf);
      this.buffers.set('custom', decoded);
      if (this.customUrl) URL.revokeObjectURL(this.customUrl);
      this.customUrl = URL.createObjectURL(file);
      await this.playMusic('custom');
      return true;
    } catch {
      return false;
    }
  }

  private clearBgmNodes(): void {
    if (this.bgmSource) {
      try {
        this.bgmSource.onended = null;
        this.bgmSource.stop();
        this.bgmSource.disconnect();
      } catch {}
      this.bgmSource = null;
    }
    if (this.bgmGain) {
      try {
        this.bgmGain.disconnect();
      } catch {}
      this.bgmGain = null;
    }
  }

  public async playMusic(trackId: string): Promise<void> {
    if (!trackId || trackId === 'none') {
      this.activeMusicId = 'none';
      this.stopMusic();
      return;
    }

    if (this.activeMusicId === trackId && this.bgmSource) {
      if (this.bgmGain && this.audioCtx) {
        try {
          this.bgmGain.gain.setTargetAtTime(this.musicVolume, this.audioCtx.currentTime, 0.05);
        } catch {
          this.bgmGain.gain.value = this.musicVolume;
        }
      }
      return;
    }

    const runId = ++this.musicRunId;
    this.activeMusicId = trackId;
    this.clearBgmNodes();

    const ctx = this.ensureContext();
    if (!ctx) return;

    let buf: AudioBuffer | null = null;
    if (trackId === 'custom') {
      buf = this.buffers.get('custom') || null;
    } else {
      const track = MUSIC_TRACKS.find((t) => t.id === trackId);
      if (!track?.url) return;
      buf = (await this.loadClip(`music_${track.id}`, track.url)) || null;
    }

    // Abort if stopMusic() or a newer playMusic() superseded this load while awaiting
    if (!buf || runId !== this.musicRunId || this.activeMusicId !== trackId) {
      return;
    }

    // Guarantee single active BGM source node even under rapid switches
    this.clearBgmNodes();

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = this.musicVolume;

    source.connect(gain);
    gain.connect(ctx.destination);
    source.onended = () => {
      if (this.bgmSource === source) {
        this.bgmSource = null;
      }
      if (this.bgmGain === gain) {
        this.bgmGain = null;
      }
      try {
        source.disconnect();
        gain.disconnect();
      } catch {}
    };

    source.start(0);
    this.bgmSource = source;
    this.bgmGain = gain;
  }

  public stopMusic(): void {
    this.musicRunId += 1;
    this.clearBgmNodes();
  }

  private async hasStaticLanguagePack(lang: string): Promise<boolean> {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return false;
    if (!this.staticManifestChecked) {
      this.staticManifestChecked = true;
      try {
        const resp = await fetch('/audio/tts/manifest.json');
        if (resp.ok) {
          const data = (await resp.json()) as { languages?: string[] };
          if (Array.isArray(data?.languages)) {
            this.staticManifestLanguages = new Set(
              data.languages.map((l) => String(l).trim().toLowerCase()),
            );
          }
        }
      } catch {
        this.staticManifestLanguages = null;
      }
    }
    return !!this.staticManifestLanguages?.has((lang || 'en').trim().toLowerCase());
  }

  public async speakTTS(
    text: string,
    lang: string,
    options?: {
      isAi?: boolean;
      gender?: 'male' | 'female';
      seatIdx?: number;
      priority?: 'high' | 'normal';
      staticClipUrl?: string;
      onStart?: () => void;
      onEnd?: () => void;
    },
  ): Promise<void> {
    if (options?.isAi && this.aiVoiceMuted) return;
    if (this.sfxVolume <= 0.01 || !text.trim()) return;

    const priority = options?.priority ?? 'normal';
    if (options?.isAi && priority === 'normal' && this.routineAiPaused) {
      return;
    }
    if (priority === 'normal' && (this.isSpeaking || this.speechQueue.length > 0 || this.activeClipAudio || this.activeClipSource)) {
      return;
    }

    const clean = text
      .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{FE0F}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return;

    const seatIdx = options?.seatIdx ?? 0;
    const itemKey = `${seatIdx}:${clean}`;
    const lastQueued = this.speechQueue[this.speechQueue.length - 1];
    if (this.activeSpeechKey === itemKey || (lastQueued && `${lastQueued.seatIdx}:${lastQueued.clean}` === itemKey)) {
      return;
    }

    // Cap pending queue to 1 item so speech lines never pile up or play late over next turns
    if (this.speechQueue.length >= 1) {
      this.speechQueue.shift();
    }

    this.speechQueue.push({
      clean,
      lang: lang || 'en',
      isAi: !!options?.isAi,
      gender: options?.gender === 'female' ? 'female' : 'male',
      seatIdx,
      priority,
      staticClipUrl: options?.staticClipUrl,
      onStart: options?.onStart,
      onEnd: options?.onEnd,
    });

    if (!this.isSpeaking) {
      this.processNextSpeech();
    }
  }

  private processNextSpeech(): void {
    if (this.isSpeaking) return;
    while (this.speechQueue.length > 0) {
      const next = this.speechQueue.shift()!;
      if (next.isAi && this.aiVoiceMuted) continue;
      if (this.sfxVolume <= 0.01) continue;
      void this.playQueuedSpeech(next);
      return;
    }
  }

  private mapTtsLangCode(lang: string): string {
    const base = (lang || 'en').trim();
    if (base === 'zh') return 'zh-CN';
    if (base === 'fa') return 'ar';
    return base || 'en';
  }

  private async playQueuedSpeech(item: {
    clean: string;
    lang: string;
    isAi: boolean;
    gender: 'male' | 'female';
    seatIdx: number;
    priority: 'high' | 'normal';
    staticClipUrl?: string;
    onStart?: () => void;
    onEnd?: () => void;
  }): Promise<void> {
    const runId = ++this.speechRunId;
    this.clearActivePlaybackHardware();
    this.isSpeaking = true;
    this.activeTtsIsAi = item.isAi;
    this.activeTtsPriority = item.priority;
    this.activeSpeechKey = `${item.seatIdx}:${item.clean}`;

    let ended = false;
    let startedNotified = false;
    const notifyStart = () => {
      if (runId !== this.speechRunId || startedNotified) return;
      startedNotified = true;
      item.onStart?.();
    };

    const finish = () => {
      if (ended || runId !== this.speechRunId) return;
      ended = true;
      this.activeOnEnd = null;
      this.clearActivePlaybackHardware();
      item.onEnd?.();
      this.processNextSpeech();
    };

    this.activeOnEnd = () => {
      ended = true;
      item.onEnd?.();
    };

    // Safety cap so speaking state & queue never stall
    this.speechClearTimer = setTimeout(finish, 9500);

    const tryAudioUrl = async (url: string): Promise<boolean> => {
      if (ended || runId !== this.speechRunId) return false;
      return new Promise<boolean>((resolve) => {
        let settled = false;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          resolve(ok);
        };

        try {
          const audio = new Audio(url);
          audio.volume = this.getEffectiveTtsVolume(item.isAi);
          audio.playbackRate = 1;
          this.activeTtsAudio = audio;
          let audioStarted = false;
          audio.onplaying = () => {
            if (ended || runId !== this.speechRunId || this.activeTtsAudio !== audio) {
              try {
                audio.pause();
                audio.removeAttribute('src');
              } catch {}
              done(false);
              return;
            }
            audioStarted = true;
          };
          audio.onended = () => {
            done(true);
            finish();
          };
          audio.onerror = () => {
            if (this.activeTtsAudio === audio) this.activeTtsAudio = null;
            done(audioStarted);
            if (audioStarted) finish();
          };
          notifyStart();
          audio
            .play()
            .then(() => {
              if (ended || runId !== this.speechRunId || this.activeTtsAudio !== audio) {
                try {
                  audio.pause();
                  audio.removeAttribute('src');
                } catch {}
                done(false);
              }
            })
            .catch(() => {
              if (this.activeTtsAudio === audio) this.activeTtsAudio = null;
              done(false);
            });
        } catch {
          done(false);
        }
      });
    };

    // 1. Optional pre-generated offline static clip (zero external network dependency when present)
    if (item.staticClipUrl && (await this.hasStaticLanguagePack(item.lang))) {
      const staticOk = await tryAudioUrl(item.staticClipUrl);
      if (staticOk || ended || runId !== this.speechRunId) return;
    }

    // 2. Cached & rate-limited server /api/tts endpoint
    const proxyUrl = `/api/tts?text=${encodeURIComponent(item.clean)}&lang=${encodeURIComponent(item.lang)}`;
    const proxyOk = await tryAudioUrl(proxyUrl);
    if (proxyOk || ended || runId !== this.speechRunId) return;

    // 3. Browser window.speechSynthesis fallback (with strict utterance isolation)
    this.fallbackBrowserSpeech(item, runId, notifyStart, finish);
  }

  private fallbackBrowserSpeech(
    item: {
      clean: string;
      lang: string;
      isAi: boolean;
      gender: 'male' | 'female';
      seatIdx: number;
    },
    runId: number,
    notifyStart: () => void,
    finish: () => void,
  ): void {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
        const u = new SpeechSynthesisUtterance(item.clean);
        this.activeUtterance = u;
        u.lang = this.mapTtsLangCode(item.lang);
        u.volume = this.getEffectiveTtsVolume(item.isAi);
        u.pitch = item.gender === 'female' ? 1.12 : 0.96 + (item.seatIdx % 3) * 0.03;
        u.rate = 1.0;

        let synthStarted = false;
        let synthEnded = false;
        let fallbackTriggered = false;
        const triggerTalkBeepsFallback = () => {
          if (
            fallbackTriggered ||
            synthStarted ||
            synthEnded ||
            runId !== this.speechRunId ||
            this.activeUtterance !== u
          ) {
            return;
          }
          fallbackTriggered = true;
          this.activeUtterance = null;
          try {
            window.speechSynthesis.cancel();
          } catch {}
          this.playTalkBeeps(item, runId, notifyStart, finish);
        };

        u.onstart = () => {
          if (fallbackTriggered || runId !== this.speechRunId || this.activeUtterance !== u) {
            try {
              window.speechSynthesis.cancel();
            } catch {}
            return;
          }
          synthStarted = true;
          if (this.speechWatchdogTimer) {
            clearTimeout(this.speechWatchdogTimer);
            this.speechWatchdogTimer = null;
          }
          notifyStart();
        };
        u.onend = () => {
          synthEnded = true;
          if (this.speechWatchdogTimer) {
            clearTimeout(this.speechWatchdogTimer);
            this.speechWatchdogTimer = null;
          }
          if (this.activeUtterance === u) this.activeUtterance = null;
          if (!fallbackTriggered && runId === this.speechRunId) finish();
        };
        u.onerror = () => {
          if (this.speechWatchdogTimer) {
            clearTimeout(this.speechWatchdogTimer);
            this.speechWatchdogTimer = null;
          }
          if (this.activeUtterance !== u || runId !== this.speechRunId) return;
          if (!synthStarted) triggerTalkBeepsFallback();
          else finish();
        };

        // Generous watchdog so slow OS TTS voices never collide with Talk-Beeps
        this.speechWatchdogTimer = setTimeout(() => {
          this.speechWatchdogTimer = null;
          const synthBusy =
            typeof window !== 'undefined' &&
            'speechSynthesis' in window &&
            (window.speechSynthesis.speaking || window.speechSynthesis.pending);
          if (!synthStarted && !synthEnded && !synthBusy && runId === this.speechRunId && this.activeUtterance === u) {
            triggerTalkBeepsFallback();
          }
        }, 2200);

        notifyStart();
        window.speechSynthesis.speak(u);
        return;
      }
    } catch {}
    this.playTalkBeeps(item, runId, notifyStart, finish);
  }

  private playTalkBeeps(
    item: {
      clean: string;
      isAi: boolean;
      gender: 'male' | 'female';
      seatIdx: number;
    },
    runId: number,
    notifyStart: () => void,
    finish: () => void,
  ): void {
    if (runId !== this.speechRunId) return;
    notifyStart();

    const ctx = this.ensureContext();
    const vol = this.getEffectiveTtsVolume(item.isAi);
    if (!ctx || vol <= 0.01) {
      this.talkBleepTimer = setTimeout(finish, 600);
      return;
    }

    const words = item.clean.split(/\s+/).filter(Boolean).length;
    const syllables = Math.max(3, Math.min(7, words + 1));
    const baseFreq =
      item.gender === 'female'
        ? 355 + (item.seatIdx % 5) * 24
        : 175 + (item.seatIdx % 5) * 16;
    const stepSec = 0.115;
    const noteDurSec = 0.085;
    const t0 = ctx.currentTime + 0.02;

    for (let i = 0; i < syllables; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const inflection = 1 + (((i * 7 + item.seatIdx * 3) % 5) - 2) * 0.065;
      const start = t0 + i * stepSec;

      osc.type = item.gender === 'female' ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(baseFreq * inflection, start);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * inflection * 1.04, start + noteDurSec);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.min(0.24, vol * 0.22), start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + noteDurSec);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + noteDurSec + 0.01);
      this.activeBleepOscs.push(osc);
    }

    const totalMs = Math.ceil(syllables * stepSec * 1000) + 120;
    this.talkBleepTimer = setTimeout(finish, totalMs);
  }
}

export const sfx = new SfxManager();
