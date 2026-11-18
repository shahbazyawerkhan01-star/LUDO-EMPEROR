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
  private lastPlayed = new Map<string, number>();
  private activeTtsAudio: HTMLAudioElement | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        this.audioCtx = new Ctx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public setVolumes(sfxVolume: number, musicVolume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, sfxVolume));
    this.musicVolume = Math.max(0, Math.min(1, musicVolume));
    if (this.bgmGain && this.audioCtx) {
      this.bgmGain.gain.setTargetAtTime(this.musicVolume, this.audioCtx.currentTime, 0.05);
    }
    if (this.sfxVolume <= 0.01) {
      this.stopSpeech();
    }
  }

  public setAiVoiceMuted(muted: boolean): void {
    this.aiVoiceMuted = muted;
    if (muted) {
      this.stopSpeech();
    }
  }

  public isVoiceBusy(): boolean {
    return this.isSpeaking;
  }

  public stopSpeech(): void {
    if (this.speechClearTimer) {
      clearTimeout(this.speechClearTimer);
      this.speechClearTimer = null;
    }
    if (this.activeTtsAudio) {
      try {
        this.activeTtsAudio.onended = null;
        this.activeTtsAudio.onerror = null;
        this.activeTtsAudio.pause();
        this.activeTtsAudio.currentTime = 0;
      } catch {}
      this.activeTtsAudio = null;
    }
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {}
    this.isSpeaking = false;
  }

  public async preloadCore(): Promise<void> {
    await Promise.all([
      this.loadClip('dice', STATIC_AUDIO_FILES.dice),
      this.loadClip('move', STATIC_AUDIO_FILES.move),
      this.loadClip('click', STATIC_AUDIO_FILES.click),
      this.loadClip('whoosh', STATIC_AUDIO_FILES.whoosh),
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

  public play(id: keyof typeof STATIC_AUDIO_FILES | 'lucky7' | 'win' | 'capture', volScale = 1): void {
    const now = Date.now();
    const prev = this.lastPlayed.get(id) || 0;
    if (now - prev < 50) return;
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
      this.play('whoosh', 0.8);
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx) return;

    const url = STATIC_AUDIO_FILES[id];
    const existing = this.buffers.get(id);
    if (existing) {
      const source = ctx.createBufferSource();
      source.buffer = existing;
      const gain = ctx.createGain();
      gain.gain.value = Math.min(1, this.sfxVolume * volScale);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
    } else if (url) {
      this.loadClip(id, url).then((buf) => {
        if (buf && this.audioCtx) {
          const source = this.audioCtx.createBufferSource();
          source.buffer = buf;
          const gain = this.audioCtx.createGain();
          gain.gain.value = Math.min(1, this.sfxVolume * volScale);
          source.connect(gain);
          gain.connect(this.audioCtx.destination);
          source.start(0);
        }
      });
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

  public async speakTTS(
    text: string,
    lang: string,
    options?: {
      isAi?: boolean;
      gender?: 'male' | 'female';
      seatIdx?: number;
      priority?: 'high' | 'normal';
      onStart?: () => void;
      onEnd?: () => void;
    },
  ): Promise<void> {
    if (options?.isAi && this.aiVoiceMuted) return;
    if (this.sfxVolume <= 0.01 || !text.trim()) return;
    if (this.isSpeaking && options?.priority !== 'high') return;

    const clean = text
      .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{FE0F}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return;

    this.stopSpeech();
    this.isSpeaking = true;

    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      if (this.speechClearTimer) {
        clearTimeout(this.speechClearTimer);
        this.speechClearTimer = null;
      }
      this.isSpeaking = false;
      this.activeTtsAudio = null;
      options?.onEnd?.();
    };

    // Safety cap so speaking flag never gets stuck
    this.speechClearTimer = setTimeout(finish, 9000);

    try {
      const url = `/api/tts?text=${encodeURIComponent(clean)}&lang=${encodeURIComponent(lang || 'en')}`;
      const audio = new Audio(url);
      audio.volume = Math.min(1, this.sfxVolume);
      const seatOffset = ((options?.seatIdx ?? 0) % 5) * 0.025;
      audio.playbackRate = options?.gender === 'female' ? 1.04 + seatOffset * 0.5 : 0.94 + seatOffset;
      this.activeTtsAudio = audio;
      audio.onended = finish;
      audio.onerror = () => {
        if (!ended) this.fallbackBrowserSpeech(clean, lang, options, finish);
      };
      options?.onStart?.();
      await audio.play();
    } catch {
      if (!ended) {
        this.fallbackBrowserSpeech(clean, lang, options, finish);
      }
    }
  }

  private fallbackBrowserSpeech(
    clean: string,
    lang: string,
    options:
      | {
          gender?: 'male' | 'female';
          seatIdx?: number;
          onStart?: () => void;
          onEnd?: () => void;
        }
      | undefined,
    finish: () => void,
  ): void {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = lang || 'en';
        u.volume = Math.min(1, this.sfxVolume);
        u.pitch = options?.gender === 'female' ? 1.18 : 0.9 + ((options?.seatIdx ?? 0) % 3) * 0.05;
        u.rate = 1.02;
        u.onend = finish;
        u.onerror = finish;
        options?.onStart?.();
        window.speechSynthesis.speak(u);
        return;
      }
    } catch {}
    finish();
  }
}

export const sfx = new SfxManager();
