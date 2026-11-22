import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLucky7IfEligible,
  canMovePawn,
  checkCompulsoryCapturePenalties,
  checkCompulsoryCapturePenalty,
  checkSevenRollConditions,
  cloneDefaultPlayers,
  createInitialPawns,
  createInitialPlayerStats,
  createSeededRng,
  evaluateCaptureObligation,
  executePawnMove,
  extractPlayerEmoji,
  extractPlayerInitial,
  getLegalMoves,
  getPawnPath,
  getPlayerRankings,
  getPossibleCaptures,
  getPossiblePairCaptures,
  isMovePartOfCaptureSequence,
  rollDicePair,
} from '../src/game/rules';
import { validateMatchResultsInput } from '../server/supabaseRecords';

test('Seeded RNG produces identical deterministic dice streams', () => {
  const rngA = createSeededRng(123456);
  const rngB = createSeededRng(123456);
  const rngC = createSeededRng(999999);

  const rollsA = Array.from({ length: 20 }, () => rollDicePair(rngA));
  const rollsB = Array.from({ length: 20 }, () => rollDicePair(rngB));
  const rollsC = Array.from({ length: 20 }, () => rollDicePair(rngC));

  assert.deepEqual(rollsA, rollsB);
  assert.notDeepEqual(rollsA, rollsC);
  for (const [d1, d2] of rollsA) {
    assert.ok(d1 >= 1 && d1 <= 6);
    assert.ok(d2 >= 1 && d2 <= 6);
  }
});

test('Lucky 7 converts 1+6 / 2+5 / 3+4 into [6,6] ONLY when 0 tokens are on open track', () => {
  const pawns = createInitialPawns();
  assert.equal(checkSevenRollConditions(pawns, 0), true);

  for (const pair of [
    [1, 6],
    [2, 5],
    [3, 4],
  ] as Array<[number, number]>) {
    const res = applyLucky7IfEligible(pawns, 0, pair, false);
    assert.equal(res.applied, true);
    assert.deepEqual(res.dice, [6, 6]);
  }

  // Already used this turn -> blocked
  assert.equal(applyLucky7IfEligible(pawns, 0, [3, 4], true).applied, false);

  // Pawn safely inside coloured home stretch (pos >= 63) still qualifies if >=1 in base
  pawns[0][0] = { status: 'on-path', pos: 64 };
  assert.equal(checkSevenRollConditions(pawns, 0), true);
  assert.equal(applyLucky7IfEligible(pawns, 0, [2, 5], false).applied, true);

  // Pawn on open running track (0..62) disqualifies Lucky 7
  pawns[0][1] = { status: 'on-path', pos: 10 };
  assert.equal(checkSevenRollConditions(pawns, 0), false);
  assert.equal(applyLucky7IfEligible(pawns, 0, [1, 6], false).applied, false);
});

test('Unlimited 6+6 moves never forfeit or cap turns after 3 consecutive sixes', () => {
  const pawns = createInitialPawns();
  const stats = createInitialPlayerStats();
  pawns[0][0] = { status: 'on-path', pos: 0 };

  // Advance a pawn 4 consecutive times on [6, 6] without any 3-six limit blocking moves
  for (let round = 0; round < 4; round++) {
    const out1 = executePawnMove(pawns, stats, 0, 0, 6, [6, 6], [6, 6]);
    const out2 = executePawnMove(pawns, stats, 0, 0, 6, [6, 6], [6]);
    assert.equal(out1.moved, true);
    assert.equal(out2.moved, true);
  }
  assert.equal(pawns[0][0].pos, 48);
  assert.equal(pawns[0][0].status, 'on-path');
});

