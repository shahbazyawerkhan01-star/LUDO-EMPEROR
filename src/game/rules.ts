export type PawnStatus = 'home' | 'on-path' | 'finished';

export interface PawnState {
  status: PawnStatus;
  pos: number; // -1 for home, 0..68 along 69-step track
}

export interface PlayerConfig {
  name: string;
  color: string;
  isAI: boolean;
  personality: 'Strategist' | 'Confidante' | 'Rival' | 'Rideordie';
  gender: 'male' | 'female';
  wish: [number, number];
  icon?: string;
  xAdj: number;
  yAdj: number;
  angleAdj: number;
  radiusAdj: number;
  widthAdj: number;
  spaceHeightScale: number;
  winPathXAdj: number;
  winPathYAdj: number;
  winXAdj: number;
  winYAdj: number;
  winRotation: number;
  winScale: number;
  baseXAdj: number;
  baseYAdj: number;
  baseRotation: number;
  baseWidthScale: number;
  baseHeightScale: number;
  baseOpacity: number;
}

export interface PathNode {
  arm: number;
  c: number;
  r: number;
  isHome?: boolean;
}

export interface PlayerStats {
  captures_made: number;
  times_captured: number;
  penalties: number;
}

export interface CaptureCandidate {
  pawnIdx: number;
  diceIndices: number[];
  targetPlayer: number;
  targetPawn: number;
  targetPos: number;
}

export interface PairCaptureCandidate {
  pawnIndices: [number, number];
  diceIndices: [number, number];
  targetPlayer: number;
  targetPos: number;
}

export interface CaptureObligation {
  requiredCaptures: 0 | 1 | 2;
  singleCaptures: CaptureCandidate[];
  combinedCaptures: CaptureCandidate[];
  pairCaptures: PairCaptureCandidate[];
  candidatePawns: number[];
}

export interface MoveOption {
  pawnIdx: number;
  dieIdx: number | 'combined';
  steps: number;
}

export interface RankingEntry {
  rank: number;
  seat: number;
  badge: string;
  label: string;
  name: string;
  color: string;
  percentage: number;
  playerProgress: number;
  captures_made: number;
  times_captured: number;
  penalties: number;
}

export type ExtraTurnReason = 'double6' | 'capture' | 'home' | 'lucky7' | null;

export const CLASSIC_COLORS = ['#2980b9', '#e67e22', '#27ae60', '#c0392b', '#f1c40f'] as const;
export const TOURNAMENT_COLORS = ['#00d4ff', '#ff6700', '#00ff00', '#ff0000', '#ccff00'] as const;
export const PLAYER_ICONS = ['🤴', '👑', '💎', '🔥', '🏆', '🎩', '🎮', '🌟', '🍀', '🎲'] as const;

export function getPlayerColor(index: number, isTournament = false): string {
  const i = ((index % 5) + 5) % 5;
  return isTournament ? TOURNAMENT_COLORS[i] : CLASSIC_COLORS[i];
}

export const AI_PERSONALITIES = [
  { label: 'The Strategist (rules & tactics)', value: 'Strategist' as const },
  { label: 'The Confidante (warm & supportive)', value: 'Confidante' as const },
  { label: 'The Rival (same-age, opinionated)', value: 'Rival' as const },
  { label: 'The Ride-or-Die (loyal best friend)', value: 'Rideordie' as const },
];

export const BACKGROUNDS = [
  { id: 'none', label: 'Default Gradient' },
  { id: 'bg_mirror_reflective', label: 'Mirror Reflective' },
  { id: 'bg_neon_grid', label: 'Neon Grid' },
  { id: 'bg_wood_grain_lux', label: 'Wood Grain' },
  { id: 'bg_led_display', label: 'LED Display' },
  { id: 'bg_royal_gold_lux', label: 'Royal Gold' },
] as const;

export const PAWN_ASSET_URLS: string[] = [
  'https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_blue_new_034e5f7e-6288-4623-ab27-bfea929ce511.webp',
  'https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_orange_new_f10ddc24-efac-4f9d-a8f9-c29ee32f9ef7.webp',
  'https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_green_new_9e1c7486-5fd9-4cd0-8c64-dacf0f14650f.webp',
  'https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_red_new_3f7aebf7-05e8-40cf-8524-7715fc45f59b.webp',
  'https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_yellow_new_b842d639-1ad7-4099-aadd-55acb56d3d9f.webp',
];

export const BG_ASSET_URLS: Record<string, string> = {
  bg_mirror_reflective:
    'https://d2oir5eh8rty2e.cloudfront.net/assets/images/bg_mirror_reflective_a5795731-38f9-49ec-9abd-9c75985cf874.webp',
  bg_neon_grid:
    'https://d2oir5eh8rty2e.cloudfront.net/assets/images/bg_neon_grid_8f23159c-a028-4f2d-a500-6ed21247a192.webp',
  bg_led_display:
    'https://d2oir5eh8rty2e.cloudfront.net/assets/images/bg_led_display_2313e8e5-dfa2-4578-bf1f-9da18d81744a.webp',
  bg_royal_gold_lux:
    'https://d2oir5eh8rty2e.cloudfront.net/assets/images/bg_royal_gold_lux_5ec09cd6-5b8c-4a97-b89a-38eadcb06f3e.webp',
  bg_wood_grain_lux:
    'https://d2oir5eh8rty2e.cloudfront.net/assets/images/bg_wood_grain_lux_c6947d92-36f6-4cc3-8a51-f250ebe857ef.webp',
};

export interface BoardTheme {
  name: string;
  track: string;
  border: string;
  safe: string;
  text: string;
  homeText: string;
  bgId: string;
}

export const BOARD_THEMES: Record<string, BoardTheme> = {
  classic: {
    name: 'Classic Board',
    track: '#ffffff',
    border: '#000000',
    safe: '#f0f0f0',
    text: '#000000',
    homeText: '#ffffff',
    bgId: 'none',
  },
  mirror: {
    name: 'Mirror Board',
    track: '#bdc3c7',
    border: '#2c3e50',
    safe: '#ecf0f1',
    text: '#2c3e50',
    homeText: '#ffffff',
    bgId: 'bg_mirror_reflective',
  },
  neon: {
    name: 'Neon Board',
    track: '#1a1a1a',
    border: '#39ff14',
    safe: '#222222',
    text: '#ffffff',
    homeText: '#ffffff',
    bgId: 'bg_neon_grid',
  },
  wood: {
    name: 'Wood Board',
    track: '#deb887',
    border: '#5d4037',
    safe: '#d2b48c',
    text: '#3e2723',
    homeText: '#ffffff',
    bgId: 'bg_wood_grain_lux',
  },
  led: {
    name: 'LED Lights Board',
    track: '#000000',
    border: '#00d4ff',
    safe: '#111111',
    text: '#ffffff',
    homeText: '#ffffff',
    bgId: 'bg_led_display',
  },
  gold: {
    name: 'Royal Gold Board',
    track: '#fff9e6',
    border: '#d4af37',
    safe: '#fcf3cf',
    text: '#7d6608',
    homeText: '#ffffff',
    bgId: 'bg_royal_gold_lux',
  },
};

