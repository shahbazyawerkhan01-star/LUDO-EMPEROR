import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLucky7IfEligible,
  BACKGROUNDS,
  BOARD_THEMES,
  canAnyPawnMove,
  canMovePawn,
  CENTER_HOME_POS,
  DEFAULT_ENVIRONMENT_ID,
  checkCompulsoryCapturePenalties,
  checkCompulsoryCapturePenalty,
  checkSevenRollConditions,
  cloneDefaultPlayers,
  COLORED_PATH_START_POS,
  createInitialPawns,
  createInitialPlayerStats,
  createSeededRng,
  evaluateCaptureObligation,
  evaluateRivalryState,
  executePawnMove,
  extractPlayerEmoji,
  extractPlayerInitial,
  getContrastPipColor,
  getLegalMoves,
  getPawnPath,
  getPlayerColor,
  getPlayerRankings,
  getPossibleCaptures,
  getPossiblePairCaptures,
  hexToRgb,
  isMovePartOfCaptureSequence,
  pickBestAIMove,
  resolvePawnTapMove,
  resolveSeatDicePalette,
  rollDicePair,
  shadeRgb,
  shouldPromptGulChoice,
  VALID_ENVIRONMENT_IDS,
} from '../src/game/rules';
import { validateMatchResultsInput } from '../server/supabaseRecords';
import { MUSIC_TRACKS } from '../src/game/sfx';
import {
  ANIMAL_TOKENS,
  CHARACTER_TOKENS,
  drawAnimalGroundAura,
  getTokenLocomotionMode,
  HUMAN_CHARACTER_TOKENS,
  isAnimalCharacter,
  pickRandomAiSeatTokenOverrides,
  resolveCharacterGender,
  resolveCharacterId,
  TOKEN_STYLE_OPTIONS,
} from '../src/game/characterTokens';
import { getDefaultPreferences } from '../src/sdk/runSdk';
import { useGameStore } from '../src/state/store';

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

