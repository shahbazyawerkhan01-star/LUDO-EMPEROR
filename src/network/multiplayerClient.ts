import { io, type Socket } from 'socket.io-client';
import { type BanterEvent } from '../game/banter';
import { sfx } from '../game/sfx';
import { runSdk } from '../sdk/runSdk';
import { useGameStore, type RoomSeatPublic, type VoiceCallParticipant } from '../state/store';
import type { RankingEntry } from '../game/rules';
import { binaryPayloadToAudioUrl } from './audioCapture';
import { voiceCallManager } from './voiceCallManager';

const STORAGE_ROOM_KEY = 'ludo_room_code';
const STORAGE_TOKEN_KEY = 'ludo_player_token';
const STORAGE_SEAT_KEY = 'ludo_seat_index';

function saveSessionCreds(roomCode: string, token: string, seatIdx: number): void {
  try {
    sessionStorage.setItem(STORAGE_ROOM_KEY, roomCode);
    sessionStorage.setItem(STORAGE_TOKEN_KEY, token);
    sessionStorage.setItem(STORAGE_SEAT_KEY, String(seatIdx));
    localStorage.removeItem(STORAGE_ROOM_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_SEAT_KEY);
  } catch {}
}

function clearSessionCreds(): void {
  try {
    localStorage.removeItem(STORAGE_ROOM_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_SEAT_KEY);
    sessionStorage.removeItem(STORAGE_ROOM_KEY);
    sessionStorage.removeItem(STORAGE_TOKEN_KEY);
    sessionStorage.removeItem(STORAGE_SEAT_KEY);
  } catch {}
}

function makeClientActionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