export interface DiceStyle {
  name: string;
  face: [number, number, number];
  dot: string;
  border: string;
  glow: string | null;
}

export const DICE_STYLES: Record<string, DiceStyle> = {
  classic: { name: 'Classic White', face: [245, 242, 245], dot: '#1e272e', border: '#94a3b8', glow: null },
  neon: { name: 'Neon Cyberpunk', face: [0, 20, 100], dot: '#ffffff', border: '#38bdf8', glow: '#38bdf8' },
  gold: { name: 'Royal Gold', face: [212, 175, 55], dot: '#5d4037', border: '#f1c40f', glow: '#f1c40f' },
  wood: { name: 'Wooden Carved', face: [139, 69, 19], dot: '#fde68a', border: '#5d4037', glow: null },
  marble: { name: 'Marble Stone', face: [224, 224, 224], dot: '#333333', border: '#999999', glow: null },
  galaxy: { name: 'Cosmic Galaxy', face: [10, 10, 42], dot: '#ffffff', border: '#6366f1', glow: '#818cf8' },
  fire: { name: 'Fire & Magma', face: [200, 0, 0], dot: '#ffffff', border: '#fb923c', glow: '#ef4444' },
  ice: { name: 'Ice Crystal', face: [224, 255, 255], dot: '#008b8b', border: '#67e8f9', glow: '#22d3ee' },
  dark: { name: 'Minimalist Dark', face: [26, 26, 26], dot: '#ffffff', border: '#52525b', glow: null },
  holographic: { name: 'Holographic Gem', face: [240, 248, 255], dot: '#da70d6', border: '#87ceeb', glow: '#f0abfc' },
};

const SPACE_SIZE = 40;
const PENTAGON_HALF_ANGLE = Math.PI / 5; // 36°
const EXACT_WING_RADIUS = (1.5 * SPACE_SIZE) / Math.tan(PENTAGON_HALF_ANGLE); // 82.582915...
const EXACT_PENTAGON_RADIUS = EXACT_WING_RADIUS / Math.cos(PENTAGON_HALF_ANGLE); // 102.078097...
const EXACT_ARM_LENGTH = 6 * SPACE_SIZE; // 240
const EXACT_TRI_HEIGHT = EXACT_ARM_LENGTH * Math.cos(PENTAGON_HALF_ANGLE); // 194.164079...
const EXACT_BASE_WIDTH_SCALE = 2 * Math.sin(PENTAGON_HALF_ANGLE); // 1.175571...
const EXACT_BASE_HEIGHT_SCALE = 1.2 * Math.cos(PENTAGON_HALF_ANGLE); // 0.970820...
const EXACT_BASE_MID_RADIUS = EXACT_PENTAGON_RADIUS + EXACT_TRI_HEIGHT / 2;
const EXACT_BASE_X_ADJ =
  EXACT_BASE_MID_RADIUS * Math.cos(PENTAGON_HALF_ANGLE) - (EXACT_WING_RADIUS + 8.5 * SPACE_SIZE);
const EXACT_BASE_Y_ADJ = EXACT_BASE_MID_RADIUS * Math.sin(PENTAGON_HALF_ANGLE);

const EXACT_SEAT_GEOMETRY = {
  xAdj: 0,
  yAdj: 0,
  angleAdj: 0,
  radiusAdj: 0,
  widthAdj: 1,
  spaceHeightScale: 1,
  winPathXAdj: 0,
  winPathYAdj: 0,
  winXAdj: 0,
  winYAdj: 0,
  winRotation: 0,
  winScale: 1,
  baseXAdj: EXACT_BASE_X_ADJ,
  baseYAdj: EXACT_BASE_Y_ADJ,
  baseRotation: 216,
  baseWidthScale: EXACT_BASE_WIDTH_SCALE,
  baseHeightScale: EXACT_BASE_HEIGHT_SCALE,
  baseOpacity: 1,
} as const;

export const BOARD_CONFIG = {
  spaceSize: SPACE_SIZE,
  wingRadius: EXACT_WING_RADIUS,
  centerColor: '#1a1a1a',
  pawnSlots: [
    { x: 0, z: -0.4 },
    { x: -0.6, z: 0.5 },
    { x: 0.6, z: 0.5 },
    { x: 0, z: 1.2 },
  ],
};

export const DEFAULT_PLAYERS: PlayerConfig[] = [
  {
    name: 'Anees',
    color: '#2980b9',
    isAI: false,
    personality: 'Strategist',
    gender: 'male',
    wish: [6, 5],
    ...EXACT_SEAT_GEOMETRY,
  },
  {
    name: 'Shahbaz',
    color: '#e67e22',
    isAI: true,
    personality: 'Confidante',
    gender: 'male',
    wish: [6, 5],
    ...EXACT_SEAT_GEOMETRY,
  },
  {
    name: 'Mughal',
    color: '#27ae60',
    isAI: true,
    personality: 'Rival',
    gender: 'male',
    wish: [6, 5],
    ...EXACT_SEAT_GEOMETRY,
  },
  {
    name: 'Zoi',
    color: '#c0392b',
    isAI: true,
    personality: 'Rideordie',
    gender: 'female',
    wish: [6, 5],
    ...EXACT_SEAT_GEOMETRY,
  },
  {
    name: 'Kajal',
    color: '#f1c40f',
    isAI: true,
    personality: 'Strategist',
    gender: 'female',
    wish: [6, 5],
    ...EXACT_SEAT_GEOMETRY,
  },
];

export function cloneDefaultPlayers(): PlayerConfig[] {
  return DEFAULT_PLAYERS.map((p) => ({ ...p, wish: [...p.wish] as [number, number] }));
}

export function createInitialPawns(): PawnState[][] {
  return Array.from({ length: 5 }, () =>
    Array.from({ length: 4 }, () => ({ status: 'home' as PawnStatus, pos: -1 })),
  );
}

export function createInitialPlayerStats(): PlayerStats[] {
  return Array.from({ length: 5 }, () => ({ captures_made: 0, times_captured: 0, penalties: 0 }));
}

// Memoized 69-step paths for arms 0..4
const PATH_CACHE: PathNode[][] = [];