test('Lone Token Rule requires combined die sum when entering coloured stretch (64..69)', () => {
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
  for (let i = 0; i < 4; i++) pawns[2][i] = { status: 'finished', pos: CENTER_HOME_POS };
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

test('Centre Home (Gul) completion marks token finished when reaching pos 69', () => {
  const pawns = createInitialPawns();
  const stats = createInitialPlayerStats();
  pawns[0][0] = { status: 'finished', pos: CENTER_HOME_POS };
  pawns[0][1] = { status: 'finished', pos: CENTER_HOME_POS };
  pawns[0][2] = { status: 'finished', pos: CENTER_HOME_POS };
  pawns[0][3] = { status: 'on-path', pos: 66 };

  // Single die 3 out of [3, 2] is blocked by Lone Token full-total entry rule
  assert.equal(canMovePawn(pawns, 0, 3, 3, [3, 2], [3, 2]), false);

  // Full combined roll of 3 ([1, 2]) finishes cleanly at pos 69 (Centre Home)
  const out = executePawnMove(pawns, stats, 0, 3, 3, [1, 2], [1, 2]);
  assert.equal(out.moved, true);
  assert.equal(out.reachedCenterHome, true);
  assert.equal(pawns[0][3].status, 'finished');
  assert.equal(pawns[0][3].pos, CENTER_HOME_POS);
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

test('evaluateRivalryState escalates across normal, heat, and dethrone tiers', () => {
  const pawns = createInitialPawns();

  // Normal early match
  pawns[1][0] = { status: 'on-path', pos: 15 };
  pawns[2][0] = { status: 'on-path', pos: 12 };
  const normal = evaluateRivalryState(pawns, -1);
  assert.equal(normal.leaderIdx, 1);
  assert.equal(normal.tier, 'normal');

  // Heat tier: leader >= 30% with >= 12% margin (2 finished + 1 far runner ~= 65%)
  pawns[1][1] = { status: 'finished', pos: CENTER_HOME_POS };
  pawns[1][2] = { status: 'on-path', pos: 45 };
  const heat = evaluateRivalryState(pawns, -1);
  assert.equal(heat.leaderIdx, 1);
  assert.ok(heat.tier === 'heat' || heat.tier === 'dethrone');

  // Dethrone tier: leader >= 75% (3 finished pawns + 1 on path)
  pawns[1][0] = { status: 'finished', pos: CENTER_HOME_POS };
  pawns[1][2] = { status: 'finished', pos: CENTER_HOME_POS };
  pawns[1][3] = { status: 'on-path', pos: 30 };
  const dethrone = evaluateRivalryState(pawns, -1);
  assert.equal(dethrone.leaderIdx, 1);
  assert.equal(dethrone.tier, 'dethrone');
  assert.ok(dethrone.leaderPct >= 75);
});

test('pickBestAIMove prioritizes Leader capture over neutral and Grudge over neutral', () => {
  const path0 = getPawnPath(0);
  const path1 = getPawnPath(1);
  const path2 = getPawnPath(2);

  let capA0 = -1;
  let capA1 = -1;
  let capB0 = -1;
  let capB2 = -1;
  for (let i = 10; i < 40; i++) {
    const sp0 = path0[i];
    if ((sp0.c === 2 && sp0.r === 4) || (sp0.c === 0 && sp0.r === 3)) continue;
    const m1 = path1.findIndex((s) => !s.isHome && s.arm === sp0.arm && s.c === sp0.c && s.r === sp0.r);
    if (m1 >= 0 && capA0 === -1) {
      capA0 = i;
      capA1 = m1;
      continue;
    }
    const m2 = path2.findIndex((s) => !s.isHome && s.arm === sp0.arm && s.c === sp0.c && s.r === sp0.r);
    if (m2 >= 0 && capA0 !== -1 && i > capA0 + 5) {
      capB0 = i;
      capB2 = m2;
      break;
    }
  }
  assert.ok(capA0 >= 10 && capB0 > capA0);

  // Seat 1 is the clear Leader; Seat 2 is behind, yet closer/higher targetPos normally
  const pawns = createInitialPawns();
  pawns[0][0] = { status: 'on-path', pos: capA0 - 3 }; // can capture Seat 1 (Leader) with die 3
  pawns[0][1] = { status: 'on-path', pos: capB0 - 5 }; // can capture Seat 2 (non-leader, higher pos) with die 5
  pawns[1][0] = { status: 'on-path', pos: capA1 };
  pawns[1][1] = { status: 'finished', pos: CENTER_HOME_POS };
  pawns[1][2] = { status: 'finished', pos: CENTER_HOME_POS };
  pawns[2][0] = { status: 'on-path', pos: capB2 };

  const leaderPick = pickBestAIMove(pawns, 0, [3, 5], [3, 5], {
    personality: 'Rival',
    grudgeTargetIdx: 2,
  });
  assert.ok(leaderPick.move);
  assert.equal(leaderPick.hitsLeader, true);
  assert.equal(leaderPick.move.pawnIdx, 0);

  // If Seat 1 is NOT leader and Seat 3 holds a distant lead with no capture available on Seat 3,
  // Grudge target Seat 2 beats neutral target Seat 1
  const pawnsGrudge = createInitialPawns();
  pawnsGrudge[0][0] = { status: 'on-path', pos: capA0 - 3 }; // can capture Seat 1 (at lower pos)
  pawnsGrudge[0][1] = { status: 'on-path', pos: capB0 - 5 }; // can capture Seat 2 (grudge target)
  pawnsGrudge[1][0] = { status: 'on-path', pos: capA1 };
  pawnsGrudge[2][0] = { status: 'on-path', pos: capB2 };
  pawnsGrudge[3][0] = { status: 'finished', pos: CENTER_HOME_POS };
  pawnsGrudge[3][1] = { status: 'finished', pos: CENTER_HOME_POS };
  const grudgePick = pickBestAIMove(pawnsGrudge, 0, [3, 5], [3, 5], {
    personality: 'Strategist',
    grudgeTargetIdx: 2,
  });
  assert.ok(grudgePick.move);
  assert.equal(grudgePick.hitsGrudge, true);
  assert.equal(grudgePick.hitsLeader, false);
  assert.equal(grudgePick.move.pawnIdx, 1);
});

test('3D Character & Animal Tokens preserve Default by default and resolve all 10 human + 10 animal archetypes', () => {
  const defPrefs = getDefaultPreferences();
  assert.equal(defPrefs.tokenStyle, 'default');
  assert.equal(defPrefs.tokenGenderMode, 'auto');

  assert.equal(HUMAN_CHARACTER_TOKENS.length, 10);
  assert.equal(ANIMAL_TOKENS.length, 10);
  assert.equal(CHARACTER_TOKENS.length, 20);
  assert.equal(TOKEN_STYLE_OPTIONS[0].value, 'default');
  assert.equal(resolveCharacterId('default', 0), null);
  assert.equal(resolveCharacterId('belly_dancer', 2), 'belly_dancer');
  assert.equal(resolveCharacterId('animal_lion', 1), 'animal_lion');

  const mix = [0, 1, 2, 3, 4].map((seat) => resolveCharacterId('squad_mix', seat));
  assert.equal(new Set(mix).size, 5);
  assert.equal(mix.every((id) => !isAnimalCharacter(id)), true);

  const animalMix = [0, 1, 2, 3, 4].map((seat) => resolveCharacterId('animal_mix', seat));
  assert.equal(new Set(animalMix).size, 5);
  assert.equal(animalMix.every((id) => isAnimalCharacter(id)), true);

  const strongmanMeta = HUMAN_CHARACTER_TOKENS.find((c) => c.id === 'strongman');
  assert.ok(strongmanMeta && /twin-dumbbell/i.test(strongmanMeta.poseSummary));

  assert.equal(resolveCharacterGender('auto', 'female'), 'girl');
  assert.equal(resolveCharacterGender('auto', 'male'), 'boy');
  assert.equal(resolveCharacterGender('girl', 'male'), 'girl');
  assert.equal(resolveCharacterGender('boy', 'female'), 'boy');
});

test('Own arm includes corner turn square (c=1,r=5) before coloured path and aligns 70-step indices', () => {
  for (let seat = 0; seat < 5; seat++) {
    const path = getPawnPath(seat);
    assert.equal(path.length, 70);
    assert.deepEqual(path[60], { arm: seat, c: 0, r: 3 }); // safe star before coloured path
    assert.deepEqual(path[62], { arm: seat, c: 0, r: 5 });
    assert.deepEqual(path[63], { arm: seat, c: 1, r: 5 }); // outer middle turn square
    assert.deepEqual(path[COLORED_PATH_START_POS], { arm: seat, c: 1, r: 4 }); // 1st coloured square
    assert.deepEqual(path[68], { arm: seat, c: 1, r: 0 }); // 5th coloured square
    assert.equal(path[CENTER_HOME_POS].isHome, true);
  }
});

test('Lone token on safe square [5, 2] combines 7 cleanly and never blocks second die after split', () => {
  const pawns = createInitialPawns();
  const stats = createInitialPlayerStats();
  pawns[0][0] = { status: 'finished', pos: CENTER_HOME_POS };
  pawns[0][1] = { status: 'finished', pos: CENTER_HOME_POS };
  pawns[0][2] = { status: 'on-path', pos: 60 }; // safe star before coloured path
  // pawn 3 stays in base so match is ongoing

  // Tapping lone token at pos 60 with [5, 2] prioritizes combined 7 (60 -> 67)
  const tapChoice = resolvePawnTapMove(pawns, 0, 2, [5, 2], [5, 2], 0, false);
  assert.deepEqual(tapChoice, { dieIdx: 'combined', steps: 7 });

  // Even if user explicitly plays 2 first (60 -> 62), remaining 5 is NOT blocked by fullTurnRoll (62 -> 67)
  const out2 = executePawnMove(pawns, stats, 0, 2, 2, [5, 2], [5, 2]);
  assert.equal(out2.moved, true);
  assert.equal(pawns[0][2].pos, 62);
  assert.equal(canMovePawn(pawns, 0, 2, 5, [5, 2], [5]), true);
  const out5 = executePawnMove(pawns, stats, 0, 2, 5, [5, 2], [5]);
  assert.equal(out5.moved, true);
  assert.equal(pawns[0][2].pos, 67);
});

test('Gul or Pass prompts ONLY for lone token on full total roll, auto-passes unplayable split, and skips prompt for multi-token', () => {
  // 1) Lone token inside coloured path (pos 64) with [3, 2] -> combined 5 reaches Gul (69) & asks Gul/Pass
  const pawnsLoneCol = createInitialPawns();
  pawnsLoneCol[0][0] = { status: 'finished', pos: CENTER_HOME_POS };
  pawnsLoneCol[0][1] = { status: 'on-path', pos: 64 };
  const tapGul = resolvePawnTapMove(pawnsLoneCol, 0, 1, [3, 2], [3, 2], 0, false);
  assert.deepEqual(tapGul, { dieIdx: 'combined', steps: 5 });
  assert.equal(shouldPromptGulChoice(pawnsLoneCol, 0, 5, 'combined', [3, 2]), true);

  // 2) Lone token 3 away from Gul (pos 66) with [3, 5] -> 3 alone cannot Gul when 5 cannot move -> Auto Pass (no moves)
  const pawnsAutoPass = createInitialPawns();
  pawnsAutoPass[0][0] = { status: 'finished', pos: CENTER_HOME_POS };
  pawnsAutoPass[0][1] = { status: 'on-path', pos: 66 };
  assert.equal(canAnyPawnMove(pawnsAutoPass, 0, [3, 5], [3, 5]), false);

  // 3) 2 tokens on track (pos 66 + pos 10) with [3, 2] -> single die 3 enters Gul directly WITHOUT Gul/Pass modal
  const pawnsMulti = createInitialPawns();
  pawnsMulti[0][0] = { status: 'on-path', pos: 66 };
  pawnsMulti[0][1] = { status: 'on-path', pos: 10 };
  assert.equal(canMovePawn(pawnsMulti, 0, 0, 3, [3, 2], [3, 2]), true);
  assert.equal(shouldPromptGulChoice(pawnsMulti, 0, 3, 0, [3, 2]), false);
});

test('Classic backgrounds restored, 10 Board Worlds active, and original non-duplicate BGM tracks restored', () => {
  assert.equal(BACKGROUNDS.length, 7);
  assert.deepEqual(
    BACKGROUNDS.map((b) => b.id),
    [
      'none',
      'bg_led_display',
      'bg_wood_table',
      'bg_royal_velvet',
      'bg_marble_hall',
      'bg_neon_cyber',
      'bg_golden_palace',
    ],
  );

  const expectedBoardIds = [
    'classic',
    'jungle',
    'pool',
    'dance',
    'museum',
    'cliff',
    'galaxy',
    'desert',
    'city',
    'volcano',
    'arctic',
  ];
  assert.deepEqual(Object.keys(BOARD_THEMES), expectedBoardIds);
  assert.equal(VALID_ENVIRONMENT_IDS.has('studio_dark'), false);
  assert.equal(VALID_ENVIRONMENT_IDS.has('env_jungle'), false);
  assert.equal(VALID_ENVIRONMENT_IDS.has('bg_led_display'), true);
  assert.equal(VALID_ENVIRONMENT_IDS.has('none'), true);
  assert.equal(DEFAULT_ENVIRONMENT_ID, 'none');
  assert.equal(getDefaultPreferences().backgroundId, DEFAULT_ENVIRONMENT_ID);

  // Only original clean BGM tracks + none + custom (no extra overlapping/double-added tracks)
  assert.deepEqual(
    MUSIC_TRACKS.map((t) => t.id),
    ['none', 'bgm_classic_ludo', 'bgm_royal_ambience', 'bgm_modern_beats', 'custom'],
  );
  Object.values(BOARD_THEMES).forEach((theme) => {
    assert.equal(VALID_ENVIRONMENT_IDS.has(theme.bgId), true);
  });
});

test('Per-seat dice styling computes seat face color, 0.72/0.52 shades, and luminance-aware pips', () => {
  // Classic Bright Yellow seat (4) -> dark charcoal pips; Darker seats (Blue 0, Green 2, Red 3) -> crisp white pips
  const yellowPalette = resolveSeatDicePalette(4, false, 'classic');
  assert.equal(yellowPalette.seatHex, getPlayerColor(4, false));
  assert.deepEqual(yellowPalette.faceRgb, hexToRgb('#f1c40f'));
  assert.equal(yellowPalette.pipColor, '#2a2a2a');
  assert.deepEqual(yellowPalette.sideRgb, shadeRgb(yellowPalette.faceRgb, 0.72));
  assert.deepEqual(yellowPalette.bevelRgb, shadeRgb(yellowPalette.faceRgb, 0.52));

  for (const darkSeat of [0, 1, 2, 3]) {
    const pal = resolveSeatDicePalette(darkSeat, false, 'classic');
    assert.equal(pal.pipColor, '#ffffff');
    assert.deepEqual(pal.faceRgb, hexToRgb(getPlayerColor(darkSeat, false)));
  }

  // Tournament Cyan seat (0) & Neon Yellow seat (4) -> dark charcoal pips
  assert.equal(getContrastPipColor(hexToRgb('#00d4ff')), '#2a2a2a');
  assert.equal(getContrastPipColor(hexToRgb('#ccff00')), '#2a2a2a');

  // Themed styles keep signature material dot contrast while tinting border/glow to active seat color
  const neonSeat2 = resolveSeatDicePalette(2, false, 'neon');
  assert.equal(neonSeat2.borderColor, getPlayerColor(2, false));
  assert.equal(neonSeat2.glowColor, getPlayerColor(2, false));
});

test('Natural token locomotion classifies Cobra=slither, Eagle=fly, Jumpers=jump, and Walkers=walk', () => {
  assert.equal(getTokenLocomotionMode('animal_cobra'), 'slither');
  assert.equal(getTokenLocomotionMode('animal_eagle'), 'fly');

  for (const jumper of [null, 'animal_frog', 'animal_kangaroo', 'gymnast', 'climber_3d'] as const) {
    assert.equal(getTokenLocomotionMode(jumper), 'jump');
  }

  for (const walker of [
    'animal_lion',
    'animal_elephant',
    'animal_horse',
    'animal_wolf',
    'animal_gorilla',
    'animal_rooster',
    'belly_dancer',
    'sprinter_man',
    'model_runway',
    'wrestler',
    'ninja_fighter',
    'skater_3d',
    'breakdancer',
    'strongman',
  ] as const) {
    assert.equal(getTokenLocomotionMode(walker), 'walk');
  }
});

test('Pass & Play assigns distinct AI token styles per seat and rotates styles on every match', () => {
  const players = [
    { isAI: false },
    { isAI: true },
    { isAI: true },
    { isAI: true },
    { isAI: true },
  ];

  const match1 = pickRandomAiSeatTokenOverrides(players, 'animal_lion', undefined, createSeededRng(101));
  assert.equal(match1[0], undefined);
  const match1Ids = [1, 2, 3, 4].map((seat) => match1[seat]!);
  assert.equal(new Set(match1Ids).size, 4);
  assert.ok(!match1Ids.includes('animal_lion'), 'AI bots must not duplicate the human player style');

  assert.equal(resolveCharacterId('animal_lion', 0, match1), 'animal_lion');
  assert.equal(resolveCharacterId('animal_lion', 1, match1), match1[1]);

  const match2 = pickRandomAiSeatTokenOverrides(players, 'animal_lion', match1, createSeededRng(202));
  for (const seat of [1, 2, 3, 4]) {
    assert.notEqual(match2[seat], match1[seat], `Seat ${seat} should pick a different style on the next match`);
  }

  // Store-level startLocalMatch assigns fresh AI overrides and clears on exitMatchToMenu
  useGameStore.getState().startLocalMatch(false);
  const firstAiMap = { ...useGameStore.getState().aiTokenOverrides };
  assert.ok(Object.keys(firstAiMap).length > 0);
  useGameStore.getState().startLocalMatch(false);
  const secondAiMap = { ...useGameStore.getState().aiTokenOverrides };
  for (const [seatKey, tokenId] of Object.entries(firstAiMap)) {
    assert.notEqual(secondAiMap[Number(seatKey)], tokenId);
  }
  useGameStore.getState().exitMatchToMenu();
  assert.deepEqual(useGameStore.getState().aiTokenOverrides, {});
});

test('Animal ground shadow spotlight aura draws larger colored glow, crisp sports ring, and direction chevron', () => {
  const ellipses: Array<{ x: number; y: number; rx: number; ry: number }> = [];
  const polys: number[][] = [];
  const fills: unknown[] = [];
  const strokes: unknown[] = [];
  const chain = {
    fill: (arg: unknown) => {
      fills.push(arg);
      return chain;
    },
    stroke: (arg: unknown) => {
      strokes.push(arg);
      return chain;
    },
  };
  const mockGfx = {
    ellipse: (x: number, y: number, rx: number, ry: number) => {
      ellipses.push({ x, y, rx, ry });
      return chain;
    },
    poly: (pts: number[]) => {
      polys.push(pts);
      return chain;
    },
  } as unknown as Parameters<typeof drawAnimalGroundAura>[0];

  drawAnimalGroundAura(mockGfx, 0xe74c3c, 0.72, 0.65, 1, 0, true, 1200, 0, 0);
  // Larger spotlight aura ellipses (>13.8 old disc) + dynamic dark shadow + 3 crisp sports ring strokes
  assert.ok(ellipses.some((e) => e.rx > 18), 'Ground spotlight aura should be larger than old small disc');
  assert.ok(ellipses.some((e) => e.rx >= 16.5 && e.rx <= 19.0), 'Crisp sports player ring should wrap cleanly around animal');
  assert.equal(polys.length, 1, 'Sports ring directional chevron should be drawn');
  assert.ok(fills.length >= 4 && strokes.length >= 4);
});

