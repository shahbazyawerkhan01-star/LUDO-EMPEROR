import { sfx } from '../game/sfx';
import { useGameStore, type VoiceCallParticipant } from '../state/store';

export interface VoiceSignalingTransport {
  getSocketId: () => string | null;
  getToken: () => string | null;
  emit: (event: string, payload: Record<string, unknown>, ack?: (res: any) => void) => boolean;
}

interface RemotePeer {
  socketId: string;
  seatIndex: number;
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement | null;
  remoteStream: MediaStream | null;
  analyserSource: MediaStreamAudioSourceNode | null;
  analyser: AnalyserNode | null;
  analyserData: Uint8Array<ArrayBuffer> | null;
  pendingCandidates: RTCIceCandidateInit[];
  makingOffer: boolean;
  iceRestartCount: number;
  iceRestartTimer: ReturnType<typeof setTimeout> | null;
  lastActiveSpeakAt: number;
}

const VAD_SAMPLE_MS = 85;
const VAD_RMS_THRESHOLD = 0.026;
const SPEAK_HOLD_MS = 300;
const TTS_DUCK_HOLD_MS = 650;
const MAX_ICE_RESTARTS = 3;

export function getVoiceIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const rawTurnUrl = env?.VITE_TURN_URL?.trim();
  const turnUsername = env?.VITE_TURN_USERNAME?.trim();
  const turnCredential = env?.VITE_TURN_CREDENTIAL?.trim();

  if (rawTurnUrl) {
    const urls = rawTurnUrl
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (urls.length > 0) {
      const turnServer: RTCIceServer = {
        urls: urls.length === 1 ? urls[0] : urls,
      };
      if (turnUsername) turnServer.username = turnUsername;
      if (turnCredential) turnServer.credential = turnCredential;
      servers.push(turnServer);
    }
  }

  return servers;
}

function computeRms(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sumSq = 0;
  for (let i = 0; i < buf.length; i++) {
    const normalized = (buf[i] - 128) / 128;
    sumSq += normalized * normalized;
  }
  return Math.sqrt(sumSq / buf.length);
}

class VoiceCallManager {
  private transport: VoiceSignalingTransport | null = null;
  private joined = false;
  private connecting = false;
  private localMuted = false;
  private voiceNoteSuspended = false;

  private localStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private localAnalyserSource: MediaStreamAudioSourceNode | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localAnalyserData: Uint8Array<ArrayBuffer> | null = null;
  private localLastSpeakAt = 0;
  private anyHumanLastSpeakAt = 0;

  private peers = new Map<string, RemotePeer>();
  private participants = new Map<string, VoiceCallParticipant>();
  private vadTimer: ReturnType<typeof setInterval> | null = null;
  private micTestTimer: ReturnType<typeof setInterval> | null = null;
  private micTestStream: MediaStream | null = null;
  private micTestSource: MediaStreamAudioSourceNode | null = null;
  private micTestAnalyser: AnalyserNode | null = null;
  private micTestData: Uint8Array<ArrayBuffer> | null = null;
  private micTestActive = false;
  private lastReportedMicLevel = -1;
  private lastPeerStatusKey = '';
  private audioRootEl: HTMLDivElement | null = null;
  private lastSpeakingKey = '';
  private storeSubscribed = false;

  constructor() {
    if (typeof window !== 'undefined') {
      queueMicrotask(() => this.ensureStoreSubscribed());
      window.addEventListener('beforeunload', () => {
        if (this.joined || this.connecting) {
          this.leaveCall({ notifyServer: true, silent: true });
        }
      });
    }
  }

  private ensureStoreSubscribed(): void {
    if (this.storeSubscribed || typeof window === 'undefined') return;
    this.storeSubscribed = true;
    useGameStore.subscribe((state, prevState) => {
      if (
        state.prefs.mutedSeats !== prevState.prefs.mutedSeats ||
        state.voiceSeatVolumes !== prevState.voiceSeatVolumes
      ) {
        this.applyAllRemoteAudioControls();
      }
      if (
        (this.joined || this.connecting) &&
        (!state.isOnline || !state.roomCode || state.matchOver)
      ) {
        this.leaveCall({ notifyServer: false, silent: true });
      }
    });
  }