export function getPawnPath(playerIndex: number): PathNode[] {
  const p = ((playerIndex % 5) + 5) % 5;
  if (PATH_CACHE[p]) return PATH_CACHE[p];

  const path: PathNode[] = [];
  // 0..4: own arm right column c=2, r=4..0 (r=4 is entry safe square)
  for (let r = 4; r >= 0; r--) path.push({ arm: p, c: 2, r });

  // 5..56: next 4 arms clockwise (13 squares each = 52 squares)
  for (let i = 1; i < 5; i++) {
    const arm = (p + i) % 5;
    for (let r = 0; r < 6; r++) path.push({ arm, c: 0, r });
    path.push({ arm, c: 1, r: 5 });
    for (let r = 5; r >= 0; r--) path.push({ arm, c: 2, r });
  }

  // 57..62: own arm outer left column c=0, r=0..5 (pos 62 is still open track!)
  for (let r = 0; r < 6; r++) path.push({ arm: p, c: 0, r });

  // 63..67: coloured home path (safe)
  for (let r = 4; r >= 0; r--) path.push({ arm: p, c: 1, r });

  // 68: centre home (Gul)
  path.push({ arm: p, c: 1, r: -1, isHome: true });

  PATH_CACHE[p] = path;
  return path;
}

export function isSafeSpace(space: PathNode | undefined): boolean {
  if (!space || space.isHome) return true;
  if (space.c === 1 && space.r >= 0 && space.r <= 4) return true; // coloured home path
  return (space.c === 2 && space.r === 4) || (space.c === 0 && space.r === 3);
}

export function isLoneTokenOnTrack(pawns: PawnState[][], pIdx: number): boolean {
  const playerPawns = pawns[pIdx];
  if (!playerPawns) return false;
  let onPath = 0;
  for (const p of playerPawns) {
    if (p.status === 'on-path') onPath++;
  }
  return onPath === 1;
}

export function checkSevenRollConditions(pawns: PawnState[][], pIdx: number): boolean {
  const playerPawns = pawns[pIdx];
  if (!playerPawns) return false;
  let baseHomeCount = 0;
  let safeOrFinished = 0;
  for (const p of playerPawns) {
    if (p.status === 'home') {
      baseHomeCount++;
    } else if (p.status === 'finished') {
      safeOrFinished++;
    } else if (p.status === 'on-path' && p.pos >= 63) {
      safeOrFinished++;
    } else {
      // Token is on open running track (0..62)
      return false;
    }
  }
  return baseHomeCount >= 1 && baseHomeCount <= 4 && baseHomeCount + safeOrFinished === 4;
}

export function applyLucky7IfEligible(
  pawns: PawnState[][],
  pIdx: number,
  dice: [number, number],
  alreadyUsedThisTurn: boolean,
): { applied: boolean; dice: [number, number] } {
  if (alreadyUsedThisTurn) return { applied: false, dice };
  const total = Number(dice[0]) + Number(dice[1]);
  if (total !== 7) return { applied: false, dice };
  if (!checkSevenRollConditions(pawns, pIdx)) return { applied: false, dice };
  return { applied: true, dice: [6, 6] };
}

export function canMovePawn(
  pawns: PawnState[][],
  pIdx: number,
  pawnIdx: number,
  steps: number,
  dice: number[],
  movesAvailable: number[],
): boolean {
  const pawn = pawns[pIdx]?.[pawnIdx];
  if (!pawn) return false;
  const path = getPawnPath(pIdx);
  const numSteps = Number(steps);
  if (Number.isNaN(numSteps) || numSteps <= 0) return false;
  if (pawn.status === 'home') return numSteps === 6;
  if (pawn.status === 'finished') return false;
  if (pawn.pos + numSteps >= path.length) return false;

  // Lone Token Rule: a single active runner can only enter coloured home path (>=63)
  // or reach centre home (68) using the full combined roll.
  if (isLoneTokenOnTrack(pawns, pIdx)) {
    const targetPos = pawn.pos + numSteps;
    const entersColoredPath = pawn.pos <= 62 && targetPos >= 63;
    const entersHome = targetPos === path.length - 1;
    if (entersColoredPath || entersHome) {
      const fullTurnRoll = dice.length > 0
        ? dice.reduce((a, b) => a + Number(b), 0)
        : movesAvailable.reduce((a, b) => a + Number(b), 0);
      const availableTotal = movesAvailable.length > 0
        ? movesAvailable.reduce((a, b) => a + Number(b), 0)
        : numSteps;
      if (fullTurnRoll > numSteps || availableTotal > numSteps) {
        return false;
      }
    }
  }
  return true;
}

export function canAnyPawnMove(
  pawns: PawnState[][],
  pIdx: number,
  movesAvailable: number[],
  dice: number[],
): boolean {
  if (!movesAvailable || movesAvailable.length === 0) return false;
  for (const steps of movesAvailable) {
    for (let i = 0; i < 4; i++) {
      if (canMovePawn(pawns, pIdx, i, steps, dice, movesAvailable)) return true;
    }
  }
  if (isLoneTokenOnTrack(pawns, pIdx) && movesAvailable.length > 1) {
    const combined = movesAvailable.reduce((a, b) => a + Number(b), 0);
    const loneIdx = pawns[pIdx].findIndex((p) => p.status === 'on-path');
    if (loneIdx >= 0 && canMovePawn(pawns, pIdx, loneIdx, combined, dice, movesAvailable)) {
      return true;
    }
  }
  return false;
}

export function getLegalMoves(
  pawns: PawnState[][],
  pIdx: number,
  movesAvailable: number[],
  dice: number[],
): MoveOption[] {
  const options: MoveOption[] = [];
  for (let mIdx = 0; mIdx < movesAvailable.length; mIdx++) {
    const steps = movesAvailable[mIdx];
    for (let pawnIdx = 0; pawnIdx < 4; pawnIdx++) {
      if (canMovePawn(pawns, pIdx, pawnIdx, steps, dice, movesAvailable)) {
        options.push({ pawnIdx, dieIdx: mIdx, steps });
      }
    }
  }
  if (isLoneTokenOnTrack(pawns, pIdx) && movesAvailable.length > 1) {
    const combined = movesAvailable.reduce((a, b) => a + Number(b), 0);
    const loneIdx = pawns[pIdx].findIndex((p) => p.status === 'on-path');
    if (loneIdx >= 0 && canMovePawn(pawns, pIdx, loneIdx, combined, dice, movesAvailable)) {
      options.push({ pawnIdx: loneIdx, dieIdx: 'combined', steps: combined });
    }
  }
  return options;
}