test('Stack Protection: myCount >= otherCount captures, while myCount < otherCount is blocked', () => {
  const path0 = getPawnPath(0);
  const path1 = getPawnPath(1);

  // Find a common non-safe shared square (pos >= 5 for seat 0 matching some open-track pos for seat 1)
  let p0Pos = -1;
  let p1Pos = -1;
  for (let i = 5; i < 55; i++) {
    const sp0 = path0[i];
    if (sp0.c === 2 && sp0.r === 4) continue;
    if (sp0.c === 0 && sp0.r === 3) continue;
    const matchIdx = path1.findIndex((s) => !s.isHome && s.arm === sp0.arm && s.c === sp0.c && s.r === sp0.r);
    if (matchIdx >= 0) {
      p0Pos = i;
      p1Pos = matchIdx;
      break;
    }
  }
  assert.ok(p0Pos >= 5 && p1Pos >= 0);

  // Case A: 2 stacked defenders vs 1 lone attacker -> capture blocked
  const pawnsA = createInitialPawns();
  const statsA = createInitialPlayerStats();
  pawnsA[0][0] = { status: 'on-path', pos: p0Pos - 4 };
  pawnsA[1][0] = { status: 'on-path', pos: p1Pos };
  pawnsA[1][1] = { status: 'on-path', pos: p1Pos };

  const outBlocked = executePawnMove(pawnsA, statsA, 0, 0, 4, [4, 2], [4, 2]);
  assert.equal(outBlocked.moved, true);
  assert.equal(outBlocked.capturedVictims.length, 0);
  assert.equal(pawnsA[1][0].status, 'on-path');
  assert.equal(pawnsA[1][1].status, 'on-path');

  // Case B: 2 attackers (one already sitting on square + one landing) vs 2 defenders -> captures BOTH
  const pawnsB = createInitialPawns();
  const statsB = createInitialPlayerStats();
  pawnsB[0][0] = { status: 'on-path', pos: p0Pos - 4 };
  pawnsB[0][1] = { status: 'on-path', pos: p0Pos };
  pawnsB[1][0] = { status: 'on-path', pos: p1Pos };
  pawnsB[1][1] = { status: 'on-path', pos: p1Pos };

  const outCapture = executePawnMove(pawnsB, statsB, 0, 0, 4, [4, 2], [4, 2]);
  assert.equal(outCapture.moved, true);
  assert.equal(outCapture.capturedVictims.length, 2);
  assert.equal(statsB[0].captures_made, 2);
  assert.equal(statsB[1].times_captured, 2);
  assert.equal(pawnsB[1][0].status, 'home');
});

test('Lone Token Rule requires combined die sum when entering coloured stretch (63..68)', () => {
  const pawns = createInitialPawns();
  // 1 active runner on track, rest in base
  pawns[0][0] = { status: 'on-path', pos: 61 };

  // Roll [3, 2]: entering coloured path (61 -> 64) via single die 3 must be blocked because combined is 5
  assert.equal(canMovePawn(pawns, 0, 0, 3, [3, 2], [3, 2]), false);
  // Combined 5 step move reaches 66 cleanly
  assert.equal(canMovePawn(pawns, 0, 0, 5, [3, 2], [3, 2]), true);

  const legals = getLegalMoves(pawns, 0, [3, 2], [3, 2]);
  assert.ok(legals.some((m) => m.dieIdx === 'combined' && m.steps === 5));
  assert.ok(!legals.some((m) => m.dieIdx === 0 && m.steps === 3));
});

