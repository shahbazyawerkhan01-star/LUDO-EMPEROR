-- ============================================================================
-- Supabase Schema: game4
-- Dedicated schema for 4-Way Ludo Game Records
-- Completely isolated from game5 schema in the same Supabase project
-- ============================================================================

-- 1. Create dedicated schema for 4-way
create schema if not exists game4;

-- 2. Base Tables
create table if not exists game4.players (
  id text primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists game4.matches (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  player_count integer not null default 4
);

create table if not exists game4.results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references game4.matches(id) on delete cascade,
  player_id text references game4.players(id) on delete set null,
  seat integer not null check (seat >= 0 and seat <= 3),
  rank integer not null check (rank >= 1 and rank <= 4),
  progress_percent numeric not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  captures_made integer not null default 0 check (captures_made >= 0 and captures_made <= 200),
  times_captured integer not null default 0 check (times_captured >= 0 and times_captured <= 200),
  penalties integer not null default 0 check (penalties >= 0 and penalties <= 200),
  verified boolean not null default false
);

-- Indices for performance
create index if not exists idx_game4_matches_room_code on game4.matches(room_code);
create index if not exists idx_game4_matches_started_at on game4.matches(started_at desc);
create index if not exists idx_game4_results_match_id on game4.results(match_id);
create index if not exists idx_game4_results_player_id on game4.results(player_id);

-- 3. Leaderboard View for 4-Way
create or replace view game4.leaderboard as
select 
  p.id as player_id,
  p.display_name,
  count(r.id) as matches_played,
  count(case when r.rank = 1 then 1 end) as wins,
  coalesce(round(avg(r.progress_percent), 2), 0) as avg_progress_percent,
  coalesce(sum(r.captures_made), 0) as total_captures,
  coalesce(sum(r.times_captured), 0) as total_times_captured,
  coalesce(sum(r.penalties), 0) as total_penalties
from game4.players p
left join game4.results r on r.player_id = p.id
group by p.id, p.display_name
order by wins desc, avg_progress_percent desc;

-- 4. Row Level Security (RLS)
alter table game4.players enable row level security;
alter table game4.matches enable row level security;
alter table game4.results enable row level security;

-- Drop any public policies to keep base tables strictly private
drop policy if exists "Deny client write on players" on game4.players;
drop policy if exists "Deny client write on matches" on game4.matches;
drop policy if exists "Deny client write on results" on game4.results;

-- 5. Permissions
grant usage on schema game4 to anon, authenticated, service_role;
grant select on game4.leaderboard to anon, authenticated;
grant all on all tables in schema game4 to service_role;