function checkCaptureAtPos(
  pawns: PawnState[][],
  pIdx: number,
  pos: number,
  movingPawnIdx: number,
): { targetPlayer: number; targetPawn: number; targetPos: number } | null {
  const path = getPawnPath(pIdx);
  if (pos < 0 || pos >= path.length) return null;
  const targetSpace = path[pos];
  if (!targetSpace || isSafeSpace(targetSpace)) return null;

  // Stack protection: count friendly tokens already on target square (+1 for mover)
  let myCount = 1;
  pawns[pIdx].forEach((p, i) => {
    if (i === movingPawnIdx || p.status !== 'on-path') return;
    const sp = path[p.pos];
    if (sp && sp.arm === targetSpace.arm && sp.c === targetSpace.c && sp.r === targetSpace.r) {
      myCount++;
    }
  });

  for (let oIdx = 0; oIdx < 5; oIdx++) {
    if (oIdx === pIdx) continue;
    const otherPath = getPawnPath(oIdx);
    let otherCount = 0;
    let capPawnIdx = -1;
    let capPawnPos = -1;
    pawns[oIdx].forEach((op, opI) => {
      if (op.status !== 'on-path') return;
      const sp = otherPath[op.pos];
      if (sp && sp.arm === targetSpace.arm && sp.c === targetSpace.c && sp.r === targetSpace.r) {
        otherCount++;
        capPawnIdx = opI;
        capPawnPos = op.pos;
      }
    });
    if (otherCount > 0 && myCount >= otherCount) {
      return { targetPlayer: oIdx, targetPawn: capPawnIdx, targetPos: capPawnPos };
    }
  }
  return null;
}

export function wouldMoveCapture(
  pawns: PawnState[][],
  pIdx: number,
  pawnIdx: number,
  steps: number,
  dice: number[],
  movesAvailable: number[],
): boolean {
  if (!canMovePawn(pawns, pIdx, pawnIdx, steps, dice, movesAvailable)) return false;
  const pawn = pawns[pIdx][pawnIdx];
  const targetPos = pawn.status === 'home' ? 0 : pawn.pos + steps;
  return checkCaptureAtPos(pawns, pIdx, targetPos, pawnIdx) !== null;
}

export function getPossibleCaptures(
  pawns: PawnState[][],
  pIdx: number,
  availableMoves: number[],
  dice: number[],
): CaptureCandidate[] {
  if (!availableMoves || availableMoves.length === 0) return [];
  const captures: CaptureCandidate[] = [];
  const path = getPawnPath(pIdx);

  pawns[pIdx].forEach((pawn, pI) => {
    if (pawn.status === 'finished') return;

    availableMoves.forEach((mv, mvIdx) => {
      if (!canMovePawn(pawns, pIdx, pI, mv, dice, availableMoves)) return;
      const targetPos = pawn.status === 'home' ? 0 : pawn.pos + mv;
      const cap = checkCaptureAtPos(pawns, pIdx, targetPos, pI);
      if (cap) {
        captures.push({
          pawnIdx: pI,
          diceIndices: [mvIdx],
          ...cap,
        });
      }
    });

    if (availableMoves.length === 2) {
      const combos: Array<[number, number]> = [
        [0, 1],
        [1, 0],
      ];
      for (const [firstIdx, secondIdx] of combos) {
        if (canMovePawn(pawns, pIdx, pI, availableMoves[firstIdx], dice, availableMoves)) {
          const pos1 = pawn.status === 'home' ? 0 : pawn.pos + availableMoves[firstIdx];
          if (pos1 < path.length) {
            const pos2 = pos1 + availableMoves[secondIdx];
            if (pos2 < path.length) {
              const cap = checkCaptureAtPos(pawns, pIdx, pos2, pI);
              if (cap) {
                captures.push({
                  pawnIdx: pI,
                  diceIndices: [firstIdx, secondIdx],
                  ...cap,
                });
              }
            }
          }
        }
      }
    }
  });

  return captures;
}

export function getPossiblePairCaptures(
  pawns: PawnState[][],
  pIdx: number,
  availableMoves: number[],
  dice: number[],
): PairCaptureCandidate[] {
  if (!availableMoves || availableMoves.length !== 2) return [];
  const path = getPawnPath(pIdx);
  const results: PairCaptureCandidate[] = [];
  const orders: Array<[number, number]> = [
    [0, 1],
    [1, 0],
  ];

  for (const [idxA, idxB] of orders) {
    const stepsA = Number(availableMoves[idxA]);
    const stepsB = Number(availableMoves[idxB]);
    if (Number.isNaN(stepsA) || Number.isNaN(stepsB) || stepsA <= 0 || stepsB <= 0) continue;

    for (let pawnA = 0; pawnA < 4; pawnA++) {
      const pA = pawns[pIdx]?.[pawnA];
      if (!pA || pA.status === 'finished') continue;
      if (!canMovePawn(pawns, pIdx, pawnA, stepsA, dice, availableMoves)) continue;
      const posA = pA.status === 'home' ? 0 : pA.pos + stepsA;
      if (posA < 0 || posA >= path.length) continue;
      const spaceA = path[posA];
      if (!spaceA || isSafeSpace(spaceA)) continue;

      for (let pawnB = 0; pawnB < 4; pawnB++) {
        if (pawnB === pawnA) continue;
        const pB = pawns[pIdx]?.[pawnB];
        if (!pB || pB.status === 'finished') continue;
        if (pB.status === 'home' && stepsB !== 6) continue;
        const posB = pB.status === 'home' ? 0 : pB.pos + stepsB;
        if (posB !== posA || posB >= path.length) continue;

        let alreadyFriendlyAtTarget = 0;
        for (let k = 0; k < 4; k++) {
          if (k === pawnA || k === pawnB) continue;
          const pk = pawns[pIdx]?.[k];
          if (pk && pk.status === 'on-path' && pk.pos === posA) {
            alreadyFriendlyAtTarget++;
          }
        }
        const singleCount = alreadyFriendlyAtTarget + 1;
        const pairCount = alreadyFriendlyAtTarget + 2;

        for (let oIdx = 0; oIdx < 5; oIdx++) {
          if (oIdx === pIdx) continue;
          const otherPath = getPawnPath(oIdx);
          let otherCount = 0;
          for (const op of pawns[oIdx] || []) {
            if (op.status !== 'on-path') continue;
            const sp = otherPath[op.pos];
            if (sp && sp.arm === spaceA.arm && sp.c === spaceA.c && sp.r === spaceA.r) {
              otherCount++;
            }
          }
          if (otherCount > 0 && pairCount >= otherCount && singleCount < otherCount) {
            results.push({
              pawnIndices: [pawnA, pawnB],
              diceIndices: [idxA, idxB],
              targetPlayer: oIdx,
              targetPos: posA,
            });
          }
        }
      }
    }
  }

  return results;
}

