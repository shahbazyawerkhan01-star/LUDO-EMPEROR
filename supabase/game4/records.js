/**
 * 4-Way Ludo Supabase Records Module (game4 schema)
 * Use this in your 4-way Ludo project backend.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

let supabaseClient = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: 'game4' }
    });
    console.log('[SupabaseRecords:game4] Initialized records layer for schema game4.');
  } catch (err) {
    console.error('[SupabaseRecords:game4] Initialization error:', err.message);
  }
}

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
      if (attempt <= maxRetries) {
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }
  }
  console.error(`[SupabaseRecords:game4] "${operationName}" failed after ${maxRetries + 1} attempts.`);
  return { success: false, error: lastError };
}

export async function record4WayMatchStart({ roomCode, seats = {} }) {
  if (!supabaseClient) return null;

  (async () => {
    await withRetry(`recordMatchStart(${roomCode})`, async () => {
      const activeSeats = Object.values(seats || {}).filter(s => s && typeof s.seatIndex === 'number');
      const playerCount = activeSeats.length || 4;

      const playerRows = activeSeats.map(s => ({
        id: s.supabaseUserId || s.publicPlayerId || `p_${s.seatIndex}`,
        display_name: (s.name && s.name.trim()) ? s.name.trim() : `Player ${s.seatIndex + 1}`,
        created_at: new Date().toISOString()
      }));

      if (playerRows.length > 0) {
        await supabaseClient.schema('game4').from('players').upsert(playerRows, { onConflict: 'id' });
      }

      const { data: matchData, error: matchErr } = await supabaseClient
        .schema('game4')
        .from('matches')
        .insert({
          room_code: roomCode,
          started_at: new Date().toISOString(),
          player_count: playerCount
        })
        .select('id')
        .single();

      if (matchErr) throw matchErr;
      return matchData?.id;
    });
  })().catch(() => {});
}

export async function record4WayMatchEnd({ roomCode, rankings = [], seats = {} }) {
  if (!supabaseClient) return;

  (async () => {
    await withRetry(`recordMatchEnd(${roomCode})`, async () => {
      const { data: matchRows, error: findErr } = await supabaseClient
        .schema('game4')
        .from('matches')
        .select('id')
        .eq('room_code', roomCode)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1);

      if (findErr) throw findErr;
      let matchId = matchRows && matchRows[0]?.id;

      if (!matchId) {
        const { data: newMatch } = await supabaseClient
          .schema('game4')
          .from('matches')
          .insert({
            room_code: roomCode,
            started_at: new Date(Date.now() - 60000).toISOString(),
            ended_at: new Date().toISOString(),
            player_count: rankings.length || 4
          })
          .select('id')
          .single();
        matchId = newMatch?.id;
      } else {
        await supabaseClient
          .schema('game4')
          .from('matches')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', matchId);
      }

      const resultRows = rankings.map((r, idx) => {
        const seatIdx = typeof r.seat === 'number' ? r.seat : idx;
        const seatObj = (seats && seats[seatIdx]) || {};
        const playerId = seatObj.supabaseUserId || seatObj.publicPlayerId || `p_${seatIdx}`;

        return {
          match_id: matchId,
          player_id: playerId,
          seat: seatIdx,
          rank: r.rank || (idx + 1),
          progress_percent: Math.min(100, Math.max(0, r.percentage || 0)),
          captures_made: Math.min(200, Math.max(0, r.captures_made || 0)),
          times_captured: Math.min(200, Math.max(0, r.times_captured || 0)),
          penalties: Math.min(200, Math.max(0, r.penalties || 0)),
          verified: false
        };
      });

      if (resultRows.length > 0) {
        await supabaseClient.schema('game4').from('results').insert(resultRows);
      }
    });
  })().catch(() => {});
}
