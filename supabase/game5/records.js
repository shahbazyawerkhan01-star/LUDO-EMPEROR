/**
 * Supabase Records Layer (Server-Side)
 * Phase 2a: 5-way multiplayer project records using "game5" schema.
 *
 * Requirements:
 * - Uses schema "game5" (.schema('game5')) on EVERY query.
 * - Tables: game5.players, game5.matches, game5.results.
 * - Stores verified = false for every result record.
 * - Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from process.env ONLY.
 * - NEVER logs keys, URLs, or secrets.
 * - Non-blocking async execution with timeout and retry.
 * - Match play is never disrupted or blocked if database is unreachable.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

let supabaseClient = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      db: {
        schema: 'game5'
      }
    });
    console.log('[SupabaseRecords] Initialized records layer for schema game5.');
  } catch (err) {
    console.error('[SupabaseRecords] Initialization error:', err.message);
  }
} else {
  console.log('[SupabaseRecords] Records layer in dry-run mode (environment keys not configured).');
}

/**
 * Execute an async database operation with timeout and retry logic.
 * Never throws — returns { success, data, error }.
 */
async function withRetry(operationName, opFn, maxRetries = 2, timeoutMs = 4500) {
  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    attempt++;
    let timerId = null;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
      });

      const result = await Promise.race([opFn(), timeoutPromise]);
      if (timerId) clearTimeout(timerId);
      return { success: true, data: result };
    } catch (err) {
      if (timerId) clearTimeout(timerId);
      lastError = err;
      console.warn(`[SupabaseRecords] Attempt ${attempt}/${maxRetries + 1} for "${operationName}" failed: ${err.message}`);
      if (attempt <= maxRetries) {
        await new Promise(r => setTimeout(r, 600 * attempt));
      }
    }
  }

  console.error(`[SupabaseRecords] "${operationName}" permanently failed after ${maxRetries + 1} attempts. Match unaffected.`);
  return { success: false, error: lastError };
}

/**
 * Record match start in game5.matches and upsert player profiles into game5.players.
 * Asynchronous, non-blocking. Calls .schema('game5') on every query.
 */
export async function recordMatchStart({ roomCode, seats = {} }) {
  if (!supabaseClient) {
    console.log(`[SupabaseRecords:DryRun] Match started for room ${roomCode}`);
    return null;
  }

  (async () => {
    await withRetry(`recordMatchStart(${roomCode})`, async () => {
      const activeSeats = Object.values(seats || {}).filter(s => s && typeof s.seatIndex === 'number');
      const playerCount = activeSeats.length || 5;

      // 1. Upsert players into game5.players
      const playerRows = activeSeats.map(s => {
        const playerId = s.supabaseUserId || s.publicPlayerId || `p_${s.seatIndex}`;
        const displayName = (s.name && s.name.trim()) ? s.name.trim() : `Player ${s.seatIndex + 1}`;
        return {
          id: playerId,
          display_name: displayName,
          created_at: new Date().toISOString()
        };
      });

      if (playerRows.length > 0) {
        const { error: playerErr } = await supabaseClient
          .schema('game5')
          .from('players')
          .upsert(playerRows, { onConflict: 'id', ignoreDuplicates: false });

        if (playerErr) {
          console.warn('[SupabaseRecords] Warning upserting game5.players:', playerErr.message);
        }
      }

      // 2. Insert match record into game5.matches
      const { data: matchData, error: matchErr } = await supabaseClient
        .schema('game5')
        .from('matches')
        .insert({
          room_code: roomCode,
          started_at: new Date().toISOString(),
          player_count: playerCount
        })
        .select('id')
        .single();

      if (matchErr) throw matchErr;
      console.log(`[SupabaseRecords] Recorded match start: Match ID ${matchData?.id} for Room ${roomCode} in schema game5.`);
      return matchData?.id;
    });
  })().catch(err => {
    console.error('[SupabaseRecords] Unhandled error in recordMatchStart background task:', err.message);
  });
}

/**
 * Record match finish with final rankings and progress percentages in game5.results.
 * Every result row is explicitly stored with verified: false.
 * Calls .schema('game5') on every query.
 */
export async function recordMatchEnd({ roomCode, rankings = [], seats = {} }) {
  if (!supabaseClient) {
    console.log(`[SupabaseRecords:DryRun] Match ended for room ${roomCode}`);
    return;
  }

  (async () => {
    await withRetry(`recordMatchEnd(${roomCode})`, async () => {
      // 1. Query the latest active match for this room in game5.matches
      const { data: matchRows, error: findErr } = await supabaseClient
        .schema('game5')
        .from('matches')
        .select('id, started_at')
        .eq('room_code', roomCode)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1);

      if (findErr) throw findErr;

      let matchId = matchRows && matchRows[0]?.id;

      if (!matchId) {
        const { data: newMatch, error: createErr } = await supabaseClient
          .schema('game5')
          .from('matches')
          .insert({
            room_code: roomCode,
            started_at: new Date(Date.now() - 60000).toISOString(),
            ended_at: new Date().toISOString(),
            player_count: rankings.length || 5
          })
          .select('id')
          .single();

        if (createErr) throw createErr;
        matchId = newMatch?.id;
      } else {
        const { error: updateErr } = await supabaseClient
          .schema('game5')
          .from('matches')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', matchId);

        if (updateErr) throw updateErr;
      }

      // 2. Prepare rankings for game5.results
      const sortedRankings = [...rankings].sort((a, b) => {
        if (a.rank !== undefined && b.rank !== undefined) {
          return a.rank - b.rank;
        }
        return (b.percentage || b.progress_percent || 0) - (a.percentage || a.progress_percent || 0);
      });

      const resultRows = sortedRankings.map((r, idx) => {
        const seatIdx = typeof r.seat === 'number' ? r.seat : (typeof r.pIdx === 'number' ? r.pIdx : idx);
        const seatObj = (seats && seats[seatIdx]) || {};
        const playerId = seatObj.supabaseUserId || seatObj.publicPlayerId || `p_${seatIdx}`;
        const progressPercent = typeof r.percentage === 'number' ? r.percentage : (typeof r.progress_percent === 'number' ? r.progress_percent : 0);
        const finalRank = r.rank || (idx + 1);

        return {
          match_id: matchId,
          player_id: playerId,
          seat: seatIdx,
          rank: finalRank,
          progress_percent: Math.min(100, Math.max(0, progressPercent)),
          captures_made: Math.min(200, Math.max(0, r.captures_made || 0)),
          times_captured: Math.min(200, Math.max(0, r.times_captured || 0)),
          penalties: Math.min(200, Math.max(0, r.penalties || 0)),
          verified: false // As required: Every result is stored with verified=false
        };
      });

      if (resultRows.length > 0) {
        const { error: resultsErr } = await supabaseClient
          .schema('game5')
          .from('results')
          .insert(resultRows);

        if (resultsErr) throw resultsErr;
      }

      console.log(`[SupabaseRecords] Recorded match end for Room ${roomCode}: Match ID ${matchId}, ${resultRows.length} results saved in game5.results with verified=false.`);
      return true;
    });
  })().catch(err => {
    console.error('[SupabaseRecords] Unhandled error in recordMatchEnd background task:', err.message);
  });
}

/**
 * Optional user verification: verify Supabase JWT token and retrieve user ID.
 * Never logs the token or user details.
 */
export async function verifySupabaseToken(token) {
  if (!supabaseClient || !token) return null;
  try {
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);
    if (error || !user) {
      return null;
    }
    return user;
  } catch (err) {
    return null;
  }
}

export const isSupabaseConfigured = () => !!supabaseClient;