export function evaluateCaptureObligation(
  pawns: PawnState[][],
  pIdx: number,
  availableMoves: number[],
  dice: number[],
): CaptureObligation {
  const allCaptures = getPossibleCaptures(pawns, pIdx, availableMoves, dice);
  const singleCaptures = allCaptures.filter((c) => c.diceIndices.length === 1);
  const combinedCaptures = allCaptures.filter((c) => c.diceIndices.length > 1);
  const pairCaptures = getPossiblePairCaptures(pawns, pIdx, availableMoves, dice);

  const candidateSet = new Set<number>();
  for (const c of singleCaptures) candidateSet.add(c.pawnIdx);
  for (const c of combinedCaptures) candidateSet.add(c.pawnIdx);
  for (const pc of pairCaptures) {
    candidateSet.add(pc.pawnIndices[0]);
    candidateSet.add(pc.pawnIndices[1]);
  }

  let requiredCaptures: 0 | 1 | 2 = 0;

  if (availableMoves.length === 2 && singleCaptures.length > 0) {
    for (const sc of singleCaptures) {
      const dieIdx1 = sc.diceIndices[0];
      const steps1 = availableMoves[dieIdx1];
      const simPawns = pawns.map((row) => row.map((p) => ({ ...p })));
      const simStats = createInitialPlayerStats();
      const out1 = executePawnMove(simPawns, simStats, pIdx, sc.pawnIdx, steps1, dice, availableMoves);
      if (out1.moved && out1.capturedVictims.length > 0) {
        const remMoves = [availableMoves[1 - dieIdx1]];
        const remCaps = getPossibleCaptures(simPawns, pIdx, remMoves, dice);
        if (remCaps.length > 0) {
          requiredCaptures = 2;
          break;
        }
      }
    }
  }

  if (
    requiredCaptures === 0 &&
    (singleCaptures.length > 0 || combinedCaptures.length > 0 || pairCaptures.length > 0)
  ) {
    requiredCaptures = 1;
  }

  return {
    requiredCaptures,
    singleCaptures,
    combinedCaptures,
    pairCaptures,
    candidatePawns: Array.from(candidateSet).sort((a, b) => a - b),
  };
}

export function isMovePartOfCaptureSequence(
  pawns: PawnState[][],
  pIdx: number,
  pawnIdx: number,
  steps: number,
  dieIdx: number | 'combined',
  availableMoves: number[],
  dice: number[],
): boolean {
  if (wouldMoveCapture(pawns, pIdx, pawnIdx, steps, dice, availableMoves)) return true;
  if (dieIdx === 'combined') return false;
  const ob = evaluateCaptureObligation(pawns, pIdx, availableMoves, dice);
  if (ob.combinedCaptures.some((c) => c.pawnIdx === pawnIdx && c.diceIndices[0] === dieIdx)) {
    return true;
  }
  if (ob.pairCaptures.some((pc) => pc.pawnIndices[0] === pawnIdx && pc.diceIndices[0] === dieIdx)) {
    return true;
  }
  return false;
}

export function checkCompulsoryCapturePenalties(
  pawns: PawnState[][],
  playerStats: PlayerStats[],
  pIdx: number,
  requiredCaptures: 0 | 1 | 2,
  capturesMadeThisTurn: number,
  turnStartCandidatePawns: number[],
  missedMidTurnCandidatePawns: number[] = [],
  capturingPawnIndices: number[] = [],
): number[] {
  if (requiredCaptures === 0 || capturesMadeThisTurn >= requiredCaptures) return [];

  let offendingPool: number[];
  if (capturesMadeThisTurn === 0) {
    offendingPool = Array.from(new Set(turnStartCandidatePawns));
  } else if (missedMidTurnCandidatePawns.length > 0) {
    offendingPool = Array.from(new Set(missedMidTurnCandidatePawns));
  } else {
    const capSet = new Set(capturingPawnIndices);
    offendingPool = Array.from(new Set(turnStartCandidatePawns.filter((idx) => !capSet.has(idx))));
  }

  const penalized: number[] = [];
  for (const pawnIdx of offendingPool) {
    const pawn = pawns[pIdx]?.[pawnIdx];
    if (pawn && pawn.status === 'on-path') {
      pawn.status = 'home';
      pawn.pos = -1;
      if (playerStats[pIdx]) {
        playerStats[pIdx].penalties = (playerStats[pIdx].penalties || 0) + 1;
      }
      penalized.push(pawnIdx);
    }
  }
  return penalized;
}

export function checkCompulsoryCapturePenalty(
  pawns: PawnState[][],
  playerStats: PlayerStats[],
  pIdx: number,
  turnStartCaptures: CaptureCandidate[],
  turnCapturedPawn: boolean,
  extraTurnReason: ExtraTurnReason,
): number | null {
  if (turnCapturedPawn || extraTurnReason === 'capture') return null;
  if (!turnStartCaptures || turnStartCaptures.length === 0) return null;

  const uniqueCandidates = Array.from(new Set(turnStartCaptures.map((c) => c.pawnIdx)));
  const penalized = checkCompulsoryCapturePenalties(
    pawns,
    playerStats,
    pIdx,
    1,
    0,
    uniqueCandidates,
  );
  return penalized.length > 0 ? penalized[0] : null;
}

export interface StepMoveOutcome {
  moved: boolean;
  deployedFromBase: boolean;
  reachedCenterHome: boolean;
  capturedVictims: Array<{ playerIdx: number; pawnIdx: number }>;
  wonMatch: boolean;
}

export function executePawnMove(
  pawns: PawnState[][],
  playerStats: PlayerStats[],
  pIdx: number,
  pawnIdx: number,
  steps: number,
  dice: number[],
  movesAvailable: number[],
): StepMoveOutcome {
  const empty: StepMoveOutcome = {
    moved: false,
    deployedFromBase: false,
    reachedCenterHome: false,
    capturedVictims: [],
    wonMatch: false,
  };
  if (!canMovePawn(pawns, pIdx, pawnIdx, steps, dice, movesAvailable)) return empty;

  const pawn = pawns[pIdx][pawnIdx];
  const path = getPawnPath(pIdx);
  let deployedFromBase = false;
  let reachedCenterHome = false;

  if (pawn.status === 'home') {
    pawn.status = 'on-path';
    pawn.pos = 0;
    deployedFromBase = true;
  } else {
    pawn.pos += steps;
    if (pawn.pos === path.length - 1) {
      pawn.status = 'finished';
      reachedCenterHome = true;
    }
  }

  const wonMatch = checkForWin(pawns, pIdx);
  const capturedVictims: Array<{ playerIdx: number; pawnIdx: number }> = [];

  if (pawn.status === 'on-path') {
    const currentSpace = path[pawn.pos];
    if (currentSpace && !isSafeSpace(currentSpace)) {
      let myCount = 0;
      pawns[pIdx].forEach((p) => {
        if (p.status !== 'on-path') return;
        const sp = path[p.pos];
        if (sp && sp.arm === currentSpace.arm && sp.c === currentSpace.c && sp.r === currentSpace.r) {
          myCount++;
        }
      });

      for (let otherPIdx = 0; otherPIdx < 5; otherPIdx++) {
        if (otherPIdx === pIdx) continue;
        const otherPath = getPawnPath(otherPIdx);
        let otherCount = 0;
        pawns[otherPIdx].forEach((op) => {
          if (op.status !== 'on-path') return;
          const sp = otherPath[op.pos];
          if (sp && sp.arm === currentSpace.arm && sp.c === currentSpace.c && sp.r === currentSpace.r) {
            otherCount++;
          }
        });

        if (otherCount > 0 && myCount >= otherCount) {
          pawns[otherPIdx].forEach((op, opIdx) => {
            if (op.status !== 'on-path') return;
            const sp = otherPath[op.pos];
            if (sp && sp.arm === currentSpace.arm && sp.c === currentSpace.c && sp.r === currentSpace.r) {
              op.status = 'home';
              op.pos = -1;
              capturedVictims.push({ playerIdx: otherPIdx, pawnIdx: opIdx });
              if (playerStats[pIdx]) playerStats[pIdx].captures_made++;
              if (playerStats[otherPIdx]) playerStats[otherPIdx].times_captured++;
            }
          });
        }
      }
    }
  }

  return {
    moved: true,
    deployedFromBase,
    reachedCenterHome,
    capturedVictims,
    wonMatch,
  };
}

