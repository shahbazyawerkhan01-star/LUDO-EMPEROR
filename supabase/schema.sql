-- ============================================================================
-- Supabase Schema: game5
-- Dedicated schema for 5-Way multiplayer Ludo project records
-- ============================================================================

-- Create dedicated schema
create schema if not exists game5;

-- 1. Base Tables
create table if not exists game5.players (
  id text primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists game5.matches (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  player_count integer not null default 5
);

create table if not exists game5.results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references game5.matches(id) on delete cascade,
  player_id text references game5.players(id) on delete set null,
  seat integer not null check (seat >= 0 and seat <= 4),
  rank integer not null check (rank >= 1 and rank <= 5),
  progress_percent numeric not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  captures_made integer not null default 0 check (captures_made >= 0 and captures_made <= 200),
  times_captured integer not null default 0 check (times_captured >= 0 and times_captured <= 200),
  penalties integer not null default 0 check (penalties >= 0 and penalties <= 200),
  verified boolean not null default false
);

-- Indices for query performance
create index if not exists idx_game5_matches_room_code on game5.matches(room_code);
create index if not exists idx_game5_matches_started_at on game5.matches(started_at desc);
create index if not exists idx_game5_results_match_id on game5.results(match_id);
create index if not exists idx_game5_results_player_id on game5.results(player_id);

-- 2. Leaderboard View
-- Public reads use ONLY this view. Base tables have no public access policies.
create or replace view game5.leaderboard as
select 
  p.id as player_id,
  p.display_name,
  count(r.id) as matches_played,
  count(case when r.rank = 1 then 1 end) as wins,
  coalesce(round(avg(r.progress_percent), 2), 0) as avg_progress_percent,
  coalesce(sum(r.captures_made), 0) as total_captures,
  coalesce(sum(r.times_captured), 0) as total_times_captured,
  coalesce(sum(r.penalties), 0) as total_penalties
from game5.players p
left join game5.results r on r.player_id = p.id
group by p.id, p.display_name
order by wins desc, avg_progress_percent desc;

-- 3. Row Level Security (RLS)
-- Base tables have RLS enabled and ZERO public policies.
-- Clients cannot select, insert, update, or delete from base tables directly.
alter table game5.players enable row level security;
alter table game5.matches enable row level security;
alter table game5.results enable row level security;

-- Explicitly ensure no policies exist on base tables for anon or authenticated
drop policy if exists "Players can read own profile and leaderboard players" on game5.players;
drop policy if exists "Allow public read on matches" on game5.matches;
drop policy if exists "Allow public read on match_results" on game5.results;
drop policy if exists "Allow public read on results" on game5.results;
drop policy if exists "Deny client write on players" on game5.players;
drop policy if exists "Deny client write on matches" on game5.matches;
drop policy if exists "Deny client write on results" on game5.results;

-- 4. Permissions
grant usage on schema game5 to anon, authenticated, service_role;
grant select on game5.leaderboard to anon, authenticated;
grant all on all tables in schema game5 to service_role;