test('Splitting a double stack keeps partner on track, and a lone token sitting on a pair can be captured normally', () => {
  const path0 = getPawnPath(0);
  const path1 = getPawnPath(1);
  const path2 = getPawnPath(2);

  // Pick a shared non-safe open square across seats 0, 1, 2
  let p0Pos = -1;
  let p1Pos = -1;
  let p2Pos = -1;
  for (let i = 10; i < 45; i++) {
    const s0 = path0[i];
    if ((s0.c === 2 && s0.r === 4) || (s0.c === 0 && s0.r === 3)) continue;
    const m1 = path1.findIndex((s) => !s.isHome && s.arm === s0.arm && s.c === s0.c && s.r === s0.r);
    const m2 = path2.findIndex((s) => !s.isHome && s.arm === s0.arm && s.c === s0.c && s.r === s0.r);
    if (m1 >= 4 && m2 >= 4) {
      p0Pos = i;
      p1Pos = m1;
      p2Pos = m2;
      break;
    }
  }
  assert.ok(p0Pos >= 10 && p1Pos >= 4 && p2Pos >= 4);

  const pawns = createInitialPawns();
  const stats = createInitialPlayerStats();
  // Seat 0 has a 2-token shield at p0Pos; Seat 1 has 1 lone pawn 3 steps away; Seat 2 has 1 lone pawn 2 steps away
  pawns[0][0] = { status: 'on-path', pos: p0Pos };
  pawns[0][1] = { status: 'on-path', pos: p0Pos };
  pawns[1][0] = { status: 'on-path', pos: p1Pos - 3 };
  pawns[2][0] = { status: 'on-path', pos: p2Pos - 2 };

  // Seat 1 lone token lands on Seat 0's 2-token shield: cannot capture Seat 0, sits on that square
  const outB = executePawnMove(pawns, stats, 1, 0, 3, [3, 1], [3, 1]);
  assert.equal(outB.moved, true);
  assert.equal(outB.capturedVictims.length, 0);
  assert.equal(pawns[0][0].status, 'on-path');
  assert.equal(pawns[0][1].status, 'on-path');
  assert.equal(pawns[1][0].status, 'on-path');
  assert.equal(pawns[1][0].pos, p1Pos);

  // Seat 2 lone token lands on the same square: captures Seat 1's lone token (not shielded by Seat 0's pair), while Seat 0's pair stays safe
  const outC = executePawnMove(pawns, stats, 2, 0, 2, [2, 4], [2, 4]);
  assert.equal(outC.moved, true);
  assert.equal(outC.capturedVictims.length, 1);
  assert.deepEqual(outC.capturedVictims[0], { playerIdx: 1, pawnIdx: 0 });
  assert.equal(pawns[1][0].status, 'home');
  assert.equal(pawns[0][0].status, 'on-path');
  assert.equal(pawns[0][1].status, 'on-path');

  // Moving one token from Seat 0's 2-token stack leaves the partner pawn on-path (no automatic sacrifice)
  const outSplit = executePawnMove(pawns, stats, 0, 0, 2, [2, 3], [2, 3]);
  assert.equal(outSplit.moved, true);
  assert.equal(pawns[0][0].pos, p0Pos + 2);
  assert.equal(pawns[0][1].status, 'on-path');
  assert.equal(pawns[0][1].pos, p0Pos);
});

test('Compulsory Capture Penalty penalizes missed capture and forgives when capture succeeded', () => {
  const pawns = createInitialPawns();
  const stats = createInitialPlayerStats();
  pawns[0][0] = { status: 'on-path', pos: 12 };
  const fakeCap = [{ pawnIdx: 0, diceIndices: [0], targetPlayer: 1, targetPawn: 0, targetPos: 15 }];

  // Forgiven when capture happened
  const forgiven = checkCompulsoryCapturePenalty(pawns, stats, 0, fakeCap, true, 'capture');
  assert.equal(forgiven, null);
  assert.equal(stats[0].penalties, 0);

  // Penalized when capture was missed
  const penalized = checkCompulsoryCapturePenalty(pawns, stats, 0, fakeCap, false, null);
  assert.equal(penalized, 0);
  assert.equal(pawns[0][0].status, 'home');
  assert.equal(stats[0].penalties, 1);
});

