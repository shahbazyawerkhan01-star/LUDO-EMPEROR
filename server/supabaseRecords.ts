/**
 * Supabase Records Layer (Server-Side)
 * Target schema: game4 (.schema('game4')) with full 5-player support (Seats 0..4, Ranks 1..5)
 * and server-persisted tournament wallets (balance + matches_won).
 *
 * - Tables: game4.players, game4.matches, game4.results
 * - Preserves original player created_at timestamp on upserts
 * - Validates seat/rank bounds and capture conservation before persisting
 * - Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY strictly from process.env
 * - Non-blocking async execution with retry & unreachable endpoint backoff
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

let supabaseClient: SupabaseClient<any, 'game4'> | null = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      db: {
        schema: 'game4',
      },
    });
    console.log('[SupabaseRecords] Initialized 5-player records layer for schema game4.');
  } catch (err) {
    console.error('[SupabaseRecords] Initialization error:', (err as Error).message);
  }
} else {
  console.log('[SupabaseRecords] Records layer in dry-run mode (environment keys not configured).');
}

let unreachableUntil = 0;

function isNetworkError(errOrMsg: unknown): boolean {
  const errObj = errOrMsg as { message?: string; code?: string; cause?: { code?: string } } | null;
  const msg =
    typeof errOrMsg === 'string'
      ? errOrMsg
      : `${errObj?.message || ''} ${errObj?.cause?.code || ''} ${errObj?.code || ''}`;
  return /fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|network/i.test(msg);
}

async function withRetry<T>(
  operationName: string,
  opFn: () => Promise<T>,
  maxRetries = 2,
  timeoutMs = 4500,
): Promise<{ success: boolean; data?: T; error?: Error }> {
  if (Date.now() < unreachableUntil) {
    return { success: false, error: new Error('Supabase temporarily offline') };
  }

  let attempt = 0;
  let lastError: Error | undefined;

  while (attempt <= maxRetries) {
    attempt++;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
      });

      const result = await Promise.race([opFn(), timeoutPromise]);
      if (timerId) clearTimeout(timerId);
      return { success: true, data: result };
    } catch (err) {
      if (timerId) clearTimeout(timerId);
      lastError = err as Error;
      if (isNetworkError(err)) {
        const wasOffline = Date.now() < unreachableUntil;
        unreachableUntil = Date.now() + 60000;
        if (!wasOffline) {
          console.log(
            `[SupabaseRecords] Records endpoint unreachable (${lastError.message}); skipping persistence (match unaffected).`,
          );
        }
        return { success: false, error: lastError };
      }
      console.warn(`[SupabaseRecords] Attempt ${attempt}/${maxRetries + 1} for "${operationName}" failed: ${lastError.message}`);
      if (attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
  }

  console.warn(`[SupabaseRecords] "${operationName}" skipped after ${maxRetries + 1} attempts. Match unaffected.`);
  return { success: false, error: lastError };
}

export interface RecordSeatInput {
  seatIndex: number;
  supabaseUserId?: string;
  publicPlayerId?: string;
  name?: string;
}

export interface RecordRankingInput {
  seat: number;
  rank: number;
  percentage?: number;
  progress_percent?: number;
  captures_made?: number;
  times_captured?: number;
  penalties?: number;
}

export interface PlayerWallet {
  id: string;
  display_name: string;
  balance: number;
  matches_won: number;
}

export interface ValidatedMatchResultRow {
  seat: number;
  rank: number;
  progress_percent: number;
  captures_made: number;
  times_captured: number;
  penalties: number;
}

export function resolvePlayerRecordId(seatObj: RecordSeatInput | undefined, seatIdx: number): string {
  return seatObj?.supabaseUserId || seatObj?.publicPlayerId || `p_${seatIdx}`;
}

export function validateMatchResultsInput(
  rankings: RecordRankingInput[],
): { valid: boolean; reason?: string; rows: ValidatedMatchResultRow[] } {
  if (!Array.isArray(rankings) || rankings.length < 2 || rankings.length > 5) {
    return { valid: false, reason: 'rankings length must be between 2 and 5', rows: [] };
  }

  const seenSeats = new Set<number>();
  const seenRanks = new Set<number>();
  let totalCapturesMade = 0;
  let totalTimesCaptured = 0;
  const rows: ValidatedMatchResultRow[] = [];

  for (let idx = 0; idx < rankings.length; idx++) {
    const r = rankings[idx];
    const seat = Number(r.seat);
    const rank = Number(r.rank);

    if (!Number.isInteger(seat) || seat < 0 || seat > 4) {
      return { valid: false, reason: `invalid seat index: ${r.seat} (must be 0..4)`, rows: [] };
    }
    if (!Number.isInteger(rank) || rank < 1 || rank > 5) {
      return { valid: false, reason: `invalid rank: ${r.rank} (must be 1..5)`, rows: [] };
    }
    if (seenSeats.has(seat)) {
      return { valid: false, reason: `duplicate seat index: ${seat}`, rows: [] };
    }
    if (seenRanks.has(rank)) {
      return { valid: false, reason: `duplicate rank: ${rank}`, rows: [] };
    }
    seenSeats.add(seat);
    seenRanks.add(rank);

    const rawProgress =
      typeof r.percentage === 'number'
        ? r.percentage
        : typeof r.progress_percent === 'number'
          ? r.progress_percent
          : 0;
    const capturesMade = Math.max(0, Math.min(200, Math.round(Number(r.captures_made) || 0)));
    const timesCaptured = Math.max(0, Math.min(200, Math.round(Number(r.times_captured) || 0)));
    const penalties = Math.max(0, Math.min(200, Math.round(Number(r.penalties) || 0)));

    totalCapturesMade += capturesMade;
    totalTimesCaptured += timesCaptured;

    rows.push({
      seat,
      rank,
      progress_percent: Math.min(100, Math.max(0, Math.round(rawProgress))),
      captures_made: capturesMade,
      times_captured: timesCaptured,
      penalties,
    });
  }

  if (totalCapturesMade !== totalTimesCaptured) {
    return {
      valid: false,
      reason: `capture conservation mismatch (${totalCapturesMade} != ${totalTimesCaptured})`,
      rows: [],
    };
  }

  rows.sort((a, b) => a.rank - b.rank);
  return { valid: true, rows };
}

export async function getOrCreatePlayerWallet(
  playerId: string,
  displayName: string,
): Promise<PlayerWallet> {
  const cleanName = displayName.trim() || 'Player';
  const fallback: PlayerWallet = { id: playerId, display_name: cleanName, balance: 5, matches_won: 0 };
  if (!supabaseClient || !playerId) return fallback;

  const res = await withRetry(`getOrCreatePlayerWallet(${playerId})`, async () => {
    const { data: existing, error: selErr } = await supabaseClient!
      .schema('game4')
      .from('players')
      .select('id, display_name, balance, matches_won')
      .eq('id', playerId)
      .maybeSingle();

    if (selErr) throw selErr;
    if (existing) {
      return {
        id: existing.id,
        display_name: existing.display_name,
        balance: Number(existing.balance ?? 5),
        matches_won: Number(existing.matches_won ?? 0),
      };
    }

    const { data: inserted, error: insErr } = await supabaseClient!
      .schema('game4')
      .from('players')
      .insert({
        id: playerId,
        display_name: cleanName,
        balance: 5,
        matches_won: 0,
      })
      .select('id, display_name, balance, matches_won')
      .single();

    if (insErr) throw insErr;
    return {
      id: inserted.id,
      display_name: inserted.display_name,
      balance: Number(inserted.balance ?? 5),
      matches_won: Number(inserted.matches_won ?? 0),
    };
  });

  return res.data || fallback;
}

export async function deductTournamentEntryFee(
  playerIds: Array<{ id: string; displayName: string }>,
  fee = 1,
): Promise<{ ok: boolean; insufficientPlayerId?: string }> {
  if (!supabaseClient || fee <= 0) return { ok: true };

  for (const p of playerIds) {
    const wallet = await getOrCreatePlayerWallet(p.id, p.displayName);
    if (wallet.balance < fee) {
      return { ok: false, insufficientPlayerId: p.id };
    }
  }

  for (const p of playerIds) {
    const wallet = await getOrCreatePlayerWallet(p.id, p.displayName);
    const nextBalance = Math.max(0, wallet.balance - fee);
    await withRetry(`deductEntryFee(${p.id})`, async () => {
      const { error } = await supabaseClient!
        .schema('game4')
        .from('players')
        .update({ balance: nextBalance })
        .eq('id', p.id);
      if (error) throw error;
      return true;
    });
  }

  return { ok: true };
}

export async function settleTournamentMatch(
  winnerId: string,
  winnerName: string,
  reward = 2,
): Promise<PlayerWallet | null> {
  if (!supabaseClient || !winnerId) return null;

  const wallet = await getOrCreatePlayerWallet(winnerId, winnerName);
  const nextWins = wallet.matches_won + 1;
  let nextBalance = wallet.balance + reward;
  if (nextWins === 100) nextBalance += 100;
  if (nextWins === 1000) nextBalance += 1000;

  const res = await withRetry(`settleTournamentMatch(${winnerId})`, async () => {
    const { data, error } = await supabaseClient!
      .schema('game4')
      .from('players')
      .update({
        display_name: winnerName.trim() || wallet.display_name,
        balance: nextBalance,
        matches_won: nextWins,
      })
      .eq('id', winnerId)
      .select('id, display_name, balance, matches_won')
      .single();

    if (error) throw error;
    return {
      id: data.id,
      display_name: data.display_name,
      balance: Number(data.balance),
      matches_won: Number(data.matches_won),
    };
  });

  return res.data || null;
}

export async function recordMatchStart({
  roomCode,
  seats = {},
}: {
  roomCode: string;
  seats?: Record<number, RecordSeatInput>;
}): Promise<void> {
  if (!supabaseClient) {
    console.log(`[SupabaseRecords:DryRun] Match started for room ${roomCode} (game4 schema, 5-player)`);
    return;
  }
  if (Date.now() < unreachableUntil) return;

  (async () => {
    await withRetry(`recordMatchStart(${roomCode})`, async () => {
      const activeSeats = Object.values(seats || {}).filter(
        (s) => s && typeof s.seatIndex === 'number' && s.seatIndex >= 0 && s.seatIndex <= 4,
      );
      const playerCount = Math.min(5, Math.max(2, activeSeats.length || 5));

      // Never pass created_at so returning players preserve their original join timestamp
      const playerRows = activeSeats.map((s) => ({
        id: resolvePlayerRecordId(s, s.seatIndex),
        display_name: s.name?.trim() ? s.name.trim() : `Player ${s.seatIndex + 1}`,
      }));

      if (playerRows.length > 0) {
        const { error: playerErr } = await supabaseClient!
          .schema('game4')
          .from('players')
          .upsert(playerRows, { onConflict: 'id', ignoreDuplicates: false });

        if (playerErr) {
          if (isNetworkError(playerErr)) throw new Error(playerErr.message || 'fetch failed');
          console.warn('[SupabaseRecords] Warning upserting game4.players:', playerErr.message);
        }
      }

      const { data: matchData, error: matchErr } = await supabaseClient!
        .schema('game4')
        .from('matches')
        .insert({
          room_code: roomCode,
          started_at: new Date().toISOString(),
          player_count: playerCount,
        })
        .select('id')
        .single();

      if (matchErr) throw matchErr;
      console.log(
        `[SupabaseRecords] Recorded 5-player match start: Match ID ${matchData?.id} for Room ${roomCode} in schema game4.`,
      );
      return matchData?.id;
    });
  })().catch((err) => {
    console.log('[SupabaseRecords] Non-blocking recordMatchStart notice:', (err as Error).message);
  });
}

export async function recordMatchEnd({
  roomCode,
  rankings = [],
  seats = {},
  isTournament = false,
  winnerSeatIdx,
}: {
  roomCode: string;
  rankings?: RecordRankingInput[];
  seats?: Record<number, RecordSeatInput>;
  isTournament?: boolean;
  winnerSeatIdx?: number;
}): Promise<void> {
  const validation = validateMatchResultsInput(rankings);
  if (!validation.valid) {
    console.warn(`[SupabaseRecords] Rejected invalid match results for Room ${roomCode}: ${validation.reason}`);
    return;
  }

  if (!supabaseClient) {
    console.log(
      `[SupabaseRecords:DryRun] Match ended for room ${roomCode} (game4 schema, ${validation.rows.length} seats, winnerSeat=${winnerSeatIdx ?? validation.rows[0]?.seat})`,
    );
    return;
  }
  if (Date.now() < unreachableUntil) return;

  (async () => {
    await withRetry(`recordMatchEnd(${roomCode})`, async () => {
      const { data: matchRows, error: findErr } = await supabaseClient!
        .schema('game4')
        .from('matches')
        .select('id, started_at')
        .eq('room_code', roomCode)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1);

      if (findErr) throw findErr;

      let matchId = matchRows?.[0]?.id as string | number | undefined;

      if (!matchId) {
        const { data: newMatch, error: createErr } = await supabaseClient!
          .schema('game4')
          .from('matches')
          .insert({
            room_code: roomCode,
            started_at: new Date(Date.now() - 60000).toISOString(),
            ended_at: new Date().toISOString(),
            player_count: validation.rows.length,
          })
          .select('id')
          .single();

        if (createErr) throw createErr;
        matchId = newMatch?.id;
      } else {
        const { error: updateErr } = await supabaseClient!
          .schema('game4')
          .from('matches')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', matchId);

        if (updateErr) throw updateErr;
      }

      const resultRows = validation.rows.map((r) => {
        const seatObj = seats?.[r.seat];
        const playerId = resolvePlayerRecordId(seatObj, r.seat);
        return {
          match_id: matchId,
          player_id: playerId,
          seat: r.seat,
          rank: r.rank,
          progress_percent: r.progress_percent,
          captures_made: r.captures_made,
          times_captured: r.times_captured,
          penalties: r.penalties,
          verified: false,
        };
      });

      if (resultRows.length > 0) {
        const { error: resultsErr } = await supabaseClient!
          .schema('game4')
          .from('results')
          .insert(resultRows);

        if (resultsErr) throw resultsErr;
      }

      // Persist tournament win counter & balance reward for rank-1 winner
      const rank1 = validation.rows.find((r) => r.rank === 1);
      if (rank1) {
        const winSeat = seats?.[winnerSeatIdx ?? rank1.seat];
        const winId = resolvePlayerRecordId(winSeat, rank1.seat);
        const winName = winSeat?.name?.trim() || `Player ${rank1.seat + 1}`;
        await settleTournamentMatch(winId, winName, isTournament ? 2 : 0);
      }

      console.log(
        `[SupabaseRecords] Recorded match end for Room ${roomCode}: Match ID ${matchId}, ${resultRows.length} rows saved in game4.results (verified=false).`,
      );
      return true;
    });
  })().catch((err) => {
    console.error('[SupabaseRecords] Unhandled error in recordMatchEnd background task:', (err as Error).message);
  });
}

export async function verifySupabaseToken(token: string) {
  if (!supabaseClient || !token) return null;
  try {
    const {
      data: { user },
      error,
    } = await supabaseClient.auth.getUser(token);
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

export const isSupabaseConfigured = () => !!supabaseClient;
