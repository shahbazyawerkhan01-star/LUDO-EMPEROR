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

export function applySplitSacrifice(
  pawns: PawnState[][],
  pIdx: number,
  movingPawnIdx: number,
  startPos: number,
  possibleCaptures: CaptureCandidate[],
  usedDieIdx: number | 'combined',
): boolean {
  if (startPos < 0 || usedDieIdx === 'combined') return false;
  if (!possibleCaptures || possibleCaptures.length === 0) return false;

  const isCombinedCaptureStep = possibleCaptures.some(
    (c) => c.pawnIdx === movingPawnIdx && c.diceIndices.length > 1 && c.diceIndices[0] === usedDieIdx,
  );
  if (!isCombinedCaptureStep) return false;

  const path = getPawnPath(pIdx);
  const startSpace = path[startPos];
  if (isSafeSpace(startSpace)) return false;

  const partners: number[] = [];
  pawns[pIdx].forEach((p, i) => {
    if (i !== movingPawnIdx && p.status === 'on-path' && p.pos === startPos) {
      partners.push(i);
    }
  });

  if (partners.length === 1) {
    const partnerIdx = partners[0];
    pawns[pIdx][partnerIdx] = { status: 'home', pos: -1 };
    return true;
  }
  return false;
}

export function checkCompulsoryCapturePenalty(
  pawns: PawnState[][],
  playerStats: PlayerStats[],
  pIdx: number,
  turnStartCaptures: CaptureCandidate[],
  turnCapturedPawn: boolean,
  extraTurnReason: ExtraTurnReason,
  usedDieIndex?: number,
  movedPawnIdx?: number,
): number | null {
  if (turnCapturedPawn || extraTurnReason === 'capture') return null;
  if (!turnStartCaptures || turnStartCaptures.length === 0) return null;

  let penalizedPawnIdx: number | null = null;
  if (movedPawnIdx !== undefined && turnStartCaptures.some((c) => c.pawnIdx === movedPawnIdx)) {
    penalizedPawnIdx = movedPawnIdx;
  } else if (usedDieIndex !== undefined) {
    const matchDie = turnStartCaptures.find((c) => c.diceIndices[0] === usedDieIndex);
    if (matchDie) penalizedPawnIdx = matchDie.pawnIdx;
  }

  if (penalizedPawnIdx === null) {
    let maxPos = -2;
    for (const c of turnStartCaptures) {
      const p = pawns[pIdx]?.[c.pawnIdx];
      if (p && p.status === 'on-path' && p.pos > maxPos) {
        maxPos = p.pos;
        penalizedPawnIdx = c.pawnIdx;
      }
    }
    if (penalizedPawnIdx === null && turnStartCaptures[0]) {
      penalizedPawnIdx = turnStartCaptures[0].pawnIdx;
    }
  }

  if (penalizedPawnIdx !== null) {
    const pawn = pawns[pIdx]?.[penalizedPawnIdx];
    if (pawn && pawn.status === 'on-path') {
      pawn.status = 'home';
      pawn.pos = -1;
      if (playerStats[pIdx]) {
        playerStats[pIdx].penalties = (playerStats[pIdx].penalties || 0) + 1;
      }
      return penalizedPawnIdx;
    }
  }
  return null;
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
): { move: MoveOption | null; hitsLeader: boolean } {
  const legalMoves = getLegalMoves(pawns, pIdx, movesAvailable, dice);
  if (legalMoves.length === 0) return { move: null, hitsLeader: false };

  const { leaderIdx } = getMatchLeader(pawns, pIdx);
  const possibleCaptures = getPossibleCaptures(pawns, pIdx, movesAvailable, dice);

  if (possibleCaptures.length > 0) {
    const leaderCaptures = leaderIdx !== -1 ? possibleCaptures.filter((c) => c.targetPlayer === leaderIdx) : [];
    let selected: CaptureCandidate;
    if (leaderCaptures.length > 0) {
      leaderCaptures.sort((a, b) => b.targetPos - a.targetPos);
      selected = leaderCaptures[0];
    } else {
      possibleCaptures.sort((a, b) => b.targetPos - a.targetPos);
      selected = possibleCaptures[0];
    }
    const found = legalMoves.find((m) => m.pawnIdx === selected.pawnIdx && m.dieIdx === selected.diceIndices[0]);
    if (found) {
      return { move: found, hitsLeader: leaderCaptures.length > 0 };
    }
  }

  const myPath = getPawnPath(pIdx);
  const scored = legalMoves.map((m) => {
    const pawn = pawns[pIdx][m.pawnIdx];
    let score = 0;
    const newPos = pawn.status === 'home' ? 0 : pawn.pos + m.steps;

    if (newPos >= myPath.length - 1) score += 500;
    if (pawn.status === 'home' && m.steps === 6) {
      score += isEntrySquareThreatened(pawns, pIdx) ? 20 : 150;
    }

    if (leaderIdx !== -1 && pawns[leaderIdx] && newPos >= 0 && newPos < myPath.length) {
      const leaderPath = getPawnPath(leaderIdx);
      const newSpace = myPath[newPos];
      if (newSpace && !newSpace.isHome) {
        for (const lp of pawns[leaderIdx]) {
          if (lp.status !== 'on-path') continue;
          const lpSpace = leaderPath[lp.pos];
          if (!lpSpace) continue;
          for (let testRoll = 1; testRoll <= 6; testRoll++) {
            const strikePos = newPos + testRoll;
            if (strikePos < myPath.length) {
              const strikeSpace = myPath[strikePos];
              if (strikeSpace && strikeSpace.arm === lpSpace.arm && strikeSpace.c === lpSpace.c && strikeSpace.r === lpSpace.r) {
                score += 260 + lp.pos;
              }
            }
          }
        }
      }
    }

    if (newPos >= 0 && newPos < myPath.length) {
      const sp = myPath[newPos];
      if (sp && ((sp.c === 2 && sp.r === 4) || (sp.c === 0 && sp.r === 3))) {
        score += 80;
      }
    }

    score += Math.max(0, newPos);
    return { move: m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return { move: scored[0]?.move || legalMoves[0], hitsLeader: false };
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