test('5-Player Rankings, Rank 4-5 Initial/Emoji Helpers, and Supabase Validation', () => {
  const players = cloneDefaultPlayers();
  const pawns = createInitialPawns();
  const stats = createInitialPlayerStats();

  // Seat 2 finishes all 4 pawns to claim rank 1
  for (let i = 0; i < 4; i++) pawns[2][i] = { status: 'finished', pos: 68 };
  pawns[0][0] = { status: 'on-path', pos: 40 };
  pawns[1][0] = { status: 'on-path', pos: 25 };
  pawns[3][0] = { status: 'on-path', pos: 10 };
  // Seat 4 stays at 0%
  stats[2].captures_made = 2;
  stats[0].times_captured = 1;
  stats[4].times_captured = 1;

  const rankings = getPlayerRankings(pawns, players, stats, 2);
  assert.equal(rankings.length, 5);
  assert.equal(rankings[0].seat, 2);
  assert.equal(rankings[0].rank, 1);
  assert.equal(rankings[4].seat, 4);
  assert.equal(rankings[4].rank, 5);

  // Supabase validator accepts valid 5-player output
  const ok = validateMatchResultsInput(rankings);
  assert.equal(ok.valid, true);
  assert.equal(ok.rows.length, 5);

  // Rejects mismatched captures or out-of-range seats
  const badCapture = validateMatchResultsInput(
    rankings.map((r, i) => (i === 0 ? { ...r, captures_made: 9 } : r)),
  );
  assert.equal(badCapture.valid, false);

  const badSeat = validateMatchResultsInput(
    rankings.map((r, i) => (i === 4 ? { ...r, seat: 5 } : r)),
  );
  assert.equal(badSeat.valid, false);

  // Rank 4 & 5 HUD label formatting rules (emoji without numbers, clean initial)
  assert.equal(extractPlayerEmoji('🔥 Zoi #12ab'), '🔥');
  assert.equal(extractPlayerEmoji('1️⃣ Player'), '');
  assert.equal(extractPlayerInitial('🔥 Zoi #12ab'), 'Z');
});

test('Centre Home (Gul) completion marks token finished when reaching pos 68', () => {
  const pawns = createInitialPawns();
  const stats = createInitialPlayerStats();
  pawns[0][0] = { status: 'finished', pos: 68 };
  pawns[0][1] = { status: 'finished', pos: 68 };
  pawns[0][2] = { status: 'finished', pos: 68 };
  pawns[0][3] = { status: 'on-path', pos: 65 };

  // Single die 3 out of [3, 2] is blocked by Lone Token full-total entry rule
  assert.equal(canMovePawn(pawns, 0, 3, 3, [3, 2], [3, 2]), false);

  // Full combined roll of 3 ([1, 2]) finishes cleanly at pos 68 (Centre Home)
  const out = executePawnMove(pawns, stats, 0, 3, 3, [1, 2], [1, 2]);
  assert.equal(out.moved, true);
  assert.equal(out.reachedCenterHome, true);
  assert.equal(pawns[0][3].status, 'finished');
  assert.equal(out.wonMatch, true);
});

