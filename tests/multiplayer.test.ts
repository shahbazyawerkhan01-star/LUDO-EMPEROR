import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createSeededRng } from '../src/game/rules';
import { createLudoCoreServer } from '../server/server.js';

import { useGameStore } from '../src/state/store';

async function emitAck<T = any>(socket: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), 5000);
    socket.emit(event, payload, (res: T) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

function createFixedDiceRng(sequence: number[]): () => number {
  let idx = 0;
  return () => {
    const face = sequence[idx % sequence.length];
    idx++;
    return (face - 0.5) / 6;
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000, intervalMs = 15): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
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

test('Online timeout before rolling triggers authoritative auto-roll + AI move (not a skipped turn)', async () => {
  const { server, io, roomManager } = createLudoCoreServer({
    rootDir: path.resolve(process.cwd()),
    roomOptions: {
      rng: createFixedDiceRng([4, 2]),
      tickIntervalMs: 25,
      autoPlayRollDelayMs: 60,
      autoPlayMoveDelayMs: 50,
      turnPassDelayMs: 40,
    },
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let hostSocket: ClientSocket | null = null;
  let guestSocket: ClientSocket | null = null;

  try {
    hostSocket = ioClient(baseUrl, { transports: ['websocket'] });
    guestSocket = ioClient(baseUrl, { transports: ['websocket'] });
    await Promise.all([
      new Promise<void>((r) => hostSocket!.on('connect', () => r())),
      new Promise<void>((r) => guestSocket!.on('connect', () => r())),
    ]);

    const createRes = await emitAck(hostSocket, 'ludo:create_room', {
      hostName: 'Anees',
      wish: [6, 5],
      timerConfig: { enabled: true, duration: 60 },
    });
    assert.equal(createRes.success, true);

    const joinRes = await emitAck(guestSocket, 'ludo:join_room', {
      roomCode: createRes.roomCode,
      playerName: 'Shahbaz',
      wish: [6, 4],
    });
    assert.equal(joinRes.success, true);

    const rollEvents: any[] = [];
    hostSocket.on('ludo:dice_roll', (ev) => rollEvents.push(ev));

    const startRes = await emitAck(hostSocket, 'ludo:start_match', {
      token: createRes.playerToken,
    });
    assert.equal(startRes.success, true);

    const room = roomManager.getInternalRoomForTest(createRes.roomCode);
    assert.ok(room && room.match);
    // Place Seat 0 pawn 0 on open track so dice [4, 2] move it cleanly from pos 5 -> 11
    room.match.pawns[0][0] = { status: 'on-path', pos: 5 };
    // Force immediate timeout before rolling
    room.match.turnExpiresAt = Date.now() - 20;

    // Wait for auto-roll + both moves + clean advance to Seat 1
    await waitFor(
      () => room.match!.currentPlayer === 1 && !room.match!.turnAutoPlay && !room.match!.hasRolled,
      3000,
    );

    assert.equal(rollEvents.length, 1);
    assert.equal(rollEvents[0].player, 0);
    assert.equal(rollEvents[0].isAutoPlay, true);
    assert.deepEqual(rollEvents[0].dice, [4, 2]);
    assert.equal(room.match.pawns[0][0].pos, 11);
    assert.ok(room.match.turnExpiresAt && room.match.turnExpiresAt > Date.now());
  } finally {
    hostSocket?.disconnect();
    guestSocket?.disconnect();
    roomManager.dispose();
    io.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('Online timeout after rolling auto-plays remaining dice and handles normal advance + earned extra turn cleanly', async () => {
  const { server, io, roomManager } = createLudoCoreServer({
    rootDir: path.resolve(process.cwd()),
    roomOptions: {
      rng: createFixedDiceRng([3, 2, 6, 6]),
      tickIntervalMs: 25,
      autoPlayRollDelayMs: 60,
      autoPlayMoveDelayMs: 50,
      turnPassDelayMs: 40,
    },
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let hostSocket: ClientSocket | null = null;
  let guestSocket: ClientSocket | null = null;

  try {
    hostSocket = ioClient(baseUrl, { transports: ['websocket'] });
    guestSocket = ioClient(baseUrl, { transports: ['websocket'] });
    await Promise.all([
      new Promise<void>((r) => hostSocket!.on('connect', () => r())),
      new Promise<void>((r) => guestSocket!.on('connect', () => r())),
    ]);

    const createRes = await emitAck(hostSocket, 'ludo:create_room', {
      hostName: 'Anees',
      wish: [6, 5],
      timerConfig: { enabled: true, duration: 60 },
    });
    const joinRes = await emitAck(guestSocket, 'ludo:join_room', {
      roomCode: createRes.roomCode,
      playerName: 'Shahbaz',
      wish: [6, 4],
    });
    assert.equal(joinRes.success, true);

    await emitAck(hostSocket, 'ludo:start_match', { token: createRes.playerToken });
    const room = roomManager.getInternalRoomForTest(createRes.roomCode);
    assert.ok(room && room.match);

    // Part A: Seat 0 has 2 pawns on track, manually rolls [3, 2], plays die 0 (3 steps), then times out with [2] left
    room.match.pawns[0][0] = { status: 'on-path', pos: 5 };
    room.match.pawns[0][1] = { status: 'on-path', pos: 12 };

    const rollAck = await emitAck(hostSocket, 'ludo:roll_dice', {
      token: createRes.playerToken,
      useWish: false,
      clientActionId: 'after-roll-1',
    });
    assert.equal(rollAck.success, true);
    assert.deepEqual(room.match.dice, [3, 2]);

    await new Promise((r) => setTimeout(r, 140));
    const moveAck = await emitAck(hostSocket, 'ludo:move_pawn', {
      token: createRes.playerToken,
      pawnIdx: 0,
      steps: 3,
      dieIndex: 0,
      clientActionId: 'after-roll-move-1',
    });
    assert.equal(moveAck.success, true);
    assert.equal(room.match.pawns[0][0].pos, 8);
    assert.deepEqual(room.match.movesAvailable, [2]);

    // Expire clock with 1 die remaining -> auto-plays remaining 2 steps and advances to Seat 1
    room.match.turnExpiresAt = Date.now() - 20;
    await waitFor(
      () => room.match!.currentPlayer === 1 && !room.match!.turnAutoPlay && !room.match!.hasRolled,
      3000,
    );
    const totalSeat0Pos = room.match.pawns[0][0].pos + room.match.pawns[0][1].pos;
    assert.equal(totalSeat0Pos, 22); // 8 + 12 + 2

    // Part B: Seat 1 rolls Double 6 [6, 6] manually, then times out before moving -> auto-plays both 6s & keeps Bonus Turn!
    room.match.pawns[1][0] = { status: 'on-path', pos: 5 };
    room.match.pawns[1][1] = { status: 'on-path', pos: 12 };

    const roll66 = await emitAck(guestSocket, 'ludo:roll_dice', {
      token: joinRes.playerToken,
      useWish: false,
      clientActionId: 'after-roll-66',
    });
    assert.equal(roll66.success, true);
    assert.deepEqual(room.match.dice, [6, 6]);
    assert.equal(room.match.extraTurnEarned, true);

    room.match.turnExpiresAt = Date.now() - 20;
    await waitFor(
      () =>
        room.match!.currentPlayer === 1 &&
        !room.match!.hasRolled &&
        !room.match!.turnAutoPlay &&
        room.match!.turnExpiresAt !== null &&
        room.match!.turnExpiresAt > Date.now(),
      3000,
    );
    // Both 6s were executed (either deploying from base to pos 0 or advancing +6/+6)
    const seat1Progress = room.match.pawns[1].reduce(
      (sum, p) => sum + (p.status === 'on-path' ? p.pos + 1 : p.status === 'finished' ? 69 : 0),
      0,
    );
    assert.ok(seat1Progress > (5 + 1) + (12 + 1));
  } finally {
    hostSocket?.disconnect();
    guestSocket?.disconnect();
    roomManager.dispose();
    io.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('Online timeout on pendingGul auto-resolves as Gul (pos 68) without hanging the match', async () => {
  const { server, io, roomManager } = createLudoCoreServer({
    rootDir: path.resolve(process.cwd()),
    roomOptions: {
      rng: createFixedDiceRng([3, 2]),
      tickIntervalMs: 25,
      autoPlayRollDelayMs: 60,
      autoPlayMoveDelayMs: 50,
      turnPassDelayMs: 40,
    },
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let hostSocket: ClientSocket | null = null;
  let guestSocket: ClientSocket | null = null;

  try {
    hostSocket = ioClient(baseUrl, { transports: ['websocket'] });
    guestSocket = ioClient(baseUrl, { transports: ['websocket'] });
    await Promise.all([
      new Promise<void>((r) => hostSocket!.on('connect', () => r())),
      new Promise<void>((r) => guestSocket!.on('connect', () => r())),
    ]);

    const createRes = await emitAck(hostSocket, 'ludo:create_room', {
      hostName: 'Anees',
      wish: [6, 5],
      timerConfig: { enabled: true, duration: 60 },
    });
    await emitAck(guestSocket, 'ludo:join_room', {
      roomCode: createRes.roomCode,
      playerName: 'Shahbaz',
      wish: [6, 4],
    });
    await emitAck(hostSocket, 'ludo:start_match', { token: createRes.playerToken });

    const room = roomManager.getInternalRoomForTest(createRes.roomCode);
    assert.ok(room && room.match);

    // Seat 0 pawn 0 is 3 steps from Centre Home (65 + 3 = 68), pawn 1 is on open track (pos 10)
    room.match.pawns[0][0] = { status: 'on-path', pos: 65 };
    room.match.pawns[0][1] = { status: 'on-path', pos: 10 };

    let gulPromptReceived: any = null;
    hostSocket.on('ludo:gul_prompt', (p) => {
      gulPromptReceived = p;
    });

    await emitAck(hostSocket, 'ludo:roll_dice', {
      token: createRes.playerToken,
      useWish: false,
      clientActionId: 'gul-roll',
    });
    await new Promise((r) => setTimeout(r, 140));

    // Move pawn 0 by 3 -> enters pendingGul prompt for human player
    await emitAck(hostSocket, 'ludo:move_pawn', {
      token: createRes.playerToken,
      pawnIdx: 0,
      steps: 3,
      dieIndex: 0,
      clientActionId: 'gul-move',
    });

    await waitFor(() => !!gulPromptReceived && !!room.match!.pendingGul, 2000);
    assert.equal(room.match.pendingGul?.pawnIdx, 0);

    // Expire clock while pendingGul is awaiting user decision -> must auto-resolve as Gul + play remaining die + grant bonus turn
    room.match.turnExpiresAt = Date.now() - 20;

    await waitFor(
      () =>
        room.match!.pendingGul === null &&
        room.match!.pawns[0][0].status === 'finished' &&
        room.match!.pawns[0][0].pos === 68 &&
        room.match!.currentPlayer === 0 &&
        !room.match!.hasRolled &&
        !room.match!.turnAutoPlay,
      3000,
    );

    // Remaining die (2) also auto-played on pawn 1 (10 -> 12), and fresh bonus clock granted
    assert.equal(room.match.pawns[0][1].pos, 12);
    assert.ok(room.match.turnExpiresAt && room.match.turnExpiresAt > Date.now());
  } finally {
    hostSocket?.disconnect();
    guestSocket?.disconnect();
    roomManager.dispose();
    io.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('Late manual roll_dice, move_pawn, and gul_choice inputs during turnAutoPlay are rejected', async () => {
  const { server, io, roomManager } = createLudoCoreServer({
    rootDir: path.resolve(process.cwd()),
    roomOptions: {
      rng: createFixedDiceRng([4, 2]),
      tickIntervalMs: 25,
      autoPlayRollDelayMs: 420,
      autoPlayMoveDelayMs: 200,
      turnPassDelayMs: 50,
    },
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let hostSocket: ClientSocket | null = null;
  let guestSocket: ClientSocket | null = null;

  try {
    hostSocket = ioClient(baseUrl, { transports: ['websocket'] });
    guestSocket = ioClient(baseUrl, { transports: ['websocket'] });
    await Promise.all([
      new Promise<void>((r) => hostSocket!.on('connect', () => r())),
      new Promise<void>((r) => guestSocket!.on('connect', () => r())),
    ]);

    const createRes = await emitAck(hostSocket, 'ludo:create_room', {
      hostName: 'Anees',
      wish: [6, 5],
      timerConfig: { enabled: true, duration: 60 },
    });
    await emitAck(guestSocket, 'ludo:join_room', {
      roomCode: createRes.roomCode,
      playerName: 'Shahbaz',
      wish: [6, 4],
    });
    await emitAck(hostSocket, 'ludo:start_match', { token: createRes.playerToken });

    const room = roomManager.getInternalRoomForTest(createRes.roomCode);
    assert.ok(room && room.match);
    room.match.pawns[0][0] = { status: 'on-path', pos: 5 };

    const rejectedEvents: any[] = [];
    hostSocket.on('ludo:action_rejected', (ev) => rejectedEvents.push(ev));

    // Expire turn timer -> server enters turnAutoPlay and auto-rolls, waiting 420ms before moving
    room.match.turnExpiresAt = Date.now() - 20;
    await waitFor(() => room.match!.turnAutoPlay === true && room.match!.hasRolled === true, 2000);

    // Send late manual roll, move, and gul_choice while turnAutoPlay === true
    const [lateRoll, lateMove, lateGul] = await Promise.all([
      emitAck(hostSocket, 'ludo:roll_dice', {
        token: createRes.playerToken,
        useWish: false,
        clientActionId: 'late-roll',
      }),
      emitAck(hostSocket, 'ludo:move_pawn', {
        token: createRes.playerToken,
        pawnIdx: 0,
        steps: 4,
        dieIndex: 0,
        clientActionId: 'late-move',
      }),
      emitAck(hostSocket, 'ludo:gul_choice', {
        token: createRes.playerToken,
        choice: 'pass',
        clientActionId: 'late-gul',
      }),
    ]);

    assert.deepEqual(lateRoll, { success: false, error: 'Turn timed out, auto-playing' });
    assert.deepEqual(lateMove, { success: false, error: 'Turn timed out, auto-playing' });
    assert.deepEqual(lateGul, { success: false, error: 'Turn timed out, auto-playing' });
    assert.equal(rejectedEvents.length, 3);

    // Ensure auto-play still finishes cleanly after rejecting late manual inputs
    await waitFor(
      () => room.match!.currentPlayer === 1 && !room.match!.turnAutoPlay,
      3000,
    );
    assert.equal(room.match.pawns[0][0].pos, 11);
  } finally {
    hostSocket?.disconnect();
    guestSocket?.disconnect();
    roomManager.dispose();
    io.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('Local Pass & Play timeout auto-resolves gulPass, dismisses coachSkip, and auto-plays remaining moves', async () => {
  // Prepare a 5-human local match so AI seats do not interfere with assertions
  const st0 = useGameStore.getState();
  const fiveHumans = st0.players.map((p, i) => ({ ...p, isAI: false, name: `Human ${i + 1}` }));
  useGameStore.setState({
    players: fiveHumans,
    prefs: { ...st0.prefs, turnTimerEnabled: true, turnTimerDuration: 60 },
  });

  useGameStore.getState().startLocalMatch(false);

  // Case 1: Timeout on pendingGulMove ('gulPass' modal open) -> closes modal and auto-enters Centre Home (68)
  const pawnsGul = useGameStore.getState().pawns.map((row) => row.map((p) => ({ ...p })));
  pawnsGul[0][0] = { status: 'on-path', pos: 65 };
  pawnsGul[0][1] = { status: 'on-path', pos: 10 };
  useGameStore.setState({
    pawns: pawnsGul,
    currentPlayer: 0,
    hasRolled: true,
    isRolling: false,
    dice: [3, 2],
    movesAvailable: [3, 2],
    selectedDieIndex: 0,
    activeModal: 'gulPass',
    pendingGulMove: { pawnIdx: 0, steps: 3, dieIdx: 0 },
    turnSecondsLeft: 1,
    turnAutoPlay: false,
  });

  useGameStore.getState().tickLocalTimer();
  assert.equal(useGameStore.getState().activeModal, null);
  assert.equal(useGameStore.getState().pendingGulMove, null);
  assert.equal(useGameStore.getState().pawns[0][0].status, 'finished');
  assert.equal(useGameStore.getState().pawns[0][0].pos, 68);
  assert.equal(useGameStore.getState().turnAutoPlay, true);

  // Wait for remaining die (2) to auto-play and bonus turn to reset clock cleanly
  await waitFor(
    () =>
      useGameStore.getState().currentPlayer === 0 &&
      !useGameStore.getState().hasRolled &&
      !useGameStore.getState().turnAutoPlay &&
      useGameStore.getState().turnSecondsLeft === 60,
    3000,
  );
  assert.equal(useGameStore.getState().pawns[0][1].pos, 12);

  // Case 2: Timeout with coachSkip modal open after rolling -> dismisses coachSkip, auto-plays remaining die, advances turn
  const pawnsCoach = useGameStore.getState().pawns.map((row) => row.map((p) => ({ ...p })));
  pawnsCoach[0][1] = { status: 'on-path', pos: 12 };
  useGameStore.setState({
    pawns: pawnsCoach,
    currentPlayer: 0,
    hasRolled: true,
    isRolling: false,
    dice: [4, 2],
    movesAvailable: [4],
    selectedDieIndex: 0,
    activeModal: 'coachSkip',
    pendingCoachMove: { pawnIdx: 1, steps: 4, dieIdx: 0 },
    turnSecondsLeft: 1,
    turnAutoPlay: false,
  });

  useGameStore.getState().tickLocalTimer();
  assert.equal(useGameStore.getState().activeModal, null);
  assert.equal(useGameStore.getState().turnAutoPlay, true);

  // Late manual tap while turnAutoPlay === true must be ignored
  useGameStore.getState().handleLocalPawnTap(0, 1);
  assert.equal(useGameStore.getState().pawns[0][1].pos, 12);

  await waitFor(
    () =>
      useGameStore.getState().currentPlayer === 1 &&
      !useGameStore.getState().turnAutoPlay &&
      useGameStore.getState().turnSecondsLeft === 60,
    3000,
  );
  assert.equal(useGameStore.getState().pawns[0][1].pos, 16);

  // Case 3: Timeout before rolling -> auto-rolls & plays (or transitions cleanly) without forfeiting before rolling
  const pawnsBeforeRoll = useGameStore.getState().pawns.map((row) => row.map((p) => ({ ...p })));
  pawnsBeforeRoll[1][0] = { status: 'on-path', pos: 5 };
  useGameStore.setState({
    pawns: pawnsBeforeRoll,
    currentPlayer: 1,
    hasRolled: false,
    isRolling: false,
    movesAvailable: [],
    turnSecondsLeft: 1,
    turnAutoPlay: false,
  });

  useGameStore.getState().tickLocalTimer();
  assert.equal(useGameStore.getState().turnAutoPlay, true);
  assert.equal(useGameStore.getState().isRolling, true);

  // Wait for roll + auto-play move(s) to finish and reset turnAutoPlay cleanly
  await waitFor(
    () =>
      !useGameStore.getState().turnAutoPlay &&
      !useGameStore.getState().isRolling &&
      useGameStore.getState().turnSecondsLeft === 60,
    4000,
  );
  // Total seat 1 progress increased from initial pos 5 (score 6) — either advancing pawn 0 or deploying a new pawn on a 6
  const seat1LocalProgress = useGameStore.getState().pawns[1].reduce(
    (sum, p) => sum + (p.status === 'on-path' ? p.pos + 1 : p.status === 'finished' ? 69 : 0),
    0,
  );
  assert.ok(seat1LocalProgress > 6);

  useGameStore.getState().exitMatchToMenu();
});

test('Room-scoped WebRTC voice signaling relay: join/leave/mute broadcasts, offer/answer/ICE relay, cross-room isolation, and disconnect cleanup', async () => {
  const { getVoiceIceServers } = await import('../src/network/voiceCallManager');
  const defaultIce = getVoiceIceServers();
  assert.ok(
    defaultIce.some((s) =>
      Array.isArray(s.urls)
        ? s.urls.includes('stun:stun.l.google.com:19302')
        : s.urls === 'stun:stun.l.google.com:19302',
    ),
  );
  assert.ok(
    defaultIce.some((s) =>
      Array.isArray(s.urls)
        ? s.urls.includes('stun:stun1.l.google.com:19302')
        : s.urls === 'stun:stun1.l.google.com:19302',
    ),
  );

  const { server, io, roomManager } = createLudoCoreServer({
    rootDir: path.resolve(process.cwd()),
    roomOptions: {
      rng: createSeededRng(404),
      disconnectGraceMs: 120,
    },
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let roomAHost: ClientSocket | null = null;
  let roomAGuest: ClientSocket | null = null;
  let roomBHost: ClientSocket | null = null;

  try {
    roomAHost = ioClient(baseUrl, { transports: ['websocket'] });
    roomAGuest = ioClient(baseUrl, { transports: ['websocket'] });
    roomBHost = ioClient(baseUrl, { transports: ['websocket'] });
    await Promise.all([
      new Promise<void>((r) => roomAHost!.on('connect', () => r())),
      new Promise<void>((r) => roomAGuest!.on('connect', () => r())),
      new Promise<void>((r) => roomBHost!.on('connect', () => r())),
    ]);

    // Create Room A (host + guest) and separate Room B (host)
    const createA = await emitAck(roomAHost, 'ludo:create_room', {
      hostName: 'Anees',
      wish: [6, 5],
      timerConfig: { enabled: false, duration: 0 },
    });
    assert.equal(createA.success, true);

    const joinA = await emitAck(roomAGuest, 'ludo:join_room', {
      roomCode: createA.roomCode,
      playerName: 'Shahbaz',
      wish: [6, 4],
    });
    assert.equal(joinA.success, true);

    const createB = await emitAck(roomBHost, 'ludo:create_room', {
      hostName: 'Intruder',
      wish: [6, 5],
      timerConfig: { enabled: false, duration: 0 },
    });
    assert.equal(createB.success, true);

    let latestParticipantsA: any[] = [];
    const offersToGuest: any[] = [];
    const answersToHost: any[] = [];
    const iceToGuest: any[] = [];
    const muteBroadcastsA: any[] = [];
    const offersToRoomAHost: any[] = [];

    roomAHost.on('voice:participants', (p) => {
      latestParticipantsA = p.participants || [];
    });
    roomAHost.on('voice:answer', (p) => answersToHost.push(p));
    roomAHost.on('voice:offer', (p) => offersToRoomAHost.push(p));
    roomAHost.on('voice:mute-state', (p) => muteBroadcastsA.push(p));

    roomAGuest.on('voice:offer', (p) => offersToGuest.push(p));
    roomAGuest.on('voice:ice', (p) => iceToGuest.push(p));

    // 1. Both Room A players opt in to live voice call
    const joinVoiceHost = await emitAck(roomAHost, 'voice:join', {
      token: createA.playerToken,
      isMuted: false,
    });
    assert.equal(joinVoiceHost.success, true);
    assert.equal(joinVoiceHost.participants.length, 1);

    const joinVoiceGuest = await emitAck(roomAGuest, 'voice:join', {
      token: joinA.playerToken,
      isMuted: false,
    });
    assert.equal(joinVoiceGuest.success, true);
    assert.equal(joinVoiceGuest.participants.length, 2);

    await waitFor(() => latestParticipantsA.length === 2, 1500);

    // 2. Same-room WebRTC signaling relay: offer, answer, ICE
    const offerAck = await emitAck(roomAHost, 'voice:offer', {
      token: createA.playerToken,
      targetSocketId: roomAGuest.id,
      sdp: { type: 'offer', sdp: 'v=0\r\nfake-offer-sdp' },
    });
    assert.equal(offerAck.success, true);

    const answerAck = await emitAck(roomAGuest, 'voice:answer', {
      token: joinA.playerToken,
      targetSocketId: roomAHost.id,
      sdp: { type: 'answer', sdp: 'v=0\r\nfake-answer-sdp' },
    });
    assert.equal(answerAck.success, true);

    const iceAck = await emitAck(roomAHost, 'voice:ice', {
      token: createA.playerToken,
      targetSocketId: roomAGuest.id,
      candidate: { candidate: 'candidate:1 1 udp 2122260223 192.0.2.1 54400 typ host' },
    });
    assert.equal(iceAck.success, true);

    await waitFor(
      () => offersToGuest.length === 1 && answersToHost.length === 1 && iceToGuest.length === 1,
      1500,
    );
    assert.equal(offersToGuest[0].fromSocketId, roomAHost.id);
    assert.equal(offersToGuest[0].fromSeat, 0);
    assert.equal(answersToHost[0].fromSocketId, roomAGuest.id);
    assert.equal(answersToHost[0].fromSeat, 1);
    assert.equal(iceToGuest[0].fromSocketId, roomAHost.id);

    // 3. Cross-room isolation: Room B host CANNOT relay offer/answer/ICE into Room A
    const [crossOffer, crossAnswer, crossIce] = await Promise.all([
      emitAck(roomBHost, 'voice:offer', {
        token: createB.playerToken,
        targetSocketId: roomAHost.id,
        sdp: { type: 'offer', sdp: 'cross-room-attempt' },
      }),
      emitAck(roomBHost, 'voice:answer', {
        token: createB.playerToken,
        targetSocketId: roomAHost.id,
        sdp: { type: 'answer', sdp: 'cross-room-attempt' },
      }),
      emitAck(roomBHost, 'voice:ice', {
        token: createB.playerToken,
        targetSocketId: roomAGuest.id,
        candidate: { candidate: 'cross-room-ice' },
      }),
    ]);
    assert.equal(crossOffer.success, false);
    assert.equal(crossAnswer.success, false);
    assert.equal(crossIce.success, false);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(offersToRoomAHost.length, 0);
    assert.equal(iceToGuest.length, 1);

    // 4. Mute state sync enforces authoritative seat index
    const muteAck = await emitAck(roomAGuest, 'voice:mute-state', {
      token: joinA.playerToken,
      seat: 0, // Attempt to spoof seat 0 -> server must override with seat 1
      isMuted: true,
    });
    assert.equal(muteAck.success, true);
    assert.equal(muteAck.seat, 1);
    assert.equal(muteAck.isMuted, true);
    await waitFor(
      () =>
        muteBroadcastsA.some((m) => m.seat === 1 && m.isMuted === true) &&
        latestParticipantsA.some((p) => p.seatIndex === 1 && p.isMuted === true),
      1500,
    );

    // 5. Disconnect cleans up voice participant and notifies room
    roomAGuest.disconnect();
    await waitFor(() => latestParticipantsA.length === 1 && latestParticipantsA[0].seatIndex === 0, 1500);

    // 6. Explicit voice:leave removes remaining host cleanly
    const leaveAck = await emitAck(roomAHost, 'voice:leave', { token: createA.playerToken });
    assert.equal(leaveAck.success, true);
    await waitFor(() => latestParticipantsA.length === 0, 1500);
  } finally {
    roomAHost?.disconnect();
    roomAGuest?.disconnect();
    roomBHost?.disconnect();
    roomManager.dispose();
    io.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('Private voice:whisper delivers clip only to target seat, emits metadata-only transparent notice by default, and enforces bot/disconnect/rate-limit/size guards', async () => {
  const { server, io, roomManager } = createLudoCoreServer({
    rootDir: path.resolve(process.cwd()),
    roomOptions: {
      rng: createSeededRng(707),
      disconnectGraceMs: 120,
    },
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let hostSock: ClientSocket | null = null;
  let guest1Sock: ClientSocket | null = null;
  let guest2Sock: ClientSocket | null = null;

  try {
    hostSock = ioClient(baseUrl, { transports: ['websocket'] });
    guest1Sock = ioClient(baseUrl, { transports: ['websocket'] });
    guest2Sock = ioClient(baseUrl, { transports: ['websocket'] });
    await Promise.all([
      new Promise<void>((r) => hostSock!.on('connect', () => r())),
      new Promise<void>((r) => guest1Sock!.on('connect', () => r())),
      new Promise<void>((r) => guest2Sock!.on('connect', () => r())),
    ]);

    const createRes = await emitAck(hostSock, 'ludo:create_room', {
      hostName: 'HostOne',
      wish: [6, 5],
      fillBots: true,
      timerConfig: { enabled: false, duration: 0 },
    });
    assert.equal(createRes.success, true);

    const join1 = await emitAck(guest1Sock, 'ludo:join_room', {
      roomCode: createRes.roomCode,
      playerName: 'GuestOne',
      wish: [6, 4],
    });
    const join2 = await emitAck(guest2Sock, 'ludo:join_room', {
      roomCode: createRes.roomCode,
      playerName: 'GuestTwo',
      wish: [5, 4],
    });
    assert.equal(join1.success, true);
    assert.equal(join2.success, true);

    // Start match so seats 3 and 4 become AI bots
    const startRes = await emitAck(hostSock, 'ludo:start_match', { token: createRes.playerToken });
    assert.equal(startRes.success, true);

    const guest1Whispers: any[] = [];
    const guest2Whispers: any[] = [];
    const guest2Notices: any[] = [];
    guest1Sock.on('voice:whisper', (p) => guest1Whispers.push(p));
    guest2Sock.on('voice:whisper', (p) => guest2Whispers.push(p));
    guest2Sock.on('ludo:whisper_notice', (p) => guest2Notices.push(p));

    const sampleClip = Buffer.alloc(4800, 0x2a);

    // 1. Reject targeting a bot seat (seat 3)
    const botAttempt = await emitAck(hostSock, 'voice:whisper', {
      token: createRes.playerToken,
      toSeats: [3],
      clip: sampleClip,
      mimeType: 'audio/webm',
      duration: 2,
    });
    assert.equal(botAttempt.success, false);

    // 2. Reject oversized clip (> 60_000 bytes)
    const hugeAttempt = await emitAck(hostSock, 'voice:whisper', {
      token: createRes.playerToken,
      toSeats: [1],
      clip: Buffer.alloc(60_500, 0x41),
      mimeType: 'audio/webm',
      duration: 6,
    });
    assert.equal(hugeAttempt.success, false);

    // 3. Valid binary whisper from Host (seat 0) -> GuestOne (seat 1) with spoofed duration overridden by server
    const okRes = await emitAck(hostSock, 'voice:whisper', {
      token: createRes.playerToken,
      toSeats: [1],
      clip: sampleClip,
      mimeType: 'audio/mp4',
      duration: 999,
    });
    assert.equal(okRes.success, true);
    assert.deepEqual(okRes.deliveredTo, [1]);
    assert.equal(okRes.duration, 2); // 4800 / 2500 rounded = 2s (ignores spoofed 999)

    await waitFor(() => guest1Whispers.length === 1 && guest2Notices.length === 1, 1500);
    assert.equal(Buffer.compare(Buffer.from(guest1Whispers[0].clip), sampleClip), 0);
    assert.equal(guest1Whispers[0].mimeType, 'audio/mp4');
    assert.equal(guest1Whispers[0].duration, 2);
    assert.equal(guest1Whispers[0].fromSeat, 0);
    // GuestTwo must NEVER receive the private audio clip, only the metadata notice
    assert.equal(guest2Whispers.length, 0);
    assert.equal(guest2Notices[0].fromSeat, 0);
    assert.deepEqual(guest2Notices[0].toSeats, [1]);
    assert.equal((guest2Notices[0] as any).clip, undefined);

    // 4. 5s rate limit prevents immediate repeat whisper from Host
    const rateLimited = await emitAck(hostSock, 'voice:whisper', {
      token: createRes.playerToken,
      toSeats: [2],
      clip: sampleClip,
      mimeType: 'audio/webm',
      duration: 2,
    });
    assert.equal(rateLimited.success, false);

    // 5. Host enables Secret Whispers -> GuestOne whispers to Host, GuestTwo sees NO notice
    let roomUpdatedSecret = false;
    hostSock.on('ludo:room_updated', (r) => {
      if (r?.secretWhispers === true) roomUpdatedSecret = true;
    });
    hostSock.emit('ludo:toggle_secret_whispers', {
      token: createRes.playerToken,
      secretWhispers: true,
    });
    await waitFor(() => roomUpdatedSecret, 1500);

    const hostWhispers: any[] = [];
    hostSock.on('voice:whisper', (p) => hostWhispers.push(p));

    const secretWhisper = await emitAck(guest1Sock, 'voice:whisper', {
      token: join1.playerToken,
      toSeats: [0],
      clip: sampleClip,
      mimeType: 'audio/webm',
      duration: 2,
    });
    assert.equal(secretWhisper.success, true);
    await waitFor(() => hostWhispers.length === 1, 1500);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(guest2Notices.length, 1); // No new notice in secret mode
    assert.equal(guest2Whispers.length, 0);

    // 6. Disconnected player cannot receive whispers
    let guest1Disconnected = false;
    hostSock.on('ludo:room_updated', (r) => {
      if (r?.seats?.[1]?.connected === false) guest1Disconnected = true;
    });
    guest1Sock.disconnect();
    await waitFor(() => guest1Disconnected, 1500);
    const offlineTargetAttempt = await emitAck(guest2Sock, 'voice:whisper', {
      token: join2.playerToken,
      toSeats: [1],
      clip: sampleClip,
      mimeType: 'audio/webm',
      duration: 2,
    });
    assert.equal(offlineTargetAttempt.success, false);
  } finally {
    hostSock?.disconnect();
    guest1Sock?.disconnect();
    guest2Sock?.disconnect();
    roomManager.dispose();
    io.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('Binary ludo:voice enforces 80KB limit & server duration, and server syncs AI dialogue lineIdx identically to all players', async () => {
  const { server, io, roomManager } = createLudoCoreServer({
    rootDir: path.resolve(process.cwd()),
    roomOptions: {
      rng: createSeededRng(909),
      tickIntervalMs: 25,
      autoPlayRollDelayMs: 50,
      autoPlayMoveDelayMs: 50,
      turnPassDelayMs: 40,
    },
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let hostSock: ClientSocket | null = null;
  let guestSock: ClientSocket | null = null;

  try {
    hostSock = ioClient(baseUrl, { transports: ['websocket'] });
    guestSock = ioClient(baseUrl, { transports: ['websocket'] });
    await Promise.all([
      new Promise<void>((r) => hostSock!.on('connect', () => r())),
      new Promise<void>((r) => guestSock!.on('connect', () => r())),
    ]);

    const createRes = await emitAck(hostSock, 'ludo:create_room', {
      hostName: 'Anees',
      wish: [6, 5],
      fillBots: true,
      timerConfig: { enabled: true, duration: 60 },
    });
    const joinRes = await emitAck(guestSock, 'ludo:join_room', {
      roomCode: createRes.roomCode,
      playerName: 'Shahbaz',
      wish: [6, 4],
    });
    assert.equal(joinRes.success, true);

    const hostVoices: any[] = [];
    const guestVoices: any[] = [];
    const hostAiLines: any[] = [];
    const guestAiLines: any[] = [];

    hostSock.on('ludo:voice', (v) => hostVoices.push(v));
    guestSock.on('ludo:voice', (v) => guestVoices.push(v));
    hostSock.on('ludo:ai_dialogue', (d) => hostAiLines.push(d));
    guestSock.on('ludo:ai_dialogue', (d) => guestAiLines.push(d));

    // 1. Public voice note > 80_000 bytes is rejected
    const tooLargeVoice = await emitAck(hostSock, 'ludo:voice', {
      token: createRes.playerToken,
      audio: Buffer.alloc(81_000, 0x33),
      mimeType: 'audio/webm',
    });
    assert.equal(tooLargeVoice.success, false);

    // 2. Valid binary MP4/AAC voice note <= 80_000 bytes is broadcast as binary with computed duration
    const voicePayload = Buffer.alloc(7500, 0x55);
    const okVoice = await emitAck(hostSock, 'ludo:voice', {
      token: createRes.playerToken,
      audio: voicePayload,
      mimeType: 'audio/mp4;codecs=mp4a.40.2',
      duration: 99,
    });
    assert.equal(okVoice.success, true);
    assert.equal(okVoice.duration, 3); // 7500 / 2500 = 3s

    await waitFor(() => hostVoices.length === 1 && guestVoices.length === 1, 1500);
    assert.equal(Buffer.compare(Buffer.from(guestVoices[0].audio), voicePayload), 0);
    assert.equal(guestVoices[0].mimeType, 'audio/mp4');
    assert.equal(guestVoices[0].duration, 3);

    // 3. Start match & advance turns to Seat 2 (AI Bot) -> Host & Guest receive identical synced AI dialogue lineIdx
    await emitAck(hostSock, 'ludo:start_match', { token: createRes.playerToken });
    const room = roomManager.getInternalRoomForTest(createRes.roomCode);
    assert.ok(room && room.match);

    // Trigger Seat 0 and Seat 1 quick turns or jump to Seat 1 turn finishing so Seat 2 bot takes turn & rolls
    room.match.currentPlayer = 1;
    room.match.hasRolled = true;
    room.match.movesAvailable = [];
    room.match.extraTurnEarned = false;
    room.match.turnExpiresAt = Date.now() - 10;

    await waitFor(() => hostAiLines.length >= 1 && guestAiLines.length >= 1, 2500);
    assert.equal(hostAiLines[0].seatIdx, guestAiLines[0].seatIdx);
    assert.equal(hostAiLines[0].event, guestAiLines[0].event);
    assert.equal(hostAiLines[0].lineIdx, guestAiLines[0].lineIdx);
    assert.ok(hostAiLines[0].lineIdx >= 0 && hostAiLines[0].lineIdx < 5);
    assert.equal((hostAiLines[0] as any).text, undefined);
  } finally {
    hostSock?.disconnect();
    guestSock?.disconnect();
    roomManager.dispose();
    io.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

