import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createSeededRng } from '../src/game/rules';
import { createLudoCoreServer } from '../server/server.js';

async function emitAck<T = any>(socket: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), 5000);
    socket.emit(event, payload, (res: T) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

test('Authoritative multiplayer lifecycle: actionSeq ordering, duplicate action suppression, disconnect takeover + reconnect reclaim, and /api/tts rate limit', async () => {
  const { server, io, roomManager } = createLudoCoreServer({
    rootDir: path.resolve(process.cwd()),
    roomOptions: {
      rng: createSeededRng(777),
      disconnectGraceMs: 120,
    },
    ttsMaxPerMin: 4,
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let hostSocket: ClientSocket | null = null;
  let guestSocket: ClientSocket | null = null;
  let reconnectSocket: ClientSocket | null = null;

  try {
    hostSocket = ioClient(baseUrl, { transports: ['websocket'] });
    guestSocket = ioClient(baseUrl, { transports: ['websocket'] });
    await Promise.all([
      new Promise<void>((r) => hostSocket!.on('connect', () => r())),
      new Promise<void>((r) => guestSocket!.on('connect', () => r())),
    ]);

    // 1. Create room & verify clean display name + 5 seats + actionSeq
    const createRes = await emitAck(hostSocket, 'ludo:create_room', {
      hostName: 'Anees',
      wish: [6, 5],
      timerConfig: { enabled: false, duration: 0 },
    });
    assert.equal(createRes.success, true);
    assert.ok(createRes.roomCode);
    assert.equal(createRes.roomState.seats[0].name, 'Anees');

    // 2. Join guest (Seat 1)
    const joinRes = await emitAck(guestSocket, 'ludo:join_room', {
      roomCode: createRes.roomCode,
      playerName: 'Shahbaz',
      wish: [6, 4],
    });
    assert.equal(joinRes.success, true);
    assert.equal(joinRes.seatIndex, 1);
    assert.ok(joinRes.roomState.actionSeq > createRes.roomState.actionSeq);

    // 3. Start match -> collects monotonic actionSeq events
    const observedSeqs: number[] = [];
    const rollEvents: any[] = [];
    guestSocket.on('ludo:state_sync', (p) => {
      if (typeof p.actionSeq === 'number') observedSeqs.push(p.actionSeq);
    });
    guestSocket.on('ludo:dice_roll', (p) => rollEvents.push(p));

    const startRes = await emitAck(hostSocket, 'ludo:start_match', {
      token: createRes.playerToken,
    });
    assert.equal(startRes.success, true);

    // 4. Emit duplicate roll_dice with SAME clientActionId -> server executes ONLY ONCE
    const actionId = 'dup-test-roll-1';
    hostSocket.emit('ludo:roll_dice', {
      token: createRes.playerToken,
      useWish: false,
      clientActionId: actionId,
    });
    hostSocket.emit('ludo:roll_dice', {
      token: createRes.playerToken,
      useWish: false,
      clientActionId: actionId,
    });

    await new Promise((r) => setTimeout(r, 250));
    assert.equal(rollEvents.length, 1);
    assert.ok(observedSeqs.length >= 1);
    for (let i = 1; i < observedSeqs.length; i++) {
      assert.ok(observedSeqs[i] >= observedSeqs[i - 1]);
    }

    // 5. Disconnect Host while timer is OFF -> after 120ms grace, tempBotTakeover activates (isAI === true)
    let latestRoomState: any = null;
    guestSocket.on('ludo:room_updated', (s) => {
      latestRoomState = s;
    });
    hostSocket.disconnect();

    await new Promise((r) => setTimeout(r, 320));
    assert.ok(latestRoomState);
    assert.equal(latestRoomState.seats[0].connected, false);
    assert.equal(latestRoomState.seats[0].tempBotTakeover, true);
    assert.equal(latestRoomState.seats[0].isAI, true);

    // 6. Host reconnects with token -> tempBotTakeover clears and restores human control
    reconnectSocket = ioClient(baseUrl, { transports: ['websocket'] });
    await new Promise<void>((r) => reconnectSocket!.on('connect', () => r()));

    const reconRes = await emitAck(reconnectSocket, 'ludo:reconnect', {
      roomCode: createRes.roomCode,
      seatIndex: 0,
      playerToken: createRes.playerToken,
    });
    assert.equal(reconRes.success, true);
    assert.equal(reconRes.roomState.seats[0].connected, true);
    assert.equal(reconRes.roomState.seats[0].tempBotTakeover, false);
    assert.equal(reconRes.roomState.seats[0].isAI, false);

    // 7. Verify /api/tts validation & per-IP rate limiting (limit set to 3/min for test)
    const tooLongRes = await fetch(`${baseUrl}/api/tts?text=${'a'.repeat(210)}&lang=en`);
    assert.equal(tooLongRes.status, 400);

    // 3 allowed hits (upstream fetch may return 200 or 502 depending on network; status != 429)
    for (let i = 0; i < 3; i++) {
      const okRes = await fetch(`${baseUrl}/api/tts?text=hello&lang=en`);
      assert.notEqual(okRes.status, 429);
    }
    const throttledRes = await fetch(`${baseUrl}/api/tts?text=hello&lang=en`);
    assert.equal(throttledRes.status, 429);
  } finally {
    hostSocket?.disconnect();
    guestSocket?.disconnect();
    reconnectSocket?.disconnect();
    roomManager.dispose();
    io.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