  public attachTransport(transport: VoiceSignalingTransport): void {
    this.ensureStoreSubscribed();
    this.transport = transport;
  }

  public isJoined(): boolean {
    return this.joined;
  }

  public isMuted(): boolean {
    return this.localMuted;
  }

  public async startMicTest(): Promise<boolean> {
    if (this.joined || this.connecting || this.micTestActive) return this.micTestActive;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      useGameStore.getState().showToast('Microphone test is not supported in this browser.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      if (this.joined || this.connecting) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }

      const ctx = this.ensureAudioContext();
      if (!ctx) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }

      this.micTestStream = stream;
      this.micTestSource = ctx.createMediaStreamSource(stream);
      this.micTestAnalyser = ctx.createAnalyser();
      this.micTestAnalyser.fftSize = 256;
      this.micTestAnalyser.smoothingTimeConstant = 0.6;
      this.micTestSource.connect(this.micTestAnalyser);
      this.micTestData = new Uint8Array(new ArrayBuffer(this.micTestAnalyser.fftSize));
      this.micTestActive = true;
      this.lastReportedMicLevel = -1;

      useGameStore.getState().setVoiceCallState({ voiceMicTestActive: true, voiceMicLevel: 0 });
      this.micTestTimer = setInterval(() => {
        if (!this.micTestActive || !this.micTestAnalyser || !this.micTestData) return;
        const rms = computeRms(this.micTestAnalyser, this.micTestData);
        const level = Math.min(100, Math.round((rms / 0.14) * 100));
        this.reportMicLevel(level);
      }, VAD_SAMPLE_MS);

      return true;
    } catch (err) {
      this.stopMicTest();
      const errName = (err as { name?: string })?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        useGameStore.getState().showToast('Microphone permission denied.');
      } else {
        useGameStore.getState().showToast('Could not access microphone for test.');
      }
      return false;
    }
  }

  public stopMicTest(): void {
    const wasActive = this.micTestActive;
    this.micTestActive = false;
    if (this.micTestTimer) {
      clearInterval(this.micTestTimer);
      this.micTestTimer = null;
    }
    try {
      this.micTestSource?.disconnect();
      this.micTestAnalyser?.disconnect();
    } catch {}
    this.micTestSource = null;
    this.micTestAnalyser = null;
    this.micTestData = null;

    if (this.micTestStream) {
      for (const track of this.micTestStream.getTracks()) {
        try {
          track.stop();
        } catch {}
      }
      this.micTestStream = null;
    }

    if (wasActive && !this.joined) {
      this.lastReportedMicLevel = -1;
      useGameStore.getState().setVoiceCallState({ voiceMicTestActive: false, voiceMicLevel: 0 });
    }
  }

  private reportMicLevel(level: number): void {
    const clamped = Math.max(0, Math.min(100, level));
    if (
      this.lastReportedMicLevel === clamped ||
      (clamped > 0 && Math.abs(this.lastReportedMicLevel - clamped) < 4)
    ) {
      return;
    }
    this.lastReportedMicLevel = clamped;
    useGameStore.getState().setVoiceCallState({ voiceMicLevel: clamped });
  }

  private syncPeerStatuses(): void {
    const map: Record<number, string> = {};
    for (const peer of this.peers.values()) {
      map[peer.seatIndex] = peer.pc.iceConnectionState || 'new';
    }
    const key = Object.entries(map)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([seat, st]) => `${seat}:${st}`)
      .join('|');
    if (key === this.lastPeerStatusKey) return;
    this.lastPeerStatusKey = key;
    useGameStore.getState().setVoicePeerStatuses(map);
  }

  private getAudioRoot(): HTMLDivElement | null {
    if (typeof document === 'undefined') return null;
    if (this.audioRootEl && document.body.contains(this.audioRootEl)) {
      return this.audioRootEl;
    }
    const existing = document.getElementById('ludo-webrtc-audio-root') as HTMLDivElement | null;
    if (existing) {
      this.audioRootEl = existing;
      return existing;
    }
    const div = document.createElement('div');
    div.id = 'ludo-webrtc-audio-root';
    div.style.display = 'none';
    document.body.appendChild(div);
    this.audioRootEl = div;
    return div;
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        this.audioCtx = new Ctx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  private applyEffectiveLocalTrackState(): void {
    if (!this.localStream) return;
    const shouldEnable = !this.localMuted && !this.voiceNoteSuspended;
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = shouldEnable;
    }
  }

  private isPolite(remoteSocketId: string): boolean {
    const myId = this.transport?.getSocketId() || '';
    return myId < remoteSocketId;
  }

  public async joinCall(): Promise<boolean> {
    const st = useGameStore.getState();
    if (!st.isOnline || !st.roomCode || st.matchOver) {
      st.showToast('Live Voice Chat is available in Online Multiplayer rooms.');
      return false;
    }
    if (this.joined || this.connecting) return true;
    if (!this.transport || !this.transport.getSocketId()) {
      st.showToast('Waiting for online room connection...');
      return false;
    }
    if (typeof RTCPeerConnection === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      st.showToast('Live voice call is not supported in this browser.');
      return false;
    }

    this.stopMicTest();
    this.connecting = true;
    st.setVoiceCallState({ voiceCallConnecting: true, voiceMicTestActive: false });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // Guard if user left room or match ended while waiting for mic prompt
      const latest = useGameStore.getState();
      if (!latest.isOnline || !latest.roomCode || latest.matchOver) {
        stream.getTracks().forEach((t) => t.stop());
        this.connecting = false;
        latest.setVoiceCallState({ voiceCallConnecting: false, voiceCallJoined: false });
        return false;
      }

      this.localStream = stream;
      this.localMuted = false;
      this.voiceNoteSuspended = false;
      this.applyEffectiveLocalTrackState();

      const ctx = this.ensureAudioContext();
      if (ctx) {
        this.localAnalyserSource = ctx.createMediaStreamSource(stream);
        this.localAnalyser = ctx.createAnalyser();
        this.localAnalyser.fftSize = 256;
        this.localAnalyser.smoothingTimeConstant = 0.65;
        this.localAnalyserSource.connect(this.localAnalyser);
        this.localAnalyserData = new Uint8Array(new ArrayBuffer(this.localAnalyser.fftSize));
      }

      const joinOk = await new Promise<{ success?: boolean; error?: string; participants?: VoiceCallParticipant[] }>(
        (resolve) => {
          const sent = this.transport?.emit(
            'voice:join',
            { token: this.transport.getToken(), isMuted: this.localMuted },
            (res: any) => resolve(res || { success: false }),
          );
          if (!sent) resolve({ success: false, error: 'Socket disconnected' });
        },
      );

      if (!joinOk?.success) {
        this.teardownMediaAndPeers();
        this.connecting = false;
        useGameStore.getState().setVoiceCallState({
          voiceCallConnecting: false,
          voiceCallJoined: false,
        });
        useGameStore.getState().showToast(joinOk?.error || 'Could not join live voice call.');
        return false;
      }

      this.joined = true;
      this.connecting = false;
      useGameStore.getState().setVoiceCallState({
        voiceCallJoined: true,
        voiceCallConnecting: false,
        voiceCallMuted: this.localMuted,
      });
      this.startVadLoop();

      if (Array.isArray(joinOk.participants)) {
        this.handleParticipantsUpdate(joinOk.participants);
      }

      useGameStore.getState().showToast('🎙️ Live Voice Call joined — Open Mic active');
      return true;
    } catch (err) {
      this.teardownMediaAndPeers();
      this.connecting = false;
      useGameStore.getState().setVoiceCallState({
        voiceCallConnecting: false,
        voiceCallJoined: false,
        voiceCallMuted: false,
      });
      const errName = (err as { name?: string })?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        useGameStore
          .getState()
          .showToast('Microphone permission denied — game & text chat remain active.');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        useGameStore.getState().showToast('No microphone detected on this device.');
      } else {
        useGameStore.getState().showToast('Could not access microphone for live call.');
      }
      return false;
    }
  }

  public leaveCall(options?: { notifyServer?: boolean; silent?: boolean }): void {
    const wasJoined = this.joined || this.connecting;
    const notifyServer = options?.notifyServer ?? true;

    this.joined = false;
    this.connecting = false;
    this.localMuted = false;
    this.voiceNoteSuspended = false;

    if (notifyServer && this.transport) {
      this.transport.emit('voice:leave', { token: this.transport.getToken() });
    }

    this.stopMicTest();
    this.teardownMediaAndPeers();

    useGameStore.getState().setVoiceCallState({
      voiceCallJoined: false,
      voiceCallConnecting: false,
      voiceCallMuted: false,
      voiceMicLevel: 0,
      voiceMicTestActive: false,
    });
    useGameStore.getState().setVoiceSpeakingSeats([]);
    useGameStore.getState().setVoicePeerStatuses({});
    this.lastSpeakingKey = '';
    this.lastPeerStatusKey = '';
    this.lastReportedMicLevel = -1;
    sfx.setLiveVoiceActive(false);

    if (wasJoined && !options?.silent) {
      useGameStore.getState().showToast('📞 Left Live Voice Call');
    }
  }

  public toggleLocalMute(): boolean {
    if (!this.joined) return false;
    this.localMuted = !this.localMuted;
    this.applyEffectiveLocalTrackState();
    useGameStore.getState().setVoiceCallState({ voiceCallMuted: this.localMuted });
    const mySeat = useGameStore.getState().mySeat;
    this.transport?.emit('voice:mute-state', {
      token: this.transport.getToken(),
      seat: mySeat,
      isMuted: this.localMuted || this.voiceNoteSuspended,
    });
    useGameStore
      .getState()
      .showToast(this.localMuted ? '🔇 Mic Muted' : '🎙️ Mic Live');
    return this.localMuted;
  }

  public suspendMicForVoiceNote(): void {
    if (!this.joined || this.voiceNoteSuspended) return;
    this.voiceNoteSuspended = true;
    this.applyEffectiveLocalTrackState();
    const mySeat = useGameStore.getState().mySeat;
    this.transport?.emit('voice:mute-state', {
      token: this.transport.getToken(),
      seat: mySeat,
      isMuted: true,
    });
  }

  public resumeMicAfterVoiceNote(): void {
    if (!this.voiceNoteSuspended) return;
    this.voiceNoteSuspended = false;
    if (!this.joined) return;
    this.applyEffectiveLocalTrackState();
    const mySeat = useGameStore.getState().mySeat;
    this.transport?.emit('voice:mute-state', {
      token: this.transport.getToken(),
      seat: mySeat,
      isMuted: this.localMuted,
    });
  }

  public handleSocketReconnected(): void {
    if (!this.joined || !this.transport) return;
    // Close stale peer connections from previous socket session and re-announce join
    for (const socketId of Array.from(this.peers.keys())) {
      this.closePeer(socketId);
    }
    this.transport.emit(
      'voice:join',
      {
        token: this.transport.getToken(),
        isMuted: this.localMuted || this.voiceNoteSuspended,
      },
      (res: { success?: boolean; participants?: VoiceCallParticipant[] }) => {
        if (res?.success && Array.isArray(res.participants)) {
          this.handleParticipantsUpdate(res.participants);
        }
      },
    );
  }

  public handleParticipantsUpdate(list: VoiceCallParticipant[]): void {
    const safeList = Array.isArray(list) ? list : [];
    this.participants.clear();
    for (const p of safeList) {
      this.participants.set(p.socketId, p);
    }
    useGameStore.getState().setVoiceCallParticipants(safeList);

    if (!this.joined || !this.localStream) return;
    const mySocketId = this.transport?.getSocketId();
    if (!mySocketId) return;

    const activeIds = new Set(safeList.map((p) => p.socketId));

    // Close peers who left the call
    for (const existingId of Array.from(this.peers.keys())) {
      if (!activeIds.has(existingId) || existingId === mySocketId) {
        this.closePeer(existingId);
      }
    }

    // Connect to any new human participants in full-mesh topology
    for (const p of safeList) {
      if (p.socketId === mySocketId) continue;
      const existing = this.peers.get(p.socketId);
      if (!existing) {
        const peer = this.createPeer(p.socketId, p.seatIndex);
        if (!this.isPolite(p.socketId)) {
          this.negotiateOffer(peer, false);
        }
      } else {
        existing.seatIndex = p.seatIndex;
        this.applyPeerAudioControls(existing);
      }
    }
  }

  public handleRemoteMuteState(payload: { socketId?: string; seat?: number; isMuted?: boolean }): void {
    if (!payload?.socketId) return;
    const existing = this.participants.get(payload.socketId);
    if (existing) {
      existing.isMuted = !!payload.isMuted;
      useGameStore.getState().setVoiceCallParticipants(
        Array.from(this.participants.values()).sort((a, b) => a.seatIndex - b.seatIndex),
      );
    }
  }

  public async handleOffer(payload: {
    fromSocketId: string;
    fromSeat: number;
    sdp: RTCSessionDescriptionInit;
  }): Promise<void> {
    if (!this.joined || !this.localStream || !payload?.fromSocketId || !payload?.sdp) return;
    let peer = this.peers.get(payload.fromSocketId);
    if (!peer) {
      peer = this.createPeer(payload.fromSocketId, payload.fromSeat);
    } else {
      peer.seatIndex = payload.fromSeat;
    }

    const polite = this.isPolite(payload.fromSocketId);
    const offerCollision = peer.makingOffer || peer.pc.signalingState !== 'stable';
    if (offerCollision && !polite) {
      return;
    }

    try {
      if (offerCollision && polite) {
        try {
          await peer.pc.setLocalDescription({ type: 'rollback' });
        } catch {}
      }
      await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      await this.flushPendingCandidates(peer);

      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      if (peer.pc.localDescription) {
        this.transport?.emit('voice:answer', {
          token: this.transport.getToken(),
          targetSocketId: payload.fromSocketId,
          sdp: peer.pc.localDescription,
        });
      }
    } catch {
      // Ignore transient negotiation races; ICE restart will recover if needed
    }
  }

  public async handleAnswer(payload: {
    fromSocketId: string;
    fromSeat: number;
    sdp: RTCSessionDescriptionInit;
  }): Promise<void> {
    if (!this.joined || !payload?.fromSocketId || !payload?.sdp) return;
    const peer = this.peers.get(payload.fromSocketId);
    if (!peer || peer.pc.signalingState !== 'have-local-offer') return;

    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      await this.flushPendingCandidates(peer);
    } catch {
      // Ignore stale answers
    }
  }

  public async handleIceCandidate(payload: {
    fromSocketId: string;
    candidate: RTCIceCandidateInit;
  }): Promise<void> {
    if (!this.joined || !payload?.fromSocketId || !payload?.candidate) return;
    const peer = this.peers.get(payload.fromSocketId);
    if (!peer) return;

    if (!peer.pc.remoteDescription) {
      peer.pendingCandidates.push(payload.candidate);
      return;
    }
    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
    } catch {
      // Ignore stale ICE candidates
    }
  }

  private async flushPendingCandidates(peer: RemotePeer): Promise<void> {
    if (!peer.pc.remoteDescription || peer.pendingCandidates.length === 0) return;
    const queued = peer.pendingCandidates.splice(0, peer.pendingCandidates.length);
    for (const candidate of queued) {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {}
    }
  }

  private createPeer(socketId: string, seatIndex: number): RemotePeer {
    const pc = new RTCPeerConnection({
      iceServers: getVoiceIceServers(),
      iceCandidatePoolSize: 4,
    });

    const peer: RemotePeer = {
      socketId,
      seatIndex,
      pc,
      audioEl: null,
      remoteStream: null,
      analyserSource: null,
      analyser: null,
      analyserData: null,
      pendingCandidates: [],
      makingOffer: false,
      iceRestartCount: 0,
      iceRestartTimer: null,
      lastActiveSpeakAt: 0,
    };

    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && this.joined) {
        this.transport?.emit('voice:ice', {
          token: this.transport.getToken(),
          targetSocketId: socketId,
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams?.[0] || new MediaStream([event.track]);
      this.attachRemoteStream(peer, stream);
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        peer.iceRestartCount = 0;
        if (peer.iceRestartTimer) {
          clearTimeout(peer.iceRestartTimer);
          peer.iceRestartTimer = null;
        }
      } else if (state === 'failed') {
        this.scheduleIceRestart(peer, 450);
      } else if (state === 'disconnected') {
        this.scheduleIceRestart(peer, 2600);
      }
      this.syncPeerStatuses();
    };

    this.peers.set(socketId, peer);
    this.syncPeerStatuses();
    return peer;
  }

  private async negotiateOffer(peer: RemotePeer, iceRestart: boolean): Promise<void> {
    if (!this.joined || peer.makingOffer) return;
    if (peer.pc.signalingState === 'closed') return;
    try {
      peer.makingOffer = true;
      if (iceRestart && typeof peer.pc.restartIce === 'function') {
        peer.pc.restartIce();
      }
      const offer = await peer.pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      if (peer.pc.signalingState !== 'stable' && !iceRestart) return;
      await peer.pc.setLocalDescription(offer);
      if (peer.pc.localDescription) {
        this.transport?.emit('voice:offer', {
          token: this.transport.getToken(),
          targetSocketId: peer.socketId,
          sdp: peer.pc.localDescription,
        });
      }
    } catch {
      // Handled by subsequent ICE recovery
    } finally {
      peer.makingOffer = false;
    }
  }

  private scheduleIceRestart(peer: RemotePeer, delayMs: number): void {
    if (!this.joined || peer.iceRestartCount >= MAX_ICE_RESTARTS) return;
    if (peer.iceRestartTimer) return;
    peer.iceRestartTimer = setTimeout(() => {
      peer.iceRestartTimer = null;
      if (!this.joined || this.peers.get(peer.socketId) !== peer) return;
      const state = peer.pc.iceConnectionState;
      if (state !== 'disconnected' && state !== 'failed') return;
      peer.iceRestartCount++;
      this.negotiateOffer(peer, true);
    }, delayMs);
  }

  private attachRemoteStream(peer: RemotePeer, stream: MediaStream): void {
    peer.remoteStream = stream;

    if (typeof document !== 'undefined') {
      if (!peer.audioEl) {
        const audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        audioEl.setAttribute('playsinline', 'true');
        const root = this.getAudioRoot();
        root?.appendChild(audioEl);
        peer.audioEl = audioEl;
      }
      peer.audioEl.srcObject = stream;
      this.applyPeerAudioControls(peer);
      peer.audioEl.play().catch(() => {});
    }

    // Attach remote VAD analyser without double-routing to destination
    const ctx = this.ensureAudioContext();
    if (ctx) {
      try {
        if (peer.analyserSource) peer.analyserSource.disconnect();
      } catch {}
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.65;
        source.connect(analyser);
        peer.analyserSource = source;
        peer.analyser = analyser;
        peer.analyserData = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      } catch {}
    }
  }

  private applyPeerAudioControls(peer: RemotePeer): void {
    if (!peer.audioEl) return;
    const st = useGameStore.getState();
    const isMuted = st.prefs.mutedSeats.includes(peer.seatIndex);
    const vol = Math.max(0, Math.min(1, st.voiceSeatVolumes[peer.seatIndex] ?? 1));
    peer.audioEl.muted = isMuted;
    peer.audioEl.volume = vol;
  }

  private applyAllRemoteAudioControls(): void {
    for (const peer of this.peers.values()) {
      this.applyPeerAudioControls(peer);
    }
  }

  private closePeer(socketId: string): void {
    const peer = this.peers.get(socketId);
    if (!peer) return;
    this.peers.delete(socketId);

    if (peer.iceRestartTimer) {
      clearTimeout(peer.iceRestartTimer);
      peer.iceRestartTimer = null;
    }
    try {
      peer.analyserSource?.disconnect();
      peer.analyser?.disconnect();
    } catch {}
    peer.analyserSource = null;
    peer.analyser = null;
    peer.analyserData = null;

    if (peer.audioEl) {
      try {
        peer.audioEl.pause();
        peer.audioEl.srcObject = null;
        peer.audioEl.remove();
      } catch {}
      peer.audioEl = null;
    }
    peer.remoteStream = null;

    try {
      peer.pc.onicecandidate = null;
      peer.pc.ontrack = null;
      peer.pc.oniceconnectionstatechange = null;
      peer.pc.close();
    } catch {}
    this.syncPeerStatuses();
  }

  private startVadLoop(): void {
    if (this.vadTimer) clearInterval(this.vadTimer);
    this.vadTimer = setInterval(() => this.sampleVoiceActivity(), VAD_SAMPLE_MS);
  }

  private sampleVoiceActivity(): void {
    if (!this.joined) return;
    const now = Date.now();
    const st = useGameStore.getState();
    const speaking = new Set<number>();

    // Local mic VAD + real-time mic level meter
    if (
      typeof st.mySeat === 'number' &&
      !this.localMuted &&
      !this.voiceNoteSuspended &&
      this.localAnalyser &&
      this.localAnalyserData
    ) {
      const rms = computeRms(this.localAnalyser, this.localAnalyserData);
      this.reportMicLevel(Math.min(100, Math.round((rms / 0.14) * 100)));
      if (rms > VAD_RMS_THRESHOLD) {
        this.localLastSpeakAt = now;
        this.anyHumanLastSpeakAt = now;
      }
      if (now - this.localLastSpeakAt < SPEAK_HOLD_MS) {
        speaking.add(st.mySeat);
      }
    } else {
      this.reportMicLevel(0);
    }

    // Remote peers VAD
    for (const peer of this.peers.values()) {
      const participant = this.participants.get(peer.socketId);
      const isLocallyMuted = st.prefs.mutedSeats.includes(peer.seatIndex);
      const seatVol = st.voiceSeatVolumes[peer.seatIndex] ?? 1;
      if (isLocallyMuted || seatVol <= 0.01 || participant?.isMuted) {
        continue;
      }
      if (peer.analyser && peer.analyserData) {
        const rms = computeRms(peer.analyser, peer.analyserData);
        if (rms > VAD_RMS_THRESHOLD) {
          peer.lastActiveSpeakAt = now;
          this.anyHumanLastSpeakAt = now;
        }
        if (now - peer.lastActiveSpeakAt < SPEAK_HOLD_MS) {
          speaking.add(peer.seatIndex);
        }
      }
    }

    const sorted = Array.from(speaking).sort((a, b) => a - b);
    const key = sorted.join(',');
    if (key !== this.lastSpeakingKey) {
      this.lastSpeakingKey = key;
      st.setVoiceSpeakingSeats(sorted);
    }

    // Smart AI TTS ducking (25% volume while humans actively talk)
    const shouldDuckAi = sorted.length > 0 || now - this.anyHumanLastSpeakAt < TTS_DUCK_HOLD_MS;
    sfx.setLiveVoiceActive(shouldDuckAi);
  }

  private teardownMediaAndPeers(): void {
    if (this.vadTimer) {
      clearInterval(this.vadTimer);
      this.vadTimer = null;
    }

    for (const socketId of Array.from(this.peers.keys())) {
      this.closePeer(socketId);
    }
    this.peers.clear();

    try {
      this.localAnalyserSource?.disconnect();
      this.localAnalyser?.disconnect();
    } catch {}
    this.localAnalyserSource = null;
    this.localAnalyser = null;
    this.localAnalyserData = null;

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        try {
          track.stop();
        } catch {}
      }
      this.localStream = null;
    }

    if (this.audioCtx) {
      try {
        this.audioCtx.close().catch(() => {});
      } catch {}
      this.audioCtx = null;
    }

    if (this.audioRootEl) {
      try {
        this.audioRootEl.remove();
      } catch {}
      this.audioRootEl = null;
    }

    this.localLastSpeakAt = 0;
    this.anyHumanLastSpeakAt = 0;
  }
}

export const voiceCallManager = new VoiceCallManager();
