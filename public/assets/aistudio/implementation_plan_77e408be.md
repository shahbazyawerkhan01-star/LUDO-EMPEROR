# Ludo Dethroned 5-Way — Modular Refactoring & Architecture Report

This report outlines the plan to transform Ludo Dethroned 5-Way from an 8.71 MB single-file HTML/Canvas application into a modular TypeScript, React, Tailwind CSS, and PixiJS WebGL architecture backed by a server-authoritative Socket.IO engine and Supabase `game4` schema persistence.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The four scope decisions below were confirmed during planning and lock down the exact boundaries for implementation once you approve this report.

- **Confirmed Decision 1 — Audio & Voice Strategy**: Decode and extract the 13 embedded base64 MP3 tracks (~8 MB currently inside HTML) into static audio files served on demand, while preserving the server-cached Google TTS proxy and live Socket.IO player voice notes.
- **Confirmed Decision 2 — Board Editor Removal**: Remove the built-in 2D layout and board editor mode (`mode === 'edit'`) in favor of clean, fixed portrait and landscape responsive layouts modeled after the 4-Way stage system.
- **Confirmed Decision 3 — PixiJS Visual Direction**: Recreate the current 5-Way pentagonal board visual style, player colour zones, star safe spaces, and 3D-style tumbling dice using GPU-accelerated PixiJS WebGL rather than switching to 4-Way's tilted wooden slab aesthetic.
- **Confirmed Decision 4 — Supabase Database Schema**: Update the server-side Supabase records layer to target the `game4` PostgreSQL schema (`players`, `matches`, `results` tables) instead of `game5`.

> [!WARNING]
> Removing the host-authoritative snapshot relay and switching Supabase writes from `game5` to `game4` requires that the `game4` schema tables (`game4.players`, `game4.matches`, `game4.results`) already exist—or are provisioned—on the connected Supabase project with the same column contract, otherwise records writes will log non-blocking warnings while matches continue unaffected in memory.

---

## 1. Overview & Core Concept

- **What It Does**: Ludo Dethroned 5-Way is a five-player pentagonal Ludo game playable locally (Pass & Play and Tournament with AI rivals) and online with friends via Socket.IO room codes, featuring live voice/text chat, multi-language AI banter, and full custom rules (unlimited `6+6`, Stack Protection, Split Sacrifice, Lone Token Full-Total entry, Lucky 7, Lucky Wish, Compulsory Capture Penalty, and Gul or Pass).
- **Target Audience**: Mobile and desktop board-game players joining 5-seat local or remote matches who expect instant page loads, 60fps animations, and cheat-resistant multiplayer turn resolution.
- **Key Value**: Replacing the 17,083-line monolithic page and CPU Canvas 2D loop with typed, modular components and a GPU-backed PixiJS stage eliminates multi-megabyte cold-start bottlenecks, isolates pure game rules from rendering, prevents host disconnects from stalling online matches, and keeps every 5-Way rule and progression feature intact.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  - **Main Menu & Mode Entry**: Fast cold boot into a balanced title screen featuring Pass & Play, Tournament (`$` entry fee, balances, and win milestones), Play With Friends (online room lobby), How to Play (12-card interactive rules guide), and Settings (language, background surface, audio/TTS mute, music track selector, timer preset).
  - **Local & Tournament Setup**: Configure 5 seats with player names, avatar emojis, AI toggles, Lucky Wish numbers (any pair except `6+6`), and tournament `$1` entry validation.
  - **Online Multiplayer Lobby**: Create a 6-character shareable room code or join via link/code; see live seat occupancy, Ready toggles, Fill Empty Seats with AI Bot control, turn timer duration (`60s` / `90s` / `120s` / `Off`), and Host-only Start Match action.
  - **Active Match Gameplay**: Top compact progress bar displays rank medals (`🥇`/`🥈`/`🥉` for top 3, player emoji if present for 4th/5th without any numbers), player initial, and progress percentage. Players tap to roll two dice, select individual dice (or combined total for lone track tokens), move glowing pawns, answer compulsory-capture coach warnings or "Gul or Pass?" prompts, send quick emoji reactions or voice notes, and watch real-time turn timers auto-pass cleanly on expiry.
  - **Match Conclusion**: Immediate victory banner when all 4 tokens enter a player's coloured home path or centre home, full 1st–5th ranked scoreboard, Tournament payouts/milestones, and server-recorded final results.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Deep royal-slate and midnight tabletop atmosphere preserving the crisp, high-contrast 5-Way pentagonal board identity (`60%` dark slate/textured arena backdrop, `30%` crisp neutral track cells & dark translucent glass overlays, `10%` vibrant per-player accents—Cyan `#00D4FF`, Orange `#FF6700`, Green `#00FF00`, Red `#FF0000`, Lime `#CCFF00`—paired with Warm Gold `#F1C40F` action cues).
  - *Typography & Hierarchy*: Bold rounded display headers paired with crisp geometric UI copy and tabular numerals (`tabular-nums`) for percentages, turn countdowns, dice values, and `$` tournament balances; single-line button labels (`whitespace-nowrap shrink-0`) and unboxed metadata without pill clutter.
  - *Layout & Viewport Rules*: Responsive stage switching cleanly between **Portrait** (top progress/stats bar, centered pentagonal board, dice/hint tray and controls beneath) and **Landscape** (board anchored left/center with dedicated right-hand rail for progress bar, dice HUD, and turn controls). Sticky overlays strictly bounded under 15% of viewport height on mobile.
