-- ============================================================================
-- Migration: Harden game4 schema for 5-Player Ludo & Server-Backed Wallets
-- Idempotent & safe to re-run against existing game4 tables
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS game4;

-- 1. Add balance & matches_won columns to game4.players if missing
ALTER TABLE game4.players
  ADD COLUMN IF NOT EXISTS balance INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS matches_won INTEGER NOT NULL DEFAULT 0;

-- Enforce non-negative wallet & win checks idempotently
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'game4.players'::regclass
      AND conname = 'game4_players_balance_nonneg'
  ) THEN
    ALTER TABLE game4.players
      ADD CONSTRAINT game4_players_balance_nonneg CHECK (balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'game4.players'::regclass
      AND conname = 'game4_players_matches_won_nonneg'
  ) THEN
    ALTER TABLE game4.players
      ADD CONSTRAINT game4_players_matches_won_nonneg CHECK (matches_won >= 0);
  END IF;
END $$;

-- 2. Update game4.matches.player_count default & constraint (2..5 players)
ALTER TABLE game4.matches
  ALTER COLUMN player_count SET DEFAULT 5;

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'game4.matches'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%player_count%'
  LOOP
    EXECUTE format('ALTER TABLE game4.matches DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE game4.matches
    ADD CONSTRAINT game4_matches_player_count_range CHECK (player_count >= 2 AND player_count <= 5);
END $$;

-- 3. Drop legacy 4-player seat/rank constraints on game4.results and replace with 5-player checks
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'game4.results'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%seat%'
        OR pg_get_constraintdef(oid) ILIKE '%rank%'
      )
  LOOP
    EXECUTE format('ALTER TABLE game4.results DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE game4.results
    ADD CONSTRAINT game4_results_seat_range CHECK (seat >= 0 AND seat <= 4),
    ADD CONSTRAINT game4_results_rank_range CHECK (rank >= 1 AND rank <= 5);
END $$;

-- 4. Refresh leaderboard view to expose balance and matches_won
CREATE OR REPLACE VIEW game4.leaderboard AS
SELECT
  p.id AS player_id,
  p.display_name,
  p.balance,
  p.matches_won,
  COUNT(r.id) AS matches_played,
  COUNT(CASE WHEN r.rank = 1 THEN 1 END) AS wins,
  COALESCE(ROUND(AVG(r.progress_percent), 2), 0) AS avg_progress_percent,
  COALESCE(SUM(r.captures_made), 0) AS total_captures,
  COALESCE(SUM(r.times_captured), 0) AS total_times_captured,
  COALESCE(SUM(r.penalties), 0) AS total_penalties
FROM game4.players p
LEFT JOIN game4.results r ON r.player_id = p.id
GROUP BY p.id, p.display_name, p.balance, p.matches_won
ORDER BY wins DESC, p.matches_won DESC, avg_progress_percent DESC;

GRANT SELECT ON game4.leaderboard TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA game4 TO service_role;