export function checkForWin(pawns: PawnState[][], pIdx: number): boolean {
  const playerPawns = pawns[pIdx];
  if (!playerPawns) return false;
  const path = getPawnPath(pIdx);
  const coloredPathStartIndex = path.length - 6; // pos 63
  return playerPawns.every(
    (p) => p.status === 'finished' || (p.status === 'on-path' && p.pos >= coloredPathStartIndex),
  );
}

export function getPlayerProgressPercent(pawns: PawnState[][], pIdx: number): {
  percentage: number;
  rawProgress: number;
} {
  const path = getPawnPath(pIdx);
  const pathLen = path.length;
  let playerProgress = 0;
  for (const p of pawns[pIdx] || []) {
    if (p.status === 'on-path') playerProgress += p.pos + 1;
    else if (p.status === 'finished') playerProgress += pathLen;
  }
  return {
    percentage: Math.round((playerProgress / (4 * pathLen)) * 100),
    rawProgress: playerProgress,
  };
}

export function getPlayerRankings(
  pawns: PawnState[][],
  players: Array<{ name: string; color: string }>,
  playerStats: PlayerStats[],
  winnerIdx: number,
): RankingEntry[] {
  const scores = Array.from({ length: 5 }, (_, i) => {
    const { percentage, rawProgress } = getPlayerProgressPercent(pawns, i);
    const st = playerStats[i] || { captures_made: 0, times_captured: 0, penalties: 0 };
    return {
      seat: i,
      name: players[i]?.name || `Player ${i + 1}`,
      color: players[i]?.color || CLASSIC_COLORS[i],
      percentage,
      playerProgress: rawProgress,
      captures_made: st.captures_made || 0,
      times_captured: st.times_captured || 0,
      penalties: st.penalties || 0,
    };
  });

  const winnerScore = scores.find((s) => s.seat === winnerIdx) || scores[0];
  const others = scores
    .filter((s) => s.seat !== winnerIdx)
    .sort((a, b) => b.percentage - a.percentage || b.playerProgress - a.playerProgress);

  const ordered = [winnerScore, ...others];
  const badges = ['🥇', '🥈', '🥉', '', ''];
  const labels = ['1st (Winner)', '2nd', '3rd', '4th', '5th'];

  return ordered.map((item, idx) => ({
    rank: idx + 1,
    badge: badges[idx] || '',
    label: labels[idx] || `${idx + 1}th`,
    ...item,
  }));
}

export type RivalryTier = 'normal' | 'heat' | 'dethrone';

export interface RivalryState {
  leaderIdx: number;
  leaderPct: number;
  runnerUpPct: number;
  leadMargin: number;
  tier: RivalryTier;
}

export interface AIMoveRivalryOptions {
  personality?: string;
  grudgeTargetIdx?: number | null;
}

export function getMatchLeader(pawns: PawnState[][], excludePIdx: number): { leaderIdx: number; score: number } {
  let leaderIdx = -1;
  let maxScore = -1;
  for (let i = 0; i < 5; i++) {
    if (i === excludePIdx) continue;
    let score = 0;
    for (const p of pawns[i] || []) {
      if (p.status === 'finished') score += 1000;
      else if (p.status === 'on-path') score += p.pos + 1;
    }
    if (score > maxScore && score > 0) {
      maxScore = score;
      leaderIdx = i;
    }
  }
  return { leaderIdx, score: maxScore };
}

export function evaluateRivalryState(pawns: PawnState[][], excludePIdx = -1): RivalryState {
  const entries: Array<{ idx: number; pct: number; rawScore: number }> = [];
  for (let i = 0; i < 5; i++) {
    if (i === excludePIdx) continue;
    const { percentage } = getPlayerProgressPercent(pawns, i);
    let rawScore = 0;
    for (const p of pawns[i] || []) {
      if (p.status === 'finished') rawScore += 1000;
      else if (p.status === 'on-path') rawScore += p.pos + 1;
    }
    entries.push({ idx: i, pct: percentage, rawScore });
  }
  entries.sort((a, b) => (b.pct !== a.pct ? b.pct - a.pct : b.rawScore - a.rawScore));
  const top = entries[0];
  const second = entries[1];
  if (!top || top.rawScore <= 0) {
    return { leaderIdx: -1, leaderPct: 0, runnerUpPct: 0, leadMargin: 0, tier: 'normal' };
  }
  const leaderPct = Math.round(top.pct);
  const runnerUpPct = second ? Math.round(second.pct) : 0;
  const leadMargin = Math.max(0, leaderPct - runnerUpPct);

  let tier: RivalryTier = 'normal';
  if (leaderPct >= 75 || (leaderPct >= 45 && leadMargin >= 20)) {
    tier = 'dethrone';
  } else if (leaderPct >= 55 || (leaderPct >= 30 && leadMargin >= 12)) {
    tier = 'heat';
  }

  return {
    leaderIdx: top.idx,
    leaderPct,
    runnerUpPct,
    leadMargin,
    tier,
  };
}

function isTrackSafeNode(node?: PathNode | null): boolean {
  if (!node) return false;
  if (node.isHome) return true;
  return (node.c === 2 && node.r === 4) || (node.c === 0 && node.r === 3);
}

function countSameColorAtNode(
  pawns: PawnState[][],
  seatIdx: number,
  targetNode: PathNode,
  excludePawnIdx = -1,
): number {
  const path = getPawnPath(seatIdx);
  let count = 0;
  for (let t = 0; t < 4; t++) {
    if (t === excludePawnIdx) continue;
    const p = pawns[seatIdx]?.[t];
    if (!p || p.status !== 'on-path') continue;
    const sp = path[p.pos];
    if (sp && !sp.isHome && sp.arm === targetNode.arm && sp.c === targetNode.c && sp.r === targetNode.r) {
      count++;
    }
  }
  return count;
}

