import type { Graphics } from 'pixi.js';
import type { TokenGenderMode, TokenStyleId } from '../sdk/runSdk';
import {
  ANIMAL_MIX_BY_SEAT,
  ANIMAL_TOKENS,
  drawAnimalGroundAura,
  drawAnimalToken,
  type AnimalArchetypeId,
} from './animalTokens';

export type { AnimalArchetypeId } from './animalTokens';
export { ANIMAL_TOKENS, drawAnimalGroundAura } from './animalTokens';

export type CharacterArchetypeId = Exclude<TokenStyleId, 'default' | 'squad_mix' | 'animal_mix'>;
export type HumanCharacterId = Exclude<CharacterArchetypeId, AnimalArchetypeId>;
export type CharacterGender = 'girl' | 'boy';
export type CharacterCelebrationKind = 'capture' | 'home_stretch' | 'center_home' | 'bonus';

export interface CharacterTokenMeta {
  id: CharacterArchetypeId;
  label: string;
  emoji: string;
  poseSummary: string;
  soundSummary: string;
}

export type TokenLocomotionMode = 'slither' | 'fly' | 'walk' | 'jump';

export function isAnimalCharacter(id: CharacterArchetypeId | TokenStyleId | null | undefined): id is AnimalArchetypeId {
  return typeof id === 'string' && id.startsWith('animal_') && id !== 'animal_mix';
}

export function getTokenLocomotionMode(
  charId: CharacterArchetypeId | null | undefined,
): TokenLocomotionMode {
  if (!charId) return 'jump';
  if (charId === 'animal_cobra') return 'slither';
  if (charId === 'animal_eagle') return 'fly';
  if (
    charId === 'animal_frog' ||
    charId === 'animal_kangaroo' ||
    charId === 'gymnast' ||
    charId === 'climber_3d'
  ) {
    return 'jump';
  }
  return 'walk';
}

export const HUMAN_CHARACTER_TOKENS: CharacterTokenMeta[] = [
  {
    id: 'belly_dancer',
    label: 'Belly Dancer',
    emoji: '💃',
    poseSummary: 'Hip-sway idle, twirl step, celebratory spin',
    soundSummary: 'Shimmering bell chimes + light rhythmic tap',
  },
  {
    id: 'sprinter_man',
    label: '100m Sprinter',
    emoji: '🏃',
    poseSummary: 'Athletic crouch, fast forward stride, streak burst',
    soundSummary: 'Crisp turf footsteps + fast dash whoosh',
  },
  {
    id: 'model_runway',
    label: 'Runway Model',
    emoji: '🕶️',
    poseSummary: 'Confident runway stance, catwalk step, signature pose',
    soundSummary: 'Clean heel/step click + stylish chord sting',
  },
  {
    id: 'gymnast',
    label: 'Gymnast',
    emoji: '🤸',
    poseSummary: 'Balanced stance, acrobatic hop, mid-air flip',
    soundSummary: 'Springy vault hop + air-flip & stick-landing thud',
  },
  {
    id: 'wrestler',
    label: 'Wrestler',
    emoji: '🤼',
    poseSummary: 'Wide grappling stance, power step, slam finish',
    soundSummary: 'Heavy mat thud + strong slam impact',
  },
  {
    id: 'climber_3d',
    label: '3D Climber & Jumper',
    emoji: '🧗',
    poseSummary: 'Alert ready grip, high-arc leap & vault across stacks',
    soundSummary: 'Rising climb arc + crisp peak vault chime',
  },
  {
    id: 'ninja_fighter',
    label: 'Ninja Fighter',
    emoji: '🥷',
    poseSummary: 'Low stealth guard, silent dash, sharp kick strike',
    soundSummary: 'Fast stealth slice whoosh + sharp strike snap',
  },
  {
    id: 'skater_3d',
    label: '3D Skateboarder',
    emoji: '🛹',
    poseSummary: 'Board stance, smooth rolling glide & ollie hop',
    soundSummary: 'Wheel roll + crisp ollie pop & trick snap',
  },
  {
    id: 'breakdancer',
    label: 'Breakdancer',
    emoji: '🕺',
    poseSummary: 'Top-rock groove idle, bounce step, spin & freeze',
    soundSummary: 'Funky groove tap + spin sweep & freeze hit',
  },
  {
    id: 'strongman',
    label: 'Weightlifter / Strongman',
    emoji: '🏋️',
    poseSummary: 'Upright twin-dumbbell stance, alternating hand press march',
    soundSummary: 'Solid iron step + deep power-lift slam',
  },
];

export const CHARACTER_TOKENS: CharacterTokenMeta[] = [...HUMAN_CHARACTER_TOKENS, ...ANIMAL_TOKENS];

export const TOKEN_STYLE_OPTIONS: Array<{
  value: TokenStyleId;
  label: string;
  desc: string;
  group: 'classic' | 'humans' | 'animals';
}> = [
  {
    value: 'default',
    label: '♟️ Default (Classic Pawns)',
    desc: 'Classic polished 3D tokens & original board SFX.',
    group: 'classic',
  },
  {
    value: 'squad_mix',
    label: '🌟 5-Player Mix Roster (All Heroes)',
    desc: 'Each seat gets a unique 3D character pose & matched SFX.',
    group: 'humans',
  },
  ...HUMAN_CHARACTER_TOKENS.map((c) => ({
    value: c.id as TokenStyleId,
    label: `${c.emoji} ${c.label}`,
    desc: `${c.poseSummary} • ${c.soundSummary}`,
    group: 'humans' as const,
  })),
  {
    value: 'animal_mix',
    label: '🐾 5-Player Wild Animal Pack',
    desc: 'Each seat becomes a distinct 3D animal with real gait & original voice SFX.',
    group: 'animals',
  },
  ...ANIMAL_TOKENS.map((a) => ({
    value: a.id as TokenStyleId,
    label: `${a.emoji} ${a.label}`,
    desc: `${a.poseSummary} • ${a.soundSummary}`,
    group: 'animals' as const,
  })),
];