- **Interactive Feedback & Motion**:
  - GPU-accelerated PixiJS tweening for pawn hops, captures returning to base, glowing movable token highlights, and tumbling dice; UI modals and HUD controls respond within 150ms using compositor-only `transform` and `opacity` transitions.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Server-Authoritative Multiplayer Engine**:
  - *Chosen Approach*: Move dice generation, Lucky 7 conversion, legal move validation, stack protection & split sacrifice, compulsory capture penalty evaluation, Gul/Pass decisions, AI turns, and turn countdown timers into a pure TypeScript room manager on the backend communicating over Socket.IO.
  - *Why*: Eliminates host-tab throttling bugs, prevents client tampering with dice or Lucky Wish rolls, and ensures matches continue smoothly even if the room creator temporarily loses connection.
  - *Alternatives Considered*: Keeping the existing host-relayed snapshot model—rejected because timer drift and disconnected hosts disrupt all guests.
- **Decision 2 — Pure Functional Rules Core Shared Between Client & Server**:
  - *Chosen Approach*: Extract all 5-Way pentagonal geometry (63 common track squares + 5 coloured home path squares + centre home across 5 arms) and rule evaluators into a framework-free TypeScript rules module imported by both the PixiJS scene (for local mode & optimistic move highlights) and the backend room manager (for authoritative verification).
  - *Why*: Guarantees zero divergence between offline Pass & Play, AI reasoning, and online multiplayer validation.
- **Decision 3 — Static Extracted Audio + Cached TTS Over Embedded Base64**:
  - *Chosen Approach*: Write the 13 audio files currently embedded in HTML out as lazy-loaded static `.mp3` assets while retaining Web Audio fallback clicks, multi-language Google TTS caching on Express, and Socket.IO voice-note relay.
  - *Why*: Shrinks initial page payload from ~8.7 MB to under 1.5 MB for dramatically faster container cold starts and mobile loading while keeping every sound track and voice feature intact.
- **Decision 4 — PixiJS WebGL Stage Paired with React HUD & Modals**:
  - *Chosen Approach*: Let PixiJS own the 60fps board, pentagonal geometry, pawns, dice animation, and floating emoji reactions, while React + Zustand/store state manages menus, setup rows, lobby controls, voice recorder, and rule modals cleanly above the canvas.
  - *Why*: Avoids DOM reflow overhead during gameplay animations while keeping accessibility, form controls, localization, and layout styling clean in React and Tailwind CSS.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & System Diagram**:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Vite + React + TS)                     │
│                                                                         │
│  ┌──────────────────────┐   subscriptions   ┌────────────────────────┐  │
│  │  UI Layer            │ ◀───────────────▶ │  Client Store & SDK    │  │
│  │  • MainMenu / Setup  │                   │  • Match & UI State    │  │
│  │  • HUD & ProgressBar │                   │  • Persistent WinStats │  │
│  │  • Lobby / Modals    │                   │  • Host SDK Adapter    │  │
│  └──────────┬───────────┘                   └───────────┬────────────┘  │
│             │ user intents                              │ socket events │
│             ▼                                           ▼               │
│  ┌──────────────────────┐   shared pure     ┌────────────────────────┐  │
│  │  PixiJS WebGL Scene  │ ◀───── TS ──────▶ │  Multiplayer Client    │  │
│  │  • Pentagonal Board  │   5-Way Rules     │  • Socket.IO Transport │  │
│  │  • Pawns & 3D Dice   │                   │  • Voice/Chat Relay    │  │
│  │  • Extracted SFX/TTS │                   │  • Reconnect Tokens    │  │
│  └──────────────────────┘                   └───────────┬────────────┘  │
└─────────────────────────────────────────────────────────┼───────────────┘
                                                          │ WebSocket / HTTP
