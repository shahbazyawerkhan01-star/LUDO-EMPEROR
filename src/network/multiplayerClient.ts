import { io, type Socket } from 'socket.io-client';
import { sfx } from '../game/sfx';
import { runSdk } from '../sdk/runSdk';
import { useGameStore, type RoomSeatPublic } from '../state/store';
import type { RankingEntry } from '../game/rules';

const STORAGE_ROOM_KEY = 'ludo_room_code';
const STORAGE_TOKEN_KEY = 'ludo_player_token';
const STORAGE_SEAT_KEY = 'ludo_seat_index';

function saveSessionCreds(roomCode: string, token: string, seatIdx: number): void {
  try {
    localStorage.setItem(STORAGE_ROOM_KEY, roomCode);
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
    localStorage.setItem(STORAGE_SEAT_KEY, String(seatIdx));
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

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.token =
          localStorage.getItem(STORAGE_TOKEN_KEY) ||
          sessionStorage.getItem(STORAGE_TOKEN_KEY);
      } catch {
        this.token = null;
      }
    }
  }

  public tryAutoReconnect(): void {
    if (typeof window === 'undefined') return;
    try {
      const code = localStorage.getItem(STORAGE_ROOM_KEY);
      const tok = localStorage.getItem(STORAGE_TOKEN_KEY);
      const seat = localStorage.getItem(STORAGE_SEAT_KEY);
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

    sock.on('connect', () => {
      let code: string | null = null;
      let tok: string | null = null;
      let seat: string | null = null;
      try {
        code = localStorage.getItem(STORAGE_ROOM_KEY) || sessionStorage.getItem(STORAGE_ROOM_KEY);
        tok = localStorage.getItem(STORAGE_TOKEN_KEY) || sessionStorage.getItem(STORAGE_TOKEN_KEY);
        seat = localStorage.getItem(STORAGE_SEAT_KEY) || sessionStorage.getItem(STORAGE_SEAT_KEY);
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
        actionSeq: payload.actionSeq,
      });
    });

    sock.on('ludo:gul_prompt', (payload) => {
      useGameStore.getState().setPendingServerGul({
        pawnIdx: payload.pawnIdx,
        steps: payload.steps,
        dieIdx: payload.dieIndex,
      });
    });

    sock.on('ludo:match_ended', (payload: { winner: number; rankings: RankingEntry[] }) => {
      useGameStore.getState().applyServerMatchEnded(payload);
    });

    sock.on('ludo:chat', (msg) => {
      useGameStore.getState().appendChatMessage({
        id: `chat_${msg.timestamp}_${msg.seatIndex}`,
        sender: msg.sender,
        text: msg.text,
        seatIndex: msg.seatIndex,
        timestamp: msg.timestamp,
      });
      sfx.play('notification', 0.45);
    });

    sock.on('ludo:reaction', (payload: { seatIndex: number; emoji: string }) => {
      useGameStore.getState().sceneHandlers.spawnReaction?.(payload.seatIndex, payload.emoji);
      sfx.play('notification', 0.35);
    });

    sock.on('ludo:voice', (msg) => {
      useGameStore.getState().appendChatMessage({
        id: `voice_${msg.timestamp}_${msg.seatIndex}`,
        sender: msg.sender,
        text: `🎤 Voice note (${msg.duration}s)`,
        seatIndex: msg.seatIndex,
        timestamp: msg.timestamp,
        audioData: msg.audio,
        duration: msg.duration,
      });
    });

    this.socket = sock;
    return sock;
  }

  public async createRoom(hostName: string, wish: [number, number]): Promise<boolean> {
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
            hostSeatIndex?: number;
            timerConfig: { enabled: boolean; duration: 60 | 90 | 120 | 0 };
            seats: Record<number, RoomSeatPublic>;
            match: Record<string, unknown> | null;
            actionSeq?: number;
            serverTime?: number;
          };
        }) => {
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

  public async joinRoom(roomCode: string, playerName: string, wish: [number, number]): Promise<boolean> {
    const sock = this.ensureSocket();
    runSdk.setOnlineName(playerName);
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

  public startMatch(): void {
    this.ensureSocket().emit('ludo:start_match', { token: this.token }, (res: { success?: boolean; error?: string }) => {
      if (res && !res.success && res.error) {
        useGameStore.getState().setRoomError(res.error);
      }
    });
  }

  public rollDice(useWish = false): void {
    this.ensureSocket().emit('ludo:roll_dice', {
      token: this.token,
      useWish,
      clientActionId: makeClientActionId(),
    });
  }

  public movePawn(pawnIdx: number, steps: number, dieIndex: number | 'combined'): void {
    this.ensureSocket().emit('ludo:move_pawn', {
      token: this.token,
      pawnIdx,
      steps,
      dieIndex,
      clientActionId: makeClientActionId(),
    });
  }

  public submitGulChoice(choice: 'gul' | 'pass'): void {
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

  public sendVoiceNote(audioBase64: string, duration: number): void {
    this.ensureSocket().emit('ludo:voice', { token: this.token, audio: audioBase64, duration });
  }

  public disconnectAndReset(): void {
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