const SQUAD_MIX_BY_SEAT: HumanCharacterId[] = [
  'ninja_fighter',
  'sprinter_man',
  'skater_3d',
  'belly_dancer',
  'wrestler',
];

export function resolveCharacterId(
  style: TokenStyleId | undefined,
  seatIdx: number,
  seatOverrides?: Partial<Record<number, CharacterArchetypeId | null>> | null,
): CharacterArchetypeId | null {
  if (seatOverrides && seatIdx in seatOverrides) {
    return seatOverrides[seatIdx] ?? null;
  }
  if (!style || style === 'default') return null;
  if (style === 'squad_mix') {
    const idx = ((seatIdx % SQUAD_MIX_BY_SEAT.length) + SQUAD_MIX_BY_SEAT.length) % SQUAD_MIX_BY_SEAT.length;
    return SQUAD_MIX_BY_SEAT[idx];
  }
  if (style === 'animal_mix') {
    const idx = ((seatIdx % ANIMAL_MIX_BY_SEAT.length) + ANIMAL_MIX_BY_SEAT.length) % ANIMAL_MIX_BY_SEAT.length;
    return ANIMAL_MIX_BY_SEAT[idx];
  }
  return style;
}

export function pickRandomAiSeatTokenOverrides(
  players: Array<{ isAI: boolean }>,
  humanStyle: TokenStyleId | undefined,
  previousOverrides?: Partial<Record<number, CharacterArchetypeId | null>> | null,
  rng: () => number = Math.random,
): Partial<Record<number, CharacterArchetypeId>> {
  const humanUsed = new Set<CharacterArchetypeId>();
  players.forEach((p, idx) => {
    if (!p.isAI) {
      const hId = resolveCharacterId(humanStyle, idx);
      if (hId) humanUsed.add(hId);
    }
  });

  const allIds = CHARACTER_TOKENS.map((c) => c.id);
  const pool = allIds.filter((id) => !humanUsed.has(id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }

  const result: Partial<Record<number, CharacterArchetypeId>> = {};
  const chosenThisMatch = new Set<CharacterArchetypeId>();

  players.forEach((p, idx) => {
    if (!p.isAI) return;
    const prevId = previousOverrides?.[idx] ?? null;
    const freshPick = pool.find((id) => !chosenThisMatch.has(id) && id !== prevId);
    const fallbackPick = freshPick || pool.find((id) => !chosenThisMatch.has(id)) || allIds[idx % allIds.length];
    result[idx] = fallbackPick;
    chosenThisMatch.add(fallbackPick);
  });

  return result;
}

export function resolveCharacterGender(
  mode: TokenGenderMode | undefined,
  seatGender?: 'male' | 'female',
): CharacterGender {
  if (mode === 'girl') return 'girl';
  if (mode === 'boy') return 'boy';
  return seatGender === 'female' ? 'girl' : 'boy';
}

export function getCharacterMeta(id: CharacterArchetypeId): CharacterTokenMeta {
  return CHARACTER_TOKENS.find((c) => c.id === id) || CHARACTER_TOKENS[0];
}

function blendHex(hexA: number, hexB: number, t: number): number {
  const rA = (hexA >> 16) & 0xff;
  const gA = (hexA >> 8) & 0xff;
  const bA = hexA & 0xff;
  const rB = (hexB >> 16) & 0xff;
  const gB = (hexB >> 8) & 0xff;
  const bB = hexB & 0xff;
  const r = Math.max(0, Math.min(255, Math.round(rA + (rB - rA) * t)));
  const g = Math.max(0, Math.min(255, Math.round(gA + (gB - gA) * t)));
  const b = Math.max(0, Math.min(255, Math.round(bA + (bB - bA) * t)));
  return (r << 16) | (g << 8) | b;
}

interface DrawParams {
  gfx: Graphics;
  charId: CharacterArchetypeId;
  gender: CharacterGender;
  colorHex: number;
  nowMs: number;
  seatIdx: number;
  pawnIdx: number;
  facing: 1 | -1;
  dirX: number;
  dirY: number;
  isMovable: boolean;
  isMoving: boolean;
  stepFraction: number;
  travelPhase: number;
  bounce: number;
  flightLift?: number;
  celebrateProgress: number; // 0 if inactive, 0..1 while celebrating
  celebrateKind: CharacterCelebrationKind | null;
}

function drawCapsuleLimb(
  gfx: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number,
  fillHex: number,
  strokeHex = 0x0f172a,
): void {
  gfx.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: thickness + 2.2, color: strokeHex, cap: 'round' });
  gfx.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: thickness, color: fillHex, cap: 'round' });
}

/**
 * Renders a 3D-shaded articulated character token anchored with feet at (0, 0).
 * Standing tokens hold a completely relaxed upright posture with arms hanging naturally at sides
 * and align 360 degrees with the path vector (dirX, dirY) on the tilted board.
 * While actively moving or celebrating, tokens transition immediately into their signature craft pose.
 */