┌─────────────────────────────────────────────────────────▼───────────────┐
│                      SERVER (Node.js + Express + Socket.IO)             │
│                                                                         │
│  ┌──────────────────────┐                   ┌────────────────────────┐  │
│  │  Room Manager (TS)   │                   │  Express Routes        │  │
│  │  • Dice & Lucky 7    │                   │  • Static Vite Bundle  │  │
│  │  • Move Validation   │                   │  • Static Audio Assets │  │
│  │  • Captures/Penalties│                   │  • /api/tts Voice Cache│  │
│  │  • Timers & AI Turns │                   │  • /api/health         │  │
│  └──────────┬───────────┘                   └────────────────────────┘  │
│             │ start / end match telemetry                               │
│             ▼                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Supabase Records Layer (.schema('game4'))                        │  │
│  │  • game4.players  • game4.matches  • game4.results                │  │
│  │  • Non-blocking retries + unreachable-host backoff                │  └
└─────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **Pure Rules & Board Model**: 5 pentagonal arms (`0..4`), each pawn tracked by seat index (`0..4`), pawn slot (`0..3`), status (`home` | `on-path` | `finished`), and logical step position (`-1` base, `0..62` shared track, `63..67` coloured home path, `68` centre home). Tracks turn state (`currentPlayer`, `dice`, `diceUsed`, `extraTurnEarned`, `extraTurnReason`, `lucky7UsedThisTurn`, `pendingGulChoice`, `turnStartCaptures`, `turnCapturedPawn`, `turnDeadline`, `playerStats`).
  - **5-Way Custom Rule Engine**:
    - *Unlimited `6+6`*: No three-double-sixes streak forfeit; `6+6` always keeps turn bonus eligibility.
    - *Stack Protection & Split Sacrifice*: Captures require `myCount >= otherCount` on non-safe squares (entry + star squares); splitting a pair on a combined-dice capture returns the orphaned partner token to base.
    - *Lone Token Full-Total Rule*: When exactly 1 token is `on-path`, entering `63..68` requires the sum of remaining dice (`fullTurnRoll`), blocking partial single-die entry.
    - *Gul or Pass*: Moves landing on `68` enter an explicit choice state (`gul` vs `pass`) rather than auto-finishing silently.
    - *Compulsory Capture Penalty*: Checks possible captures across both single and combined dice; awards single-capture forgiveness once a capture occurs that turn, warns novices via Coach Hint during their first 3 matches, and penalizes skipped captures back to base.
  - **Client Progression & Room Persistence**: Local `winStats` (`wins`, `$` tournament `balances`, `milestones`, AI capture `history`) synced through `localStorage` and SDK adapter; multiplayer rooms store seat owners, Ready states, Fill-Bots preference, Lucky Wish pairs, reconnect tokens, and turn-timer presets (`60`/`90`/`120`/`0`) in server memory with match start/finish telemetry flushed asynchronously to Supabase `game4`.
- **Interactive Component & State Mapping**:
  - **Dice & Move Selection**: Clicking a die or the roll hint triggers local `rollDice` (Pass & Play / Tournament) or emits a Socket.IO roll request (Online); the server returns dice + Lucky 7 state + legal/combined moves, PixiJS animates the roll, and glowing pawn hitboxes unlock move selection (`single die` or `combined` for lone tokens).
  - **Gul/Pass & Coach Modals**: Intercepts eligible moves before committing state mutation; on online rooms, the server holds a pending confirmation state until the active player picks Enter or Pass (with timer expiry resolving safely via auto-pass).
  - **Lobby & Ready/Fill-Bots Flow**: Host creates a room, shares link/code, toggles Fill Empty Seats with AI Bots and turn timer preset; Guests join, set name/icon/Lucky Wish, and toggle Ready; Host clicks Start Match to lock seats, upsert `game4.players`, and create `game4.matches`.
  - **Voice Notes & Reactions**: Emoji taps spawn floating PixiJS reactions synced via Socket.IO; the microphone recorder encodes short audio notes and relays playback to room peers without blocking the game loop.
- **Build & Runtime Pipeline**:
  - Replace the single-file serving setup with a Vite + TypeScript frontend build outputting optimized static assets alongside a TypeScript-capable Node Express + Socket.IO server running on port `3000`, keeping clean `dev`, `build`, `start`, and `lint` scripts.
