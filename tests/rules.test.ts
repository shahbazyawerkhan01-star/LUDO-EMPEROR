import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLucky7IfEligible,
  applySplitSacrifice,
  canMovePawn,
  checkCompulsoryCapturePenalty,
  checkSevenRollConditions,
  cloneDefaultPlayers,
  createInitialPawns,
  createInitialPlayerStats,
  createSeededRng,
  executePawnMove,
  extractPlayerEmoji,
  extractPlayerInitial,
  getLegalMoves,
  getPawnPath,
  getPlayerRankings,
  getPossibleCaptures,
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

test('Split Sacrifice returns left-behind partner on non-safe square back to base', () => {
  const path0 = getPawnPath(0);
  const path1 = getPawnPath(1);

  // Pick a non-safe start square for seat 0 where startPos + 5 hits seat 1 on another non-safe square
  let startPos = -1;
  let targetP1Pos = -1;
  for (let i = 10; i < 45; i++) {
    const s0 = path0[i];
    const s5 = path0[i + 5];
    if ((s0.c === 2 && s0.r === 4) || (s0.c === 0 && s0.r === 3)) continue;
    if ((s5.c === 2 && s5.r === 4) || (s5.c === 0 && s5.r === 3)) continue;
    const oppIdx = path1.findIndex((s) => !s.isHome && s.arm === s5.arm && s.c === s5.c && s.r === s5.r);
    if (oppIdx >= 0) {
      startPos = i;
      targetP1Pos = oppIdx;
      break;
    }
  }
  assert.ok(startPos >= 10 && targetP1Pos >= 0);

  const pawns = createInitialPawns();
  const stats = createInitialPlayerStats();
  pawns[0][0] = { status: 'on-path', pos: startPos };
  pawns[0][1] = { status: 'on-path', pos: startPos };
  pawns[1][0] = { status: 'on-path', pos: targetP1Pos };

  const caps = getPossibleCaptures(pawns, 0, [2, 3], [2, 3]);
  assert.ok(caps.some((c) => c.diceIndices.length === 2));

  // Moving pawn 0 first with die 0 (2 steps) splits pair on non-safe startPos
  executePawnMove(pawns, stats, 0, 0, 2, [2, 3], [2, 3]);
  const sacrificed = applySplitSacrifice(pawns, 0, 0, startPos, caps, 0);
  assert.equal(sacrificed, true);
  assert.equal(pawns[0][1].status, 'home');
  assert.equal(pawns[0][1].pos, -1);
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