export function drawCharacterToken(p: DrawParams): void {
  const {
    gfx,
    charId,
    gender,
    colorHex,
    nowMs,
    seatIdx,
    pawnIdx,
    facing,
    dirX,
    dirY,
    isMovable,
    isMoving,
    stepFraction,
    travelPhase,
    bounce,
    flightLift = 0,
    celebrateProgress,
    celebrateKind,
  } = p;

  if (isAnimalCharacter(charId)) {
    drawAnimalToken({
      gfx,
      charId,
      colorHex,
      nowMs,
      seatIdx,
      pawnIdx,
      facing,
      dirX,
      dirY,
      isMovable,
      isMoving,
      stepFraction,
      travelPhase,
      bounce,
      flightLift,
      celebrateProgress,
      celebrateKind,
    });
    return;
  }

  gfx.clear();

  const lightTint = blendHex(colorHex, 0xffffff, 0.38);
  const darkTint = blendHex(colorHex, 0x090d16, 0.44);
  const goldAccent = 0xf1c40f;
  const skinBase = seatIdx % 2 === 0 ? 0xf6c9a5 : 0xe3a87c;
  const skinShade = blendHex(skinBase, 0x7c4829, 0.25);
  const hairColor = gender === 'girl' ? 0x2b1b17 : 0x1a1a24;
  const isGirl = gender === 'girl';

  // Normalize 2D path direction vector in tilted screen space (+fwd along path, +side perpendicular right)
  const rawLen = Math.hypot(dirX, dirY);
  const ux = rawLen > 0.01 ? dirX / rawLen : facing;
  const uy = rawLen > 0.01 ? dirY / rawLen : 0;
  const rx = -uy;
  const ry = ux;
  const gFlat = 0.44; // Ground plane vertical foreshortening on tilted board
  const effFacing: 1 | -1 = Math.abs(ux) > 0.05 ? (ux >= 0 ? 1 : -1) : facing;

  const celebrating = celebrateProgress > 0 && celebrateProgress < 1;
  const activeCraft = isMoving || celebrating;
  const celWave = celebrating ? Math.sin(celebrateProgress * Math.PI) : 0;

  // Continuous craft cycle across multi-tile travel (prevents per-square animation resets)
  const craftPhase = isMoving ? travelPhase : celebrating ? celebrateProgress * Math.PI * 4 : 0;
  const movablePulse = !activeCraft && isMovable ? Math.sin(nowMs * 0.008 + seatIdx * 0.9 + pawnIdx * 0.5) : 0;

  // Only Climber & Gymnast leave the track per tile; all other characters walk/stride/glide ON the track
  const isJumperChar = charId === 'climber_3d' || charId === 'gymnast';
  const stepArc = isMoving ? Math.sin(Math.max(0, Math.min(1, stepFraction)) * Math.PI) : 0;
  let liftY = isJumperChar ? bounce : 0;
  if (isMoving && isJumperChar) {
    liftY += stepArc * 14.5;
  }
  if (celebrating && isJumperChar) {
    liftY += celWave * 19;
  }

  let swaySide = 0;
  let leanFwd = 0; // Canonical +forward along path vector (ux, uy)
  let torsoSquashY = 1;
  let spinFactor = 1;
  let flipTilt = 0;

  if (activeCraft) {
    switch (charId) {
      case 'belly_dancer':
        if (isMoving) {
          swaySide = Math.sin(craftPhase * 1.3) * (isGirl ? 4.2 : 2.8);
          leanFwd = 1.6 + Math.cos(craftPhase * 1.3) * 1.2;
          spinFactor = Math.cos(craftPhase * 0.45);
        } else if (celebrating) {
          spinFactor = Math.cos(celebrateProgress * Math.PI * 4);
        }
        break;
      case 'sprinter_man':
        leanFwd = 8.6;
        torsoSquashY = 0.89;
        break;
      case 'model_runway':
        if (isMoving) {
          swaySide = Math.sin(craftPhase * 1.2) * 2.5;
          leanFwd = 1.6;
        } else if (celebrating) {
          leanFwd = -2.2;
          spinFactor = Math.cos(celebrateProgress * Math.PI * 2);
        }
        break;
      case 'gymnast':
        if (isMoving) {
          flipTilt = effFacing * stepFraction * Math.PI * 2;
          leanFwd = 2.4;
        } else if (celebrating) {
          flipTilt = effFacing * celebrateProgress * Math.PI * 2;
        }
        break;
      case 'wrestler':
        leanFwd = 5.4;
        torsoSquashY = 0.82 + Math.abs(Math.sin(craftPhase * 1.1)) * 0.05;
        swaySide = Math.sin(craftPhase * 1.1) * 2.2;
        break;
      case 'climber_3d':
        leanFwd = 3.8;
        swaySide = Math.sin(craftPhase * 1.4) * 1.8;
        break;
      case 'ninja_fighter':
        torsoSquashY = 0.74;
        leanFwd = 9.2; // Low Naruto stealth forward dash
        break;
      case 'skater_3d':
        leanFwd = 4.6;
        torsoSquashY = 0.87;
        swaySide = Math.sin(craftPhase * 0.9) * 1.5;
        break;
      case 'breakdancer':
        if (isMoving) {
          const flareWave = Math.max(0, Math.sin(craftPhase * 0.85));
          swaySide = Math.sin(craftPhase * 1.4) * 3.4;
          torsoSquashY = 0.85 + Math.abs(Math.sin(craftPhase * 1.4)) * 0.09;
          spinFactor = Math.cos(craftPhase * 0.6);
          flipTilt = effFacing * flareWave * 0.42;
        } else if (celebrating) {
          spinFactor = celebrateProgress < 0.6 ? Math.cos(celebrateProgress * Math.PI * 5) : 1;
          flipTilt = celebrateProgress >= 0.6 ? effFacing * 0.48 : 0;
        }
        break;
      case 'strongman':
        torsoSquashY = 0.89 + Math.abs(Math.sin(craftPhase * 1.15)) * 0.04;
        leanFwd = 2.0;
        break;
    }
  }

  if (Math.abs(spinFactor) < 0.25) {
    spinFactor = spinFactor >= 0 ? 0.25 : -0.25;
  }

  // Rotate local direction by spinFactor cleanly for dancer/breakdancer spins
  const angOffset = spinFactor < 1 ? Math.acos(Math.max(-1, Math.min(1, spinFactor))) : 0;
  const cs = Math.cos(angOffset);
  const sn = Math.sin(angOffset);
  const bodyUx = ux * cs - uy * sn;
  const bodyUy = ux * sn + uy * cs;
  const bodyRx = -bodyUy;
  const bodyRy = bodyUx;

  const mapGround = (fwd: number, side: number): { x: number; y: number } => ({
    x: fwd * ux + side * rx,
    y: (fwd * uy + side * ry) * gFlat,
  });

  // Map canonical 3D character coordinates (fwd along path, side across left/right hips, ly height)
  const centerY = -20 - liftY;
  const mapPt = (fwd: number, side: number, ly: number): { x: number; y: number; depth: number } => {
    const heightFrac = ly < -12 ? (-ly - 12) / 28 : 0;
    const totalFwd = fwd + leanFwd * heightFrac;
    const totalSide = side + swaySide;
    const wx = totalFwd * bodyUx + totalSide * bodyRx;
    const wy = totalFwd * bodyUy + totalSide * bodyRy;
    let sx = wx;
    let sy = wy * gFlat + ly * torsoSquashY - liftY;
    if (Math.abs(flipTilt) > 0.01) {
      const dx = sx;
      const dy = sy - centerY;
      const c = Math.cos(flipTilt);
      const s = Math.sin(flipTilt);
      sx = dx * c - dy * s;
      sy = centerY + dx * s + dy * c;
    }
    return { x: sx, y: sy, depth: wy };
  };

  // Team color ring pedestal + crisp forward direction chevron aligned to track vector (ux, uy)
  gfx.ellipse(0, 0, 12.5, 5.2).fill({ color: darkTint, alpha: 0.72 }).stroke({ width: 1.5, color: lightTint });
  const ptrTip = mapGround(14.5, 0);
  const ptrL = mapGround(9.4, -3.5);
  const ptrR = mapGround(9.4, 3.5);
  gfx.poly([ptrTip.x, ptrTip.y, ptrL.x, ptrL.y, ptrR.x, ptrR.y])
    .fill(goldAccent)
    .stroke({ width: 1, color: 0x0f172a });

  // Grounded motion trails / wind streaks behind active specialists along (-ux, -uy)
  if (isMoving) {
    if (charId === 'skater_3d' || charId === 'sprinter_man' || charId === 'ninja_fighter') {
      const dashLen = charId === 'ninja_fighter' ? 14 : 11;
      const t1A = mapPt(-9, -2, charId === 'skater_3d' ? -5 : -15);
      const t1B = mapPt(-(9 + dashLen), -2, charId === 'skater_3d' ? -5 : -15);
      const t2A = mapPt(-7, 2, charId === 'skater_3d' ? -11 : -24);
      const t2B = mapPt(-(7 + dashLen * 0.8), 2, charId === 'skater_3d' ? -11 : -24);
      gfx.moveTo(t1A.x, t1A.y).lineTo(t1B.x, t1B.y)
        .stroke({ width: 1.8, color: lightTint, alpha: 0.65, cap: 'round' });
      gfx.moveTo(t2A.x, t2A.y).lineTo(t2B.x, t2B.y)
        .stroke({ width: 1.4, color: 0xffffff, alpha: 0.5, cap: 'round' });
    } else if (charId === 'wrestler') {
      const ringAlpha = Math.max(0, 0.5 - Math.abs(Math.sin(craftPhase * 1.1)) * 0.45);
      const wc = mapGround(-2.5, 0);
      gfx.ellipse(wc.x, wc.y - 1, 15, 6).stroke({ width: 1.5, color: goldAccent, alpha: ringAlpha });
    } else if (charId === 'model_runway') {
      const flash = 0.5 + 0.5 * Math.sin(craftPhase * 2.2);
      const sp = mapPt(-11, 2, -24 + Math.cos(craftPhase) * 4);
      gfx.circle(sp.x, sp.y, 2.0 * flash + 0.6).fill(goldAccent);
    }
  }

  // Skateboard deck under feet for skater_3d aligned directly along path (ux, uy)
  if (charId === 'skater_3d') {
    const carveTilt = isMoving ? Math.sin(craftPhase * 0.9) * 0.06 : 0;
    const bBack = mapPt(-13.5, 0, -2.2 - carveTilt * 8);
    const bFront = mapPt(13.5, 0, -2.2 + carveTilt * 8);
    drawCapsuleLimb(gfx, bBack.x, bBack.y, bFront.x, bFront.y, 3.6, colorHex, 0x0f172a);
    const wBack = mapPt(-9.6, 0, -0.2 - carveTilt * 4);
    const wFront = mapPt(9.6, 0, -0.2 + carveTilt * 4);
    gfx.circle(wBack.x, wBack.y + 1.4, 2.2).fill(goldAccent).stroke({ width: 1, color: 0x0f172a });
    gfx.circle(wFront.x, wFront.y + 1.4, 2.2).fill(goldAccent).stroke({ width: 1, color: 0x0f172a });
    if (isMoving) {
      const spinAng = craftPhase * 2.8 * effFacing;
      const spX = Math.cos(spinAng) * 1.5;
      const spY = Math.sin(spinAng) * 1.5;
      gfx.moveTo(wBack.x - spX, wBack.y + 1.4 - spY).lineTo(wBack.x + spX, wBack.y + 1.4 + spY)
        .stroke({ width: 1, color: 0x0f172a });
      gfx.moveTo(wFront.x - spX, wFront.y + 1.4 - spY).lineTo(wFront.x + spX, wFront.y + 1.4 + spY)
        .stroke({ width: 1, color: 0x0f172a });
    }
  }

  // Leg stride & aligned shoes along (ux, uy)
  const stride = isMoving
    ? Math.sin(craftPhase * (charId === 'sprinter_man' || charId === 'ninja_fighter' ? 1.6 : 1.25)) *
      (charId === 'sprinter_man'
        ? 10.6
        : charId === 'ninja_fighter'
          ? 9.2
          : charId === 'model_runway'
            ? 6.6
            : charId === 'strongman' || charId === 'wrestler'
              ? 5.2
              : 6.0)
    : 0;

  const hipY = charId === 'skater_3d' ? -15 : -13;
  const footY = charId === 'skater_3d' ? -4 : -1.5;
  const stanceSide =
    !activeCraft
      ? charId === 'wrestler' || charId === 'strongman'
        ? 4.4
        : 3.3
      : charId === 'wrestler' || charId === 'strongman'
        ? 4.8
        : 3.6;

  const hipL = mapPt(0, -stanceSide * 0.72, hipY);
  const hipR = mapPt(0, stanceSide * 0.72, hipY);

  let footL: { x: number; y: number; depth: number };
  let footR: { x: number; y: number; depth: number };
  let toeL: { x: number; y: number; depth: number };
  let toeR: { x: number; y: number; depth: number };

  if (charId === 'skater_3d') {
    if (isMoving) {
      const pushKick = Math.max(0, Math.sin(craftPhase * 1.35));
      footL = mapPt(-4.8 - pushKick * 8.5, -2.5, footY + pushKick * 2.2);
      footR = mapPt(5.2, 1.5, footY);
      toeL = mapPt(-2.4 - pushKick * 8.5, -2.5, footY + pushKick * 2.2);
      toeR = mapPt(7.8, 1.5, footY);
    } else {
      // Standing sideways/3-quarter on skateboard facing straight ahead down the path
      footL = mapPt(-4.2, 0, footY);
      footR = mapPt(4.8, 0, footY);
      toeL = mapPt(-1.8, 1.8, footY);
      toeR = mapPt(7.6, 0, footY);
    }
  } else if (!activeCraft) {
    // Upright standing feet planted side-by-side perpendicular to path, toes pointing straight down the path!
    footL = mapPt(0.4, -stanceSide, footY);
    footR = mapPt(0.4, stanceSide, footY);
    toeL = mapPt(3.4, -stanceSide, footY);
    toeR = mapPt(3.4, stanceSide, footY);
  } else {
    const fL = -stride * 0.72;
    const fR = stride * 0.72;
    const liftL = Math.max(0, -stride) * 0.45;
    const liftR = Math.max(0, stride) * 0.45;
    footL = mapPt(fL, -stanceSide, footY - liftL);
    footR = mapPt(fR, stanceSide, footY - liftR);
    toeL = mapPt(fL + 2.8, -stanceSide, footY - liftL);
    toeR = mapPt(fR + 2.8, stanceSide, footY - liftR);
  }

  const pantsColor =
    charId === 'belly_dancer'
      ? colorHex
      : charId === 'ninja_fighter'
        ? 0x1e293b
        : charId === 'model_runway'
          ? darkTint
          : 0x263238;
  const legThick = charId === 'strongman' ? 5.0 : 4.0;
  const shoeColor = charId === 'model_runway' && isGirl ? goldAccent : lightTint;

  const drawLegWithShoe = (
    hipPt: { x: number; y: number },
    footPt: { x: number; y: number },
    toePt: { x: number; y: number },
  ) => {
    drawCapsuleLimb(gfx, hipPt.x, hipPt.y, footPt.x, footPt.y, legThick, pantsColor);
    drawCapsuleLimb(gfx, footPt.x, footPt.y, toePt.x, toePt.y, 3.2, shoeColor, 0x0f172a);
  };

  // Torso geometry (smoothly adapts width between front/back view and side view at every 360° angle)
  const shoulderHalf =
    charId === 'strongman' || charId === 'wrestler'
      ? isGirl
        ? 8.0
        : 9.8
      : isGirl
        ? 5.8
        : 7.4;
  const waistHalf = isGirl ? 4.2 : charId === 'strongman' ? 7.6 : 5.6;
  const shoulderY = -27;

  const topSpine = mapPt(0, 0, shoulderY);
  const botSpine = mapPt(0, 0, hipY);
  const shHalfScreen = Math.hypot(shoulderHalf * bodyUy, shoulderHalf * 0.62 * bodyUx) * Math.abs(spinFactor);
  const waHalfScreen = Math.hypot(waistHalf * bodyUy, waistHalf * 0.66 * bodyUx) * Math.abs(spinFactor);

  // Arms geometry in canonical 3D (fwd along path, side across left/right hips)
  const shoulderSideAttach = shoulderHalf * 0.88;
  const shL = mapPt(0, -shoulderSideAttach, shoulderY + 1.2);
  const shR = mapPt(0, shoulderSideAttach, shoulderY + 1.2);

  let handLFwd = 0.2;
  let handLSide = -(shoulderSideAttach + 2.4);
  let handLY = -13.5 + movablePulse * 0.8;
  let handRFwd = 0.2;
  let handRSide = shoulderSideAttach + 2.4;
  let handRY = -13.5 - movablePulse * 0.8;

  if (!activeCraft) {
    // Relaxed natural standing arms hanging cleanly along sides
    if (charId === 'strongman') {
      handLY = -13.0;
      handRY = -13.0;
      handLSide = -(shoulderSideAttach + 2.8);
      handRSide = shoulderSideAttach + 2.8;
    } else if (charId === 'skater_3d') {
      handLY = -15.0 + movablePulse * 0.6;
      handRY = -15.0 - movablePulse * 0.6;
    }
  } else {
    switch (charId) {
      case 'belly_dancer': {
        const armDance = Math.sin(craftPhase * 1.3) * 5.6;
        handLFwd = 1.5;
        handLSide = -(shoulderHalf + 5.8);
        handLY = -31 + armDance;
        handRFwd = 1.5;
        handRSide = shoulderHalf + 5.8;
        handRY = -28 - armDance;
        break;
      }
      case 'sprinter_man': {
        handLFwd = -2.0 - stride * 0.65;
        handLSide = -(shoulderSideAttach + 2.2);
        handLY = -20 - stride * 0.45;
        handRFwd = 2.0 + stride * 0.65;
        handRSide = shoulderSideAttach + 2.2;
        handRY = -23 + stride * 0.45;
        break;
      }
      case 'model_runway': {
        handLFwd = 0;
        handLSide = -(waistHalf + 1.6);
        handLY = hipY - 1;
        handRFwd = 2.5 + Math.sin(craftPhase * 1.2) * 3.5;
        handRSide = shoulderSideAttach + 3.0;
        handRY = celebrating ? -35 : -18 + Math.sin(craftPhase * 1.2) * 3.5;
        break;
      }
      case 'gymnast': {
        handLFwd = 1.5;
        handLSide = -(shoulderHalf + 4.5);
        handLY = -37;
        handRFwd = 1.5;
        handRSide = shoulderHalf + 4.5;
        handRY = -37;
        break;
      }
      case 'wrestler': {
        const lariat = 5.5 + Math.abs(Math.sin(craftPhase * 1.1)) * 4.2;
        handLFwd = -2.0;
        handLSide = -(shoulderHalf + 3.5);
        handLY = celebrating ? -35 : -24;
        handRFwd = lariat;
        handRSide = shoulderHalf + 3.5;
        handRY = celebrating ? -35 : -26;
        break;
      }
      case 'climber_3d': {
        const climbPull = Math.sin(craftPhase * 1.45) * 6.8;
        handLFwd = 3.5;
        handLSide = -(shoulderHalf + 2.6);
        handLY = -32 + climbPull;
        handRFwd = 3.5;
        handRSide = shoulderHalf + 2.6;
        handRY = -34 - climbPull;
        break;
      }
      case 'ninja_fighter': {
        if (isMoving) {
          handLFwd = -10.5;
          handLSide = -(shoulderSideAttach + 2.4);
          handLY = -18.5;
          handRFwd = -10.5;
          handRSide = shoulderSideAttach + 2.4;
          handRY = -15.5;
        } else {
          handLFwd = -3.0;
          handLSide = -(shoulderSideAttach + 2.5);
          handLY = -21;
          handRFwd = 7.5;
          handRSide = shoulderSideAttach + 2.0;
          handRY = -31;
        }
        break;
      }
      case 'skater_3d': {
        const balance = Math.sin(craftPhase * 1.35) * 3.8;
        handLFwd = -2.5;
        handLSide = -(shoulderHalf + 5.5);
        handLY = -25 + balance;
        handRFwd = 2.5;
        handRSide = shoulderHalf + 5.5;
        handRY = -25 - balance;
        break;
      }
      case 'breakdancer': {
        const groove = Math.sin(craftPhase * 1.4) * 5.8;
        const flaring = isMoving && Math.sin(craftPhase * 0.85) > 0.2;
        handLFwd = 0;
        handLSide = -(shoulderHalf + 4.8);
        handLY = celebrating || flaring ? -12.5 : -24 + groove;
        handRFwd = 2.0;
        handRSide = shoulderHalf + 4.8;
        handRY = celebrating || flaring ? -36 : -22 - groove;
        break;
      }
      case 'strongman': {
        if (celebrating) {
          handLFwd = 1.5;
          handLSide = -(shoulderHalf + 4.0);
          handLY = -41;
          handRFwd = 1.5;
          handRSide = shoulderHalf + 4.0;
          handRY = -41;
        } else {
          // Alternating separate hand dumbbell curls & presses during march
          const leftLift = Math.max(0, Math.sin(craftPhase * 1.15));
          const rightLift = Math.max(0, -Math.sin(craftPhase * 1.15));
          handLFwd = 1.8 + leftLift * 1.6;
          handLSide = -(shoulderHalf + 3.8);
          handLY = -22 - leftLift * 18;
          handRFwd = 1.8 + rightLift * 1.6;
          handRSide = shoulderHalf + 3.8;
          handRY = -22 - rightLift * 18;
        }
        break;
      }
    }
  }

  const hL = mapPt(handLFwd, handLSide, handLY);
  const hR = mapPt(handRFwd, handRSide, handRY);
  const armThick = charId === 'strongman' || charId === 'wrestler' ? 4.2 : 3.1;
  const sleeveColor = charId === 'ninja_fighter' || charId === 'model_runway' ? colorHex : skinBase;

  // Depth-sort legs behind vs in front of torso
  if (footL.depth <= footR.depth) {
    drawLegWithShoe(hipL, footL, toeL);
    drawLegWithShoe(hipR, footR, toeR);
  } else {
    drawLegWithShoe(hipR, footR, toeR);
    drawLegWithShoe(hipL, footL, toeL);
  }

  // Draw the FARTHER arm behind the torso first
  const leftArmBehind = shL.depth + hL.depth < shR.depth + hR.depth;
  if (leftArmBehind) {
    drawCapsuleLimb(gfx, shL.x, shL.y, hL.x, hL.y, armThick, sleeveColor);
  } else {
    drawCapsuleLimb(gfx, shR.x, shR.y, hR.x, hR.y, armThick, sleeveColor);
  }

  // Draw 3D torso silhouette (oriented to flipTilt if flipping)
  const torsoOffset = (pt: { x: number; y: number }, dx: number, dy: number) => {
    if (Math.abs(flipTilt) <= 0.01) return { x: pt.x + dx, y: pt.y + dy };
    const c = Math.cos(flipTilt);
    const s = Math.sin(flipTilt);
    return { x: pt.x + dx * c - dy * s, y: pt.y + dx * s + dy * c };
  };
  const tShL = torsoOffset(topSpine, -shHalfScreen, 0);
  const tShR = torsoOffset(topSpine, shHalfScreen, 0);
  const tWaR = torsoOffset(botSpine, waHalfScreen, 0);
  const tWaL = torsoOffset(botSpine, -waHalfScreen, 0);

  const torsoColor =
    charId === 'ninja_fighter'
      ? 0x111827
      : charId === 'belly_dancer' && isGirl
        ? goldAccent
        : colorHex;

  gfx
    .poly([tShL.x, tShL.y, tShR.x, tShR.y, tWaR.x, tWaR.y, tWaL.x, tWaL.y])
    .fill(torsoColor)
    .stroke({ width: 1.8, color: 0x0f172a, join: 'round' });

  // Specular torso highlight shifted slightly toward forward chest (visible when front/side visible)
  if (bodyUy > -0.45) {
    const hiTop = mapPt(1.5, 0, shoulderY + 3);
    const hiBot = mapPt(1.2, 0, hipY - 3);
    drawCapsuleLimb(gfx, hiTop.x, hiTop.y, hiBot.x, hiBot.y, 2.2, lightTint, lightTint);
  }

  // Belly Dancer flowing sash / skirt or Wrestler championship belt
  if (charId === 'belly_dancer') {
    const skirtFlare = isMoving ? Math.sin(craftPhase * 1.3) * 1.8 : 0;
    const skL = torsoOffset(botSpine, -(waHalfScreen + 3.2 + skirtFlare), 5);
    const skR = torsoOffset(botSpine, waHalfScreen + 3.2 + skirtFlare, 5);
    gfx.poly([tWaL.x, tWaL.y, tWaR.x, tWaR.y, skR.x, skR.y, skL.x, skL.y])
      .fill({ color: colorHex, alpha: 0.92 })
      .stroke({ width: 1.4, color: goldAccent });
  } else if (charId === 'wrestler' || charId === 'ninja_fighter' || charId === 'strongman') {
    const bL = torsoOffset(botSpine, -(waHalfScreen + 0.5), -1.5);
    const bR = torsoOffset(botSpine, waHalfScreen + 0.5, -1.5);
    drawCapsuleLimb(gfx, bL.x, bL.y, bR.x, bR.y, 2.6, charId === 'ninja_fighter' ? colorHex : goldAccent, 0x0f172a);
  }

  // Draw the NEARER arm in front of the torso
  if (leftArmBehind) {
    drawCapsuleLimb(gfx, shR.x, shR.y, hR.x, hR.y, armThick, sleeveColor);
  } else {
    drawCapsuleLimb(gfx, shL.x, shL.y, hL.x, hL.y, armThick, sleeveColor);
  }

  // Character props held in hands (oriented along path vector)
  if (charId === 'strongman') {
    const drawHandDumbbell = (handPt: { x: number; y: number }) => {
      const gDir = mapGround(3.0, 0.8);
      const dx = Math.abs(gDir.x) < 1.8 && Math.abs(gDir.y) < 1.2 ? 2.4 : gDir.x;
      const dy = Math.abs(gDir.x) < 1.8 && Math.abs(gDir.y) < 1.2 ? 0.5 : gDir.y;
      const p1x = handPt.x - dx;
      const p1y = handPt.y - dy;
      const p2x = handPt.x + dx;
      const p2y = handPt.y + dy;
      drawCapsuleLimb(gfx, p1x, p1y, p2x, p2y, 1.9, 0xcbd5e1);
      gfx.circle(p1x, p1y, 3.0).fill(0x1e293b).stroke({ width: 1.25, color: goldAccent });
      gfx.circle(p2x, p2y, 3.0).fill(0x1e293b).stroke({ width: 1.25, color: goldAccent });
    };
    drawHandDumbbell(hL);
    drawHandDumbbell(hR);
  } else if (charId === 'ninja_fighter') {
    if (!activeCraft) {
      const tip = mapPt(-3.5, -(shoulderSideAttach + 3.2), handLY + 8.5);
      drawCapsuleLimb(gfx, hL.x, hL.y, tip.x, tip.y, 1.7, 0xcbd5e1);
    } else {
      const tip = isMoving
        ? mapPt(-19.5, shoulderSideAttach + 2.5, handRY - 2.5)
        : mapPt(14.5, shoulderSideAttach + 1.5, handRY - 7.5);
      drawCapsuleLimb(gfx, hR.x, hR.y, tip.x, tip.y, 1.8, 0xe2e8f0);
    }
  } else if (charId === 'gymnast' && isGirl && activeCraft) {
    const r1 = mapPt(-5.5, shoulderHalf + 3, -33);
    const r2 = mapPt(-2.5, shoulderHalf + 2, -28);
    gfx.moveTo(hR.x, hR.y).lineTo(r1.x, r1.y).lineTo(r2.x, r2.y).stroke({ width: 2.2, color: goldAccent });
  }

  // Head + 360° Path-Oriented Hair / Headband / Cap / Eyes (front vs back awareness!)
  const headCenter = mapPt(activeCraft ? 1.5 : 0.6, 0, -34.5);
  const headR = 6.2;
  const facingAway = bodyUy < -0.35; // Character looking away up/into screen along path

  if (isGirl && !facingAway) {
    const hairBack = mapPt(-5.2, 0, -33.2);
    gfx.circle(hairBack.x, hairBack.y, 4.5).fill(hairColor).stroke({ width: 1.4, color: 0x0f172a });
  }

  gfx.circle(headCenter.x, headCenter.y, headR)
    .fill(facingAway ? (charId === 'ninja_fighter' ? 0x111827 : hairColor) : charId === 'ninja_fighter' ? 0x111827 : skinBase)
    .stroke({ width: 1.7, color: 0x0f172a });

  const eyeShiftX = bodyUx * 2.2;
  const eyeShiftY = Math.max(-1.2, bodyUy * 1.4);

  if (charId === 'ninja_fighter') {
    if (!facingAway) {
      gfx.rect(headCenter.x + eyeShiftX - 3.6, headCenter.y - 2.0 + eyeShiftY * 0.4, 7.2, 3.0).fill(skinBase);
      gfx.circle(headCenter.x + eyeShiftX - 1.5, headCenter.y - 0.5 + eyeShiftY * 0.4, 0.85).fill(0x0f172a);
      gfx.circle(headCenter.x + eyeShiftX + 1.5, headCenter.y - 0.5 + eyeShiftY * 0.4, 0.85).fill(0x0f172a);
    }
    gfx.moveTo(headCenter.x - 5.8, headCenter.y - 3.2)
      .lineTo(headCenter.x + 5.8, headCenter.y - 3.2)
      .stroke({ width: 2.6, color: colorHex });
    const tail = mapPt(isMoving ? -11.5 : -6.2, 0, isMoving ? -34.5 : -29.8);
    drawCapsuleLimb(gfx, headCenter.x - bodyUx * 4, headCenter.y - 3.2, tail.x, tail.y, 2.1, colorHex);
  } else {
    if (!facingAway) {
      gfx.ellipse(headCenter.x, headCenter.y - 3.6, headR * 0.85, headR * 0.48).fill(hairColor);
      if (charId === 'model_runway') {
        gfx.rect(headCenter.x + eyeShiftX - 4.0, headCenter.y - 1.4 + eyeShiftY * 0.4, 3.6, 2.2).fill(0x0f172a);
        gfx.rect(headCenter.x + eyeShiftX + 0.5, headCenter.y - 1.4 + eyeShiftY * 0.4, 3.6, 2.2).fill(0x0f172a);
      } else {
        const sepX = bodyRx * 1.65;
        gfx.circle(headCenter.x + eyeShiftX - sepX, headCenter.y - 0.3 + eyeShiftY * 0.4, 0.85).fill(0x0f172a);
        gfx.circle(headCenter.x + eyeShiftX + sepX, headCenter.y - 0.3 + eyeShiftY * 0.4, 0.85).fill(0x0f172a);
        gfx.circle(headCenter.x + eyeShiftX * 1.15, headCenter.y + 1.8 + eyeShiftY * 0.4, 0.9)
          .fill({ color: skinShade, alpha: 0.42 });
      }
    } else if (isGirl) {
      // Ponytail trails neatly behind the back of head when walking/standing away from viewer
      const hairBack = mapPt(-5.2, 0, -32.2);
      gfx.circle(hairBack.x, hairBack.y, 4.6).fill(hairColor).stroke({ width: 1.4, color: 0x0f172a });
    }

    if (charId === 'belly_dancer' && !facingAway) {
      gfx.circle(headCenter.x + eyeShiftX * 0.6, headCenter.y - 4.5, 1.8).fill(goldAccent);
    } else if (charId === 'breakdancer' || charId === 'skater_3d') {
      // Cap dome + visor pointing directly along forward path vector (ux, uy)
      gfx.ellipse(headCenter.x, headCenter.y - 3.8, headR * 0.9, 2.4).fill(colorHex).stroke({ width: 1.1, color: 0x0f172a });
      const visorPt = mapPt(4.8, 0, -37.8);
      gfx.ellipse(visorPt.x, visorPt.y, 4.2, 1.8).fill(colorHex).stroke({ width: 1.1, color: 0x0f172a });
    } else if (charId === 'wrestler' || charId === 'climber_3d' || charId === 'sprinter_man') {
      gfx.moveTo(headCenter.x - 5.4, headCenter.y - 2.6)
        .lineTo(headCenter.x + 5.4, headCenter.y - 2.6)
        .stroke({ width: 2.2, color: lightTint });
    }
  }

  // Extra sparkle burst during capture / center-home celebration
  if (celebrating && (celebrateKind === 'capture' || celebrateKind === 'center_home')) {
    const sparkR = 13 + celWave * 6;
    for (let s = 0; s < 4; s++) {
      const ang = celebrateProgress * Math.PI * 3 + (s * Math.PI) / 2;
      const sx = Math.cos(ang) * sparkR;
      const sy = centerY + Math.sin(ang) * sparkR * 0.65;
      gfx.circle(sx, sy, 2.1 * (1 - celebrateProgress * 0.4)).fill(goldAccent);
    }
  }
}