test('2-Token Pair Capture detection, obligation, Coach check, and multi-token penalty', () => {
  const path0 = getPawnPath(0);
  const path1 = getPawnPath(1);

  let targetP0Pos = -1;
  let targetP1Pos = -1;
  for (let i = 15; i < 45; i++) {
    const sp0 = path0[i];
    if ((sp0.c === 2 && sp0.r === 4) || (sp0.c === 0 && sp0.r === 3)) continue;
    const match = path1.findIndex((s) => !s.isHome && s.arm === sp0.arm && s.c === sp0.c && s.r === sp0.r);
    if (match >= 0) {
      targetP0Pos = i;
      targetP1Pos = match;
      break;
    }
  }
  assert.ok(targetP0Pos >= 15 && targetP1Pos >= 0);

  const pawns = createInitialPawns();
  const stats = createInitialPlayerStats();
  // Seat 0 has Pawn 0 at target - 2, Pawn 1 at target - 4; Seat 1 has a 2-token stack at target
  pawns[0][0] = { status: 'on-path', pos: targetP0Pos - 2 };
  pawns[0][1] = { status: 'on-path', pos: targetP0Pos - 4 };
  pawns[0][2] = { status: 'on-path', pos: 6 };
  pawns[1][0] = { status: 'on-path', pos: targetP1Pos };
  pawns[1][1] = { status: 'on-path', pos: targetP1Pos };

  const pairCaps = getPossiblePairCaptures(pawns, 0, [2, 4], [2, 4]);
  assert.ok(pairCaps.length >= 2);

  const ob = evaluateCaptureObligation(pawns, 0, [2, 4], [2, 4]);
  assert.equal(ob.requiredCaptures, 1);
  assert.equal(ob.singleCaptures.length, 0);
  assert.deepEqual(ob.candidatePawns, [0, 1]);

  // Moving Pawn 0 by die 0 (2 steps) or Pawn 1 by die 1 (4 steps) starts the pair capture (no Coach warning)
  assert.equal(isMovePartOfCaptureSequence(pawns, 0, 0, 2, 0, [2, 4], [2, 4]), true);
  assert.equal(isMovePartOfCaptureSequence(pawns, 0, 1, 4, 1, [2, 4], [2, 4]), true);
  // Moving Pawn 2 instead skips the pair capture (triggers Coach warning)
  assert.equal(isMovePartOfCaptureSequence(pawns, 0, 2, 2, 0, [2, 4], [2, 4]), false);

  // If player skips the pair capture (0 captures made), BOTH candidate pawns [0, 1] go back to base
  const penalized = checkCompulsoryCapturePenalties(pawns, stats, 0, ob.requiredCaptures, 0, ob.candidatePawns);
  assert.deepEqual(penalized, [0, 1]);
  assert.equal(pawns[0][0].status, 'home');
  assert.equal(pawns[0][1].status, 'home');
  assert.equal(pawns[0][2].status, 'on-path');
  assert.equal(stats[0].penalties, 2);
});

test('2 independent single-die captures require 2 captures and penalize only the skipped 2nd candidate', () => {
  const path0 = getPawnPath(0);
  const path1 = getPawnPath(1);
  const path2 = getPawnPath(2);

  let targetA0 = -1;
  let targetA1 = -1;
  let targetB0 = -1;
  let targetB2 = -1;
  for (let i = 10; i < 30; i++) {
    const sp0 = path0[i];
    if ((sp0.c === 2 && sp0.r === 4) || (sp0.c === 0 && sp0.r === 3)) continue;
    const m1 = path1.findIndex((s) => !s.isHome && s.arm === sp0.arm && s.c === sp0.c && s.r === sp0.r);
    if (m1 >= 0 && targetA0 === -1) {
      targetA0 = i;
      targetA1 = m1;
      continue;
    }
    const m2 = path2.findIndex((s) => !s.isHome && s.arm === sp0.arm && s.c === sp0.c && s.r === sp0.r);
    if (m2 >= 0 && i > targetA0 + 4 && targetA0 !== -1) {
      targetB0 = i;
      targetB2 = m2;
      break;
    }
  }
  assert.ok(targetA0 >= 10 && targetB0 > targetA0);

  const pawns = createInitialPawns();
  const stats = createInitialPlayerStats();
  pawns[0][0] = { status: 'on-path', pos: targetA0 - 3 };
  pawns[0][1] = { status: 'on-path', pos: targetB0 - 5 };
  pawns[1][0] = { status: 'on-path', pos: targetA1 };
  pawns[2][0] = { status: 'on-path', pos: targetB2 };

  const ob = evaluateCaptureObligation(pawns, 0, [3, 5], [3, 5]);
  assert.equal(ob.requiredCaptures, 2);
  assert.deepEqual(ob.candidatePawns, [0, 1]);

  // Execute Capture #1 with Pawn 0 (3 steps), then skip Capture #2 with Pawn 1
  const cap1 = executePawnMove(pawns, stats, 0, 0, 3, [3, 5], [3, 5]);
  assert.equal(cap1.capturedVictims.length, 1);

  const penalized = checkCompulsoryCapturePenalties(pawns, stats, 0, 2, 1, ob.candidatePawns, [1], [0]);
  assert.deepEqual(penalized, [1]);
  assert.equal(pawns[0][0].status, 'on-path');
  assert.equal(pawns[0][1].status, 'home');
  assert.equal(stats[0].penalties, 1);
});


