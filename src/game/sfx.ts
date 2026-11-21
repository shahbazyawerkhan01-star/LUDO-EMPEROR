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
  bgm_downtempo: '/audio/bgm-downtempo.mp3',
  bgm_guitar_v9: '/audio/bgm-guitar-v9.mp3',
  bgm_guitar_v5: '/audio/bgm-guitar-v5.mp3',
  bgm_rap: '/audio/bgm-rap.mp3',
  bgm_afro: '/audio/bgm-afro-reggaeton.mp3',
  bgm_latin: '/audio/bgm-latin.mp3',
  bgm_nature: '/audio/bgm-nature.mp3',
};

export const MUSIC_TRACKS: MusicTrackOption[] = [
  { id: 'none', label: 'None' },
  { id: 'bgm_guitar_v9', label: 'Relaxing Guitar I', url: STATIC_AUDIO_FILES.bgm_guitar_v9 },
  { id: 'bgm_guitar_v5', label: 'Relaxing Guitar II', url: STATIC_AUDIO_FILES.bgm_guitar_v5 },
  { id: 'bgm_downtempo', label: 'Downtempo Chill', url: STATIC_AUDIO_FILES.bgm_downtempo },
  { id: 'bgm_afro', label: 'Afro Reggaeton', url: STATIC_AUDIO_FILES.bgm_afro },
  { id: 'bgm_rap', label: 'Rap Beat', url: STATIC_AUDIO_FILES.bgm_rap },
  { id: 'bgm_latin', label: 'Latin Percussion', url: STATIC_AUDIO_FILES.bgm_latin },
  { id: 'bgm_nature', label: 'Nature Ambience', url: STATIC_AUDIO_FILES.bgm_nature },
  { id: 'heartbeat', label: 'Heartbeat Tension', url: STATIC_AUDIO_FILES.heartbeat },
  { id: 'custom', label: 'Custom (Device Library)' },
];

class SfxManager {
  private audioCtx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmGain: GainNode | null = null;
  private activeMusicId = 'none';
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
  private activeTtsIsAi = false;
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

  public setVolumes(sfxVolume: number, musicVolume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, sfxVolume));
    this.musicVolume = Math.max(0, Math.min(1, musicVolume));
    if (this.bgmGain && this.audioCtx) {
      this.bgmGain.gain.setTargetAtTime(this.musicVolume, this.audioCtx.currentTime, 0.05);
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

  private playCaptureImpact(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Punchy low impact + sharp descending strike so capture is unmistakable immediately at t=0
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(240, now);
    osc1.frequency.exponentialRampToValueAtTime(52, now + 0.28);
    gain1.gain.setValueAtTime(Math.min(0.45, this.sfxVolume * 0.42), now);
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
    gain2.gain.linearRampToValueAtTime(Math.min(0.32, this.sfxVolume * 0.3), now + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.03);
    osc2.stop(now + 0.28);
  }

  public play(id: keyof typeof STATIC_AUDIO_FILES | 'lucky7' | 'win' | 'capture', volScale = 1): void {
    const now = Date.now();
    const prev = this.lastPlayed.get(id) || 0;
    const minGap = id === 'move' ? 180 : id === 'notification' ? 300 : id === 'heartbeat' ? 1800 : 80;
    if (now - prev < minGap) return;
    this.lastPlayed.set(id, now);

    if (this.sfxVolume <= 0.001) return;

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
      this.playCaptureImpact();
      const whooshBuf = this.buffers.get('whoosh');
      if (whooshBuf) {
        // Skip the 0.48s silent lead-in inside whoosh.mp3
        this.playDecodedClip('whoosh', whooshBuf, 0.9, { offsetSec: 0.48, maxDurSec: 1.15, fadeOutSec: 0.25 });
      } else {
        void this.loadClip('whoosh', STATIC_AUDIO_FILES.whoosh).then((buf) => {
          if (buf) this.playDecodedClip('whoosh', buf, 0.9, { offsetSec: 0.48, maxDurSec: 1.15, fadeOutSec: 0.25 });
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
      this.playDecodedClip(id, existing, volScale, clipOpts);
    } else if (url) {
      void this.loadClip(id, url).then((buf) => {
        if (buf) {
          this.playDecodedClip(id, buf, volScale, clipOpts);
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

  public async playMusic(trackId: string): Promise<void> {
    this.activeMusicId = trackId;
    this.stopMusic();
    if (!trackId || trackId === 'none') return;

    const ctx = this.ensureContext();
    if (!ctx) return;

    let buf = this.buffers.get(trackId) || null;
    if (!buf) {
      const track = MUSIC_TRACKS.find((t) => t.id === trackId);
      if (track?.url) {
        buf = await this.loadClip(trackId, track.url);
      }
    }
    if (!buf || this.activeMusicId !== trackId) return;

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = this.musicVolume;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);

    this.bgmSource = source;
    this.bgmGain = gain;
  }

  public stopMusic(): void {
    if (this.bgmSource) {
      try {
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
