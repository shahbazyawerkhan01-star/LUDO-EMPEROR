-- ============================================================================
-- SUPABASE UNIFIED SETUP: game5 (5-Way Ludo) & game4 (4-Way Ludo)
-- Run this in Supabase Dashboard -> SQL Editor -> Click 'Run'
-- Both game schemas are completely isolated from each other.
-- ============================================================================

-- ============================================================================
-- SECTION 1: 5-WAY LUDO SCHEMA (game5)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS game5;

CREATE TABLE IF NOT EXISTS game5.players (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game5.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  player_count INTEGER NOT NULL DEFAULT 5
);

CREATE TABLE IF NOT EXISTS game5.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES game5.matches(id) ON DELETE CASCADE,
  player_id TEXT REFERENCES game5.players(id) ON DELETE SET NULL,
  seat INTEGER NOT NULL CHECK (seat >= 0 AND seat <= 4),
  rank INTEGER NOT NULL CHECK (rank >= 1 AND rank <= 5),
  progress_percent NUMERIC NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  captures_made INTEGER NOT NULL DEFAULT 0 CHECK (captures_made >= 0 AND captures_made <= 200),
  times_captured INTEGER NOT NULL DEFAULT 0 CHECK (times_captured >= 0 AND times_captured <= 200),
  penalties INTEGER NOT NULL DEFAULT 0 CHECK (penalties >= 0 AND penalties <= 200),
  verified BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_game5_matches_room_code ON game5.matches(room_code);
CREATE INDEX IF NOT EXISTS idx_game5_matches_started_at ON game5.matches(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_game5_results_match_id ON game5.results(match_id);
CREATE INDEX IF NOT EXISTS idx_game5_results_player_id ON game5.results(player_id);

CREATE OR REPLACE VIEW game5.leaderboard AS
SELECT 
  p.id AS player_id,
  p.display_name,
  COUNT(r.id) AS matches_played,
  COUNT(CASE WHEN r.rank = 1 THEN 1 END) AS wins,
  COALESCE(ROUND(AVG(r.progress_percent), 2), 0) AS avg_progress_percent,
  COALESCE(SUM(r.captures_made), 0) AS total_captures,
  COALESCE(SUM(r.times_captured), 0) AS total_times_captured,
  COALESCE(SUM(r.penalties), 0) AS total_penalties
FROM game5.players p
LEFT JOIN game5.results r ON r.player_id = p.id
GROUP BY p.id, p.display_name
ORDER BY wins DESC, avg_progress_percent DESC;

ALTER TABLE game5.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game5.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE game5.results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny client write on players" ON game5.players;
DROP POLICY IF EXISTS "Deny client write on matches" ON game5.matches;
DROP POLICY IF EXISTS "Deny client write on results" ON game5.results;

GRANT USAGE ON SCHEMA game5 TO anon, authenticated, service_role;
GRANT SELECT ON game5.leaderboard TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA game5 TO service_role;


-- ============================================================================
-- SECTION 2: 4-WAY LUDO SCHEMA (game4)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS game4;

CREATE TABLE IF NOT EXISTS game4.players (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game4.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  player_count INTEGER NOT NULL DEFAULT 4
);

CREATE TABLE IF NOT EXISTS game4.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES game4.matches(id) ON DELETE CASCADE,
  player_id TEXT REFERENCES game4.players(id) ON DELETE SET NULL,
  seat INTEGER NOT NULL CHECK (seat >= 0 AND seat <= 3),
  rank INTEGER NOT NULL CHECK (rank >= 1 AND rank <= 4),
  progress_percent NUMERIC NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  captures_made INTEGER NOT NULL DEFAULT 0 CHECK (captures_made >= 0 AND captures_made <= 200),
  times_captured INTEGER NOT NULL DEFAULT 0 CHECK (times_captured >= 0 AND times_captured <= 200),
  penalties INTEGER NOT NULL DEFAULT 0 CHECK (penalties >= 0 AND penalties <= 200),
  verified BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_game4_matches_room_code ON game4.matches(room_code);
CREATE INDEX IF NOT EXISTS idx_game4_matches_started_at ON game4.matches(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_game4_results_match_id ON game4.results(match_id);
CREATE INDEX IF NOT EXISTS idx_game4_results_player_id ON game4.results(player_id);

CREATE OR REPLACE VIEW game4.leaderboard AS
SELECT 
  p.id AS player_id,
  p.display_name,
  COUNT(r.id) AS matches_played,
  COUNT(CASE WHEN r.rank = 1 THEN 1 END) AS wins,
  COALESCE(ROUND(AVG(r.progress_percent), 2), 0) AS avg_progress_percent,
  COALESCE(SUM(r.captures_made), 0) AS total_captures,
  COALESCE(SUM(r.times_captured), 0) AS total_times_captured,
  COALESCE(SUM(r.penalties), 0) AS total_penalties
FROM game4.players p
LEFT JOIN game4.results r ON r.player_id = p.id
GROUP BY p.id, p.display_name
ORDER BY wins DESC, avg_progress_percent DESC;

ALTER TABLE game4.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game4.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE game4.results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny client write on players" ON game4.players;
DROP POLICY IF EXISTS "Deny client write on matches" ON game4.matches;
DROP POLICY IF EXISTS "Deny client write on results" ON game4.results;

GRANT USAGE ON SCHEMA game4 TO anon, authenticated, service_role;
GRANT SELECT ON game4.leaderboard TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA game4 TO service_role;