class MultiplayerClient {
  private socket: Socket | null = null;
  private token: string | null = null;
  private manualSessionPending = false;
  private didTryAutoReconnect = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.token = sessionStorage.getItem(STORAGE_TOKEN_KEY);
        localStorage.removeItem(STORAGE_ROOM_KEY);
        localStorage.removeItem(STORAGE_TOKEN_KEY);
        localStorage.removeItem(STORAGE_SEAT_KEY);
      } catch {
        this.token = null;
      }
    }
  }

  public tryAutoReconnect(): void {
    if (typeof window === 'undefined' || this.didTryAutoReconnect) return;
    this.didTryAutoReconnect = true;
    try {
      const code = sessionStorage.getItem(STORAGE_ROOM_KEY);
      const tok = sessionStorage.getItem(STORAGE_TOKEN_KEY);
      const seat = sessionStorage.getItem(STORAGE_SEAT_KEY);
      if (code && tok && seat !== null) {
        this.ensureSocket();
      }
    } catch {}
  }

  private ensureSocket(): Socket {
    if (this.socket) return this.socket;

    const sock = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 25,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    voiceCallManager.attachTransport({
      getSocketId: () => this.socket?.id || null,
      getToken: () => this.token,
      emit: (event, payload, ack) => {
        if (!this.socket || !this.socket.connected) return false;
        if (ack) this.socket.emit(event, payload, ack);
        else this.socket.emit(event, payload);
        return true;
      },
    });

    sock.on('connect', () => {
      if (this.manualSessionPending || useGameStore.getState().roomCode) return;
      let code: string | null = null;
      let tok: string | null = null;
      let seat: string | null = null;
      try {
        code = sessionStorage.getItem(STORAGE_ROOM_KEY);
        tok = sessionStorage.getItem(STORAGE_TOKEN_KEY);
        seat = sessionStorage.getItem(STORAGE_SEAT_KEY);
      } catch {}

      if (code && tok && seat !== null) {
        sock.emit(
          'ludo:reconnect',
          { roomCode: code, seatIndex: Number(seat), playerToken: tok },
          (res: { success?: boolean; roomCode?: string; seatIndex?: number; roomState?: any }) => {
            if (res?.success && res.roomCode && res.roomState) {
              this.token = tok;
              saveSessionCreds(res.roomCode, tok!, res.seatIndex ?? Number(seat));
              useGameStore.getState().setRoomJoined({
                roomCode: res.roomCode,
                seatIndex: res.seatIndex || 0,
                amHost: res.seatIndex === (res.roomState.hostSeatIndex ?? 0),
                roomState: res.roomState,
              });
              voiceCallManager.handleSocketReconnected();
            } else if (res && res.success === false && !useGameStore.getState().roomCode) {
              clearSessionCreds();
            }
          },
        );
      }
    });

    sock.on('ludo:room_updated', (roomState) => {
      useGameStore.getState().applyServerRoomUpdate(roomState);
    });

    sock.on('ludo:match_started', (payload) => {
      const st = useGameStore.getState();
      if (st.roomCode) {
        st.applyServerRoomUpdate({
          code: st.roomCode,
          started: true,
          matchEnded: false,
          fillBots: st.fillBots,
          secretWhispers: st.secretWhispers,
          hostSeatIndex: payload.hostSeatIndex ?? st.hostSeatIndex,
          timerConfig: payload.timerConfig || st.onlineTimerConfig,
          seats: payload.seats || st.onlineSeats,
          match: payload.matchState,
          actionSeq: payload.actionSeq,
          serverTime: payload.serverTime,
        });
      }
    });

    sock.on('ludo:state_sync', (payload) => {
      const st = useGameStore.getState();
      if (st.roomCode) {
        st.applyServerRoomUpdate({
          code: st.roomCode,
          started: true,
          matchEnded: payload.matchState?.winner !== null && payload.matchState?.winner !== undefined,
          fillBots: st.fillBots,
          secretWhispers: st.secretWhispers,
          hostSeatIndex: payload.hostSeatIndex ?? st.hostSeatIndex,
          timerConfig: payload.timerConfig || st.onlineTimerConfig,
          seats: payload.seats || st.onlineSeats,
          match: payload.matchState,
          actionSeq: payload.actionSeq,
          serverTime: payload.serverTime,
        });
      }
    });

    sock.on('ludo:dice_roll', (payload) => {
      useGameStore.getState().applyServerDiceRoll({
        dice: payload.dice,
        player: payload.player,
        isLucky7: !!payload.isLucky7,
        isAutoPlay: !!payload.isAutoPlay,
        actionSeq: payload.actionSeq,
      });
    });

    sock.on('ludo:action_rejected', (payload: { action?: string; error?: string }) => {
      const st = useGameStore.getState();
      if (st.activeModal === 'coachSkip' || st.activeModal === 'gulPass') {
        st.setActiveModal(null);
      }
      if (payload?.error) {
        st.showToast(`⏱️ ${payload.error}`);
      }
    });

    sock.on('ludo:gul_prompt', (payload) => {
      useGameStore.getState().setPendingServerGul({
        pawnIdx: payload.pawnIdx,
        steps: payload.steps,
        dieIdx: payload.dieIndex,
      });
    });

    sock.on('ludo:match_ended', (payload: { winner: number; rankings: RankingEntry[] }) => {
      voiceCallManager.leaveCall({ notifyServer: false, silent: true });
      useGameStore.getState().applyServerMatchEnded(payload);
    });

    sock.on('ludo:chat', (msg) => {
      const st = useGameStore.getState();
      if (st.prefs.mutedSeats.includes(msg.seatIndex)) return;
      st.appendChatMessage({
        id: `chat_${msg.timestamp}_${msg.seatIndex}`,
        sender: msg.sender,
        text: msg.text,
        seatIndex: msg.seatIndex,
        timestamp: msg.timestamp,
        kind: 'text',
      });
      sfx.play('notification', 0.45);
    });

    sock.on('ludo:reaction', (payload: { seatIndex: number; emoji: string }) => {
      const st = useGameStore.getState();
      if (st.prefs.mutedSeats.includes(payload.seatIndex)) return;
      st.sceneHandlers.spawnReaction?.(payload.seatIndex, payload.emoji);
      sfx.play('notification', 0.35);
    });

    sock.on('ludo:ai_dialogue', (payload: { seatIdx: number; event: BanterEvent; lineIdx: number }) => {
      if (
        typeof payload?.seatIdx === 'number' &&
        typeof payload?.event === 'string' &&
        typeof payload?.lineIdx === 'number'
      ) {
        useGameStore.getState().playSyncedAiDialogue(payload.seatIdx, payload.event, payload.lineIdx);
      }
    });

    sock.on('ludo:voice', (msg) => {
      const st = useGameStore.getState();
      if (st.prefs.mutedSeats.includes(msg.seatIndex)) return;
      const audioUrl = binaryPayloadToAudioUrl(msg.audio, msg.mimeType);
      if (!audioUrl) return;
      st.appendChatMessage({
        id: `voice_${msg.timestamp}_${msg.seatIndex}`,
        sender: msg.sender,
        text: `🎤 Voice note (${msg.duration}s)`,
        seatIndex: msg.seatIndex,
        timestamp: msg.timestamp,
        kind: 'voice',
        audioData: audioUrl,
        duration: msg.duration,
      });
    });

    sock.on('ludo:secret_whispers_changed', (payload: { secretWhispers?: boolean }) => {
      if (typeof payload?.secretWhispers !== 'boolean') return;
      const st = useGameStore.getState();
      st.setSecretWhispers(payload.secretWhispers);
      st.showToast(
        payload.secretWhispers
          ? '🕶️ Host switched Whispers to Hidden Mode'
          : '👁️ Host switched Whispers to Transparent Mode',
      );
    });

    sock.on('voice:whisper', (msg: {
      id: string;
      fromSeat: number;
      senderName: string;
      clip: unknown;
      mimeType?: string;
      duration: number;
      timestamp: number;
    }) => {
      const clipUrl = binaryPayloadToAudioUrl(msg.clip, msg.mimeType);
      if (!clipUrl) return;
      useGameStore.getState().receiveWhisper({
        id: msg.id,
        fromSeat: msg.fromSeat,
        senderName: msg.senderName,
        clip: clipUrl,
        duration: msg.duration,
        timestamp: msg.timestamp,
      });
    });

    sock.on('ludo:whisper_notice', (msg: {
      fromSeat: number;
      senderName: string;
      toSeats: number[];
      targetNames: string[];
      timestamp: number;
    }) => {
      const st = useGameStore.getState();
      if (st.secretWhispers || st.prefs.mutedSeats.includes(msg.fromSeat)) return;
      const fromClean = msg.senderName.replace(/\s*\(Seat\s*\d+\)/gi, '').trim();
      const targetClean = (msg.targetNames || [])
        .map((n) => n.replace(/\s*\(Seat\s*\d+\)/gi, '').trim())
        .join(', ');
      const noticeText = `whispered privately to ${targetClean}`;
      st.appendChatMessage({
        id: `whisper_notice_${msg.timestamp}_${msg.fromSeat}`,
        sender: `👁️ ${fromClean}`,
        text: noticeText,
        seatIndex: msg.fromSeat,
        timestamp: msg.timestamp,
        kind: 'whisper_notice',
        targetSeats: msg.toSeats,
        targetNames: msg.targetNames,
      });
      if (msg.fromSeat !== st.mySeat && !msg.toSeats?.includes(st.mySeat ?? -1)) {
        st.showToast(`👁️ ${fromClean} whispered to ${targetClean}`);
      }
    });

    // Live WebRTC Voice Call Signaling Listeners
    sock.on('voice:participants', (payload: { participants?: VoiceCallParticipant[] }) => {
      voiceCallManager.handleParticipantsUpdate(payload?.participants || []);
    });

    sock.on('voice:offer', (payload: { fromSocketId: string; fromSeat: number; sdp: RTCSessionDescriptionInit }) => {
      voiceCallManager.handleOffer(payload);
    });

    sock.on('voice:answer', (payload: { fromSocketId: string; fromSeat: number; sdp: RTCSessionDescriptionInit }) => {
      voiceCallManager.handleAnswer(payload);
    });

    sock.on('voice:ice', (payload: { fromSocketId: string; candidate: RTCIceCandidateInit }) => {
      voiceCallManager.handleIceCandidate(payload);
    });

    sock.on('voice:mute-state', (payload: { socketId?: string; seat?: number; isMuted?: boolean }) => {
      voiceCallManager.handleRemoteMuteState(payload);
    });

    this.socket = sock;
    return sock;
  }

  public async createRoom(hostName: string, wish: [number, number]): Promise<boolean> {
    this.manualSessionPending = true;
    const sock = this.ensureSocket();
    const st = useGameStore.getState();
    runSdk.setOnlineName(hostName);
    runSdk.setOnlineWish(wish);

    return new Promise((resolve) => {
      sock.emit(
        'ludo:create_room',
        {
          hostName,
          wish,
          fillBots: st.fillBots,
          timerConfig: {
            enabled: st.prefs.turnTimerEnabled,
            duration: st.prefs.turnTimerDuration,
          },
        },
        (res: {
          success?: boolean;
          error?: string;
          roomCode?: string;
          seatIndex?: number;
          playerToken?: string;
          roomState?: {
            started: boolean;
            matchEnded: boolean;
            fillBots: boolean;
            secretWhispers?: boolean;
            hostSeatIndex?: number;
            timerConfig: { enabled: boolean; duration: 60 | 90 | 120 | 0 };
            seats: Record<number, RoomSeatPublic>;
            match: Record<string, unknown> | null;
            actionSeq?: number;
            serverTime?: number;
          };
        }) => {
          this.manualSessionPending = false;
          if (!res?.success || !res.roomCode || !res.playerToken || !res.roomState) {
            useGameStore.getState().setRoomError(res?.error || 'Failed to create room.');
            return resolve(false);
          }
          this.token = res.playerToken;
          saveSessionCreds(res.roomCode, res.playerToken, 0);

          useGameStore.getState().setRoomJoined({
            roomCode: res.roomCode,
            seatIndex: 0,
            amHost: true,
            roomState: res.roomState,
          });
          useGameStore.getState().showToast(`Room ${res.roomCode} created! Share code with friends.`);
          resolve(true);
        },
      );
    });
  }

  public async joinRoom(
    roomCode: string,
    playerName: string,
    wish: [number, number],
    persistName = true,
  ): Promise<boolean> {
    this.manualSessionPending = true;
    const sock = this.ensureSocket();
    if (persistName) {
      runSdk.setOnlineName(playerName);
    }
    runSdk.setOnlineWish(wish);

    return new Promise((resolve) => {
      sock.emit(
        'ludo:join_room',
        { roomCode: roomCode.trim().toUpperCase(), playerName, wish },
        (res: {
          success?: boolean;
          error?: string;
          roomCode?: string;
          seatIndex?: number;
          playerToken?: string;
          roomState?: any;
        }) => {
          this.manualSessionPending = false;
          if (!res?.success || !res.roomCode || !res.playerToken || !res.roomState) {
            useGameStore.getState().setRoomError(res?.error || 'Could not join room.');
            return resolve(false);
          }
          this.token = res.playerToken;
          const seatIdx = res.seatIndex || 0;
          saveSessionCreds(res.roomCode, res.playerToken, seatIdx);

          useGameStore.getState().setRoomJoined({
            roomCode: res.roomCode,
            seatIndex: seatIdx,
            amHost: seatIdx === (res.roomState.hostSeatIndex ?? 0),
            roomState: res.roomState,
          });
          useGameStore.getState().showToast(`Joined room ${res.roomCode} (Seat ${seatIdx + 1})`);
          resolve(true);
        },
      );
    });
  }

  public toggleReady(): void {
    this.ensureSocket().emit('ludo:toggle_ready', { token: this.token });
  }

  public toggleFillBots(fillBots?: boolean): void {
    this.ensureSocket().emit('ludo:toggle_fill_bots', { token: this.token, fillBots });
  }

  public toggleSecretWhispers(secretWhispers?: boolean): void {
    this.ensureSocket().emit('ludo:toggle_secret_whispers', { token: this.token, secretWhispers });
  }

  public updateTimer(duration: 60 | 90 | 120 | 0): void {
    this.ensureSocket().emit('ludo:update_timer', {
      token: this.token,
      timerConfig: { enabled: duration !== 0, duration },
    });
  }

  public updateWish(wish: [number, number]): void {
    runSdk.setOnlineWish(wish);
    this.ensureSocket().emit('ludo:update_wish', { token: this.token, wish });
  }

  public updateName(
    playerName: string,
    callback?: (res: { success?: boolean; name?: string; error?: string }) => void,
  ): void {
    const clean = playerName.trim().slice(0, 20);
    if (!clean) {
      callback?.({ success: false, error: 'Enter a valid name.' });
      return;
    }
    runSdk.setOnlineName(clean);
    this.ensureSocket().emit('ludo:update_name', { token: this.token, playerName: clean }, callback);
  }

  public startMatch(): void {
    this.ensureSocket().emit('ludo:start_match', { token: this.token }, (res: { success?: boolean; error?: string }) => {
      if (res && !res.success && res.error) {
        useGameStore.getState().setRoomError(res.error);
      }
    });
  }

  public rollDice(useWish = false): void {
    if (useGameStore.getState().turnAutoPlay) return;
    this.ensureSocket().emit('ludo:roll_dice', {
      token: this.token,
      useWish,
      clientActionId: makeClientActionId(),
    });
  }

  public movePawn(pawnIdx: number, steps: number, dieIndex: number | 'combined'): void {
    if (useGameStore.getState().turnAutoPlay) return;
    this.ensureSocket().emit('ludo:move_pawn', {
      token: this.token,
      pawnIdx,
      steps,
      dieIndex,
      clientActionId: makeClientActionId(),
    });
  }

  public submitGulChoice(choice: 'gul' | 'pass'): void {
    if (useGameStore.getState().turnAutoPlay) return;
    this.ensureSocket().emit('ludo:gul_choice', {
      token: this.token,
      choice,
      clientActionId: makeClientActionId(),
    });
  }

  public sendChat(text: string): void {
    this.ensureSocket().emit('ludo:chat', { token: this.token, text });
  }

  public sendReaction(emoji: string): void {
    this.ensureSocket().emit('ludo:reaction', { token: this.token, emoji });
  }

  public sendVoiceNoteBinary(
    audio: ArrayBuffer,
    mimeType: string,
    callback?: (res: { success?: boolean; error?: string; duration?: number }) => void,
  ): void {
    this.ensureSocket().emit(
      'ludo:voice',
      { token: this.token, audio, mimeType },
      callback,
    );
  }

  public sendWhisper(
    toSeats: number[],
    clip: ArrayBuffer,
    mimeType: string,
    callback?: (res: { success?: boolean; error?: string; duration?: number; deliveredTo?: number[] }) => void,
  ): void {
    const roomCode = useGameStore.getState().roomCode;
    this.ensureSocket().emit(
      'voice:whisper',
      {
        roomCode,
        sessionToken: this.token,
        token: this.token,
        toSeats,
        clip,
        mimeType,
      },
      callback,
    );
  }

  public disconnectAndReset(): void {
    voiceCallManager.leaveCall({ notifyServer: true, silent: true });
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.token = null;
    clearSessionCreds();
    useGameStore.getState().leaveOnlineRoomLocal();
  }
}

export const multiplayerClient = new MultiplayerClient();