export function isEntrySquareThreatened(pawns: PawnState[][], pIdx: number): boolean {
  const path = getPawnPath(pIdx);
  const entrySpace = path[0];
  for (let oIdx = 0; oIdx < 5; oIdx++) {
    if (oIdx === pIdx) continue;
    const otherPath = getPawnPath(oIdx);
    for (const otherPawn of pawns[oIdx] || []) {
      if (otherPawn.status !== 'on-path') continue;
      const otherSpace = otherPath[otherPawn.pos];
      if (otherSpace && otherSpace.arm === entrySpace.arm && otherSpace.c === entrySpace.c && otherSpace.r === entrySpace.r) {
        return true;
      }
      for (let d = 1; d <= 6; d++) {
        const potPos = otherPawn.pos + d;
        if (potPos < otherPath.length) {
          const potSpace = otherPath[potPos];
          if (potSpace && potSpace.arm === entrySpace.arm && potSpace.c === entrySpace.c && potSpace.r === entrySpace.r) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

export function pickBestAIMove(
  pawns: PawnState[][],
  pIdx: number,
  movesAvailable: number[],
  dice: number[],
  options?: AIMoveRivalryOptions,
): { move: MoveOption | null; hitsLeader: boolean; hitsGrudge: boolean } {
  const legalMoves = getLegalMoves(pawns, pIdx, movesAvailable, dice);
  if (legalMoves.length === 0) return { move: null, hitsLeader: false, hitsGrudge: false };

  const overallRivalry = evaluateRivalryState(pawns, -1);
  const targetLeaderIdx =
    overallRivalry.leaderIdx !== -1 && overallRivalry.leaderIdx !== pIdx
      ? overallRivalry.leaderIdx
      : getMatchLeader(pawns, pIdx).leaderIdx;
  const targetIsOverallLeader = overallRivalry.leaderIdx === targetLeaderIdx && targetLeaderIdx !== -1;
  const dethroneActive = targetIsOverallLeader && overallRivalry.tier === 'dethrone';
  const heatActive = targetIsOverallLeader && (overallRivalry.tier === 'heat' || overallRivalry.tier === 'dethrone');

  const personality = options?.personality || 'Strategist';
  const isRival = personality === 'Rival';
  const isStrategist = personality === 'Strategist';
  const isConfidante = personality === 'Confidante';
  const isRideOrDie = personality === 'Rideordie';

  const grudgeTargetIdx =
    typeof options?.grudgeTargetIdx === 'number' && options.grudgeTargetIdx !== pIdx
      ? options.grudgeTargetIdx
      : -1;

  const obligation = evaluateCaptureObligation(pawns, pIdx, movesAvailable, dice);
  const possibleCaptures = [...obligation.singleCaptures, ...obligation.combinedCaptures];

  if (possibleCaptures.length > 0) {
    // If 2 independent captures are required, prioritize a first single-die capture that keeps a 2nd capture alive
    let candidateList = possibleCaptures;
    if (obligation.requiredCaptures === 2 && movesAvailable.length === 2) {
      const doubleChain = obligation.singleCaptures.filter((sc) => {
        const dieIdx1 = sc.diceIndices[0];
        const simPawns = pawns.map((row) => row.map((p) => ({ ...p })));
        const simStats = createInitialPlayerStats();
        const out1 = executePawnMove(simPawns, simStats, pIdx, sc.pawnIdx, movesAvailable[dieIdx1], dice, movesAvailable);
        if (!out1.moved || out1.capturedVictims.length === 0) return false;
        return getPossibleCaptures(simPawns, pIdx, [movesAvailable[1 - dieIdx1]], dice).length > 0;
      });
      if (doubleChain.length > 0) candidateList = doubleChain;
    }

    const leaderCaptures =
      targetLeaderIdx !== -1 ? candidateList.filter((c) => c.targetPlayer === targetLeaderIdx) : [];
    const grudgeCaptures =
      grudgeTargetIdx !== -1 ? candidateList.filter((c) => c.targetPlayer === grudgeTargetIdx) : [];

    let selected: CaptureCandidate;
    if (leaderCaptures.length > 0) {
      leaderCaptures.sort((a, b) => b.targetPos - a.targetPos);
      selected = leaderCaptures[0];
    } else if (grudgeCaptures.length > 0) {
      grudgeCaptures.sort((a, b) => b.targetPos - a.targetPos);
      selected = grudgeCaptures[0];
    } else {
      candidateList.sort((a, b) => b.targetPos - a.targetPos);
      selected = candidateList[0];
    }

    const found = legalMoves.find((m) => m.pawnIdx === selected.pawnIdx && m.dieIdx === selected.diceIndices[0]);
    if (found) {
      return {
        move: found,
        hitsLeader: selected.targetPlayer === targetLeaderIdx,
        hitsGrudge: selected.targetPlayer === grudgeTargetIdx,
      };
    }
  } else if (obligation.pairCaptures.length > 0) {
    const leaderPairs =
      targetLeaderIdx !== -1 ? obligation.pairCaptures.filter((pc) => pc.targetPlayer === targetLeaderIdx) : [];
    const grudgePairs =
      grudgeTargetIdx !== -1 ? obligation.pairCaptures.filter((pc) => pc.targetPlayer === grudgeTargetIdx) : [];
    const pool = leaderPairs.length > 0 ? leaderPairs : grudgePairs.length > 0 ? grudgePairs : obligation.pairCaptures;
    pool.sort((a, b) => b.targetPos - a.targetPos);
    const picked = pool[0];
    const found = legalMoves.find((m) => m.pawnIdx === picked.pawnIndices[0] && m.dieIdx === picked.diceIndices[0]);
    if (found) {
      return {
        move: found,
        hitsLeader: picked.targetPlayer === targetLeaderIdx,
        hitsGrudge: picked.targetPlayer === grudgeTargetIdx,
      };
    }
  }

  const myPath = getPawnPath(pIdx);
  const leaderMult = dethroneActive ? 1.55 : heatActive ? 1.25 : isRival ? 1.2 : 1.0;

  const scored = legalMoves.map((m) => {
    const pawn = pawns[pIdx][m.pawnIdx];
    let score = 0;
    const newPos = pawn.status === 'home' ? 0 : pawn.pos + m.steps;

    // Immediate winning move: final token reaches coloured stretch (pos >= 63)
    if (pawn.pos < 63 && newPos >= 63) {
      const allNowWin = pawns[pIdx].every((op, idx) =>
        idx === m.pawnIdx ? newPos >= 63 : op.status === 'finished' || (op.status === 'on-path' && op.pos >= 63),
      );
      if (allNowWin) score += 2000;
      else score += 120;
    }

    if (newPos >= myPath.length - 1) score += 500;
    if (pawn.status === 'home' && m.steps === 6) {
      score += isEntrySquareThreatened(pawns, pIdx) ? 20 : 150;
    }

    const newSpace = newPos >= 0 && newPos < myPath.length ? myPath[newPos] : null;
    const landingOnSafe = isTrackSafeNode(newSpace);
    const friendlyCountAtNew =
      newSpace && !newSpace.isHome ? countSameColorAtNode(pawns, pIdx, newSpace, m.pawnIdx) : 0;

    // Safe star shelter
    if (newSpace && !newSpace.isHome && landingOnSafe) {
      score += 80;
    }

    // 2-Token Stack Shield + Roadblock against the Leader's front path
    if (newSpace && !newSpace.isHome && !landingOnSafe && friendlyCountAtNew >= 1) {
      score += isStrategist || isRideOrDie ? 90 : 55;
      if (targetLeaderIdx !== -1 && pawns[targetLeaderIdx]) {
        const leaderPath = getPawnPath(targetLeaderIdx);
        let blocksLeaderPath = false;
        for (const lp of pawns[targetLeaderIdx]) {
          if (lp.status !== 'on-path') continue;
          for (let ahead = 1; ahead <= 8; ahead++) {
            const aheadPos = lp.pos + ahead;
            if (aheadPos >= leaderPath.length) break;
            const aheadSpace = leaderPath[aheadPos];
            if (aheadSpace && !aheadSpace.isHome && aheadSpace.arm === newSpace.arm && aheadSpace.c === newSpace.c && aheadSpace.r === newSpace.r) {
              blocksLeaderPath = true;
              break;
            }
          }
          if (blocksLeaderPath) break;
        }
        if (blocksLeaderPath) {
          score += (dethroneActive ? 145 : heatActive ? 105 : 70) + (isStrategist ? 45 : 0);
        }
      }
    }

    // Ambush Leader 1..6 steps behind their pawns
    if (targetLeaderIdx !== -1 && pawns[targetLeaderIdx] && newSpace && !newSpace.isHome) {
      const leaderPath = getPawnPath(targetLeaderIdx);
      for (const lp of pawns[targetLeaderIdx]) {
        if (lp.status !== 'on-path') continue;
        const lpSpace = leaderPath[lp.pos];
        if (!lpSpace || lpSpace.isHome) continue;
        for (let testRoll = 1; testRoll <= 6; testRoll++) {
          const strikePos = newPos + testRoll;
          if (strikePos < myPath.length) {
            const strikeSpace = myPath[strikePos];
            if (strikeSpace && strikeSpace.arm === lpSpace.arm && strikeSpace.c === lpSpace.c && strikeSpace.r === lpSpace.r) {
              const lateLeaderBonus = isStrategist && lp.pos >= 48 ? 110 : 0;
              score += Math.round((260 + lp.pos) * leaderMult) + lateLeaderBonus;
            }
          }
        }
      }
    }

    // Grudge Revenge Stalking: position 1..6 steps behind the seat that captured us
    if (grudgeTargetIdx !== -1 && grudgeTargetIdx !== targetLeaderIdx && pawns[grudgeTargetIdx] && newSpace && !newSpace.isHome) {
      const grudgePath = getPawnPath(grudgeTargetIdx);
      for (const gp of pawns[grudgeTargetIdx]) {
        if (gp.status !== 'on-path') continue;
        const gpSpace = grudgePath[gp.pos];
        if (!gpSpace || gpSpace.isHome) continue;
        for (let testRoll = 1; testRoll <= 6; testRoll++) {
          const strikePos = newPos + testRoll;
          if (strikePos < myPath.length) {
            const strikeSpace = myPath[strikePos];
            if (strikeSpace && strikeSpace.arm === gpSpace.arm && strikeSpace.c === gpSpace.c && strikeSpace.r === gpSpace.r) {
              score += isRival ? 190 : 140;
            }
          }
        }
      }
    }

    // "Don't Feed the Leader": penalize exposing a lone pawn 1..6 steps ahead of opponents (especially #1)
    if (newSpace && !newSpace.isHome && !landingOnSafe && friendlyCountAtNew === 0) {
      for (let oIdx = 0; oIdx < 5; oIdx++) {
        if (oIdx === pIdx) continue;
        const oPath = getPawnPath(oIdx);
        for (const op of pawns[oIdx] || []) {
          if (op.status !== 'on-path') continue;
          for (let d = 1; d <= 6; d++) {
            const oTarget = op.pos + d;
            if (oTarget >= oPath.length) break;
            const oSpace = oPath[oTarget];
            if (oSpace && !oSpace.isHome && oSpace.arm === newSpace.arm && oSpace.c === newSpace.c && oSpace.r === newSpace.r) {
              if (oIdx === targetLeaderIdx) {
                score -= dethroneActive ? 200 : isConfidante ? 160 : 135;
              } else {
                score -= 40;
              }
            }
          }
        }
      }
    }

    // Leaving a safe star when no immediate threat/ambush gains slightly lower preference vs staying sheltered
    if (pawn.status === 'on-path' && isTrackSafeNode(myPath[pawn.pos]) && !landingOnSafe && friendlyCountAtNew === 0) {
      score -= isStrategist ? 25 : 10;
    }

    score += Math.max(0, newPos);
    return { move: m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return { move: scored[0]?.move || legalMoves[0], hitsLeader: false, hitsGrudge: false };
}

// Progress bar display helpers (enforces rank 1..3 medals, rank 4..5 emoji if present, NO numbers/keycaps)
const EMOJI_EXTRACT_RE = /(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)/u;
const KEYCAP_OR_DIGIT_RE = /^[0-9#*]|[\u20E3]/;

export function extractPlayerEmoji(name: string): string {
  const match = String(name || '').match(EMOJI_EXTRACT_RE);
  if (!match) return '';
  if (KEYCAP_OR_DIGIT_RE.test(match[1])) return '';
  return match[1];
}

export function extractPlayerInitial(name: string): string {
  const clean = String(name || '')
    .replace(/\s+#[a-f0-9]{4}$/i, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '')
    .trim();
  return (clean.charAt(0) || 'P').toUpperCase();
}

export function stripSeatTag(name: string): string {
  return String(name || '').replace(/\s+#[a-f0-9]{4}$/i, '').trim() || 'Player';
}

// ============================================================================
// Seedable Deterministic RNG (Mulberry32) for tests & reproducible simulation
// ============================================================================
export type RngFn = () => number;

export function createSeededRng(seed: number): RngFn {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollDicePair(rng: RngFn = Math.random): [number, number] {
  const d1 = Math.min(6, Math.max(1, Math.floor(rng() * 6) + 1));
  const d2 = Math.min(6, Math.max(1, Math.floor(rng() * 6) + 1));
  return [d1, d2];
}

