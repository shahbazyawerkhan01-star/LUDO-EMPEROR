import type { Graphics } from 'pixi.js';

export type AnimalArchetypeId =
  | 'animal_lion'
  | 'animal_elephant'
  | 'animal_eagle'
  | 'animal_horse'
  | 'animal_wolf'
  | 'animal_frog'
  | 'animal_cobra'
  | 'animal_gorilla'
  | 'animal_kangaroo'
  | 'animal_rooster';

export interface AnimalTokenMeta {
  id: AnimalArchetypeId;
  label: string;
  emoji: string;
  poseSummary: string;
  soundSummary: string;
}

export const ANIMAL_TOKENS: AnimalTokenMeta[] = [
  {
    id: 'animal_lion',
    label: 'Wild Lion',
    emoji: '🦁',
    poseSummary: 'Regal mane idle, 4-leg bounding feline prowl & tufted tail whip',
    soundSummary: 'Deep chest lion roar + padded paw steps',
  },
  {
    id: 'animal_elephant',
    label: 'Royal Elephant',
    emoji: '🐘',
    poseSummary: 'Trunk-down calm idle, 4-leg heavy march, flapping ears & waving trunk',
    soundSummary: 'Brass elephant trumpet + heavy seismic footsteps',
  },
  {
    id: 'animal_eagle',
    label: 'Golden Eagle',
    emoji: '🦅',
    poseSummary: 'Folded-feather perch idle, multi-feather flapping wings & fanned tail glide',
    soundSummary: 'Piercing eagle screech + crisp wing-beat whoosh',
  },
  {
    id: 'animal_horse',
    label: 'Wild Stallion',
    emoji: '🐴',
    poseSummary: '4-hoof alert stance, articulated 4-leg gallop, waving mane & tail',
    soundSummary: 'Vibrato horse neigh + crisp double-clop hooves',
  },
  {
    id: 'animal_wolf',
    label: 'Alpha Wolf',
    emoji: '🐺',
    poseSummary: 'Attentive lupine idle, fast 4-leg bounding dash & streaming tail',
    soundSummary: 'Haunting wolf howl + swift agile turf run',
  },
  {
    id: 'animal_frog',
    label: 'Tree Frog',
    emoji: '🐸',
    poseSummary: 'Seated pond stance, articulated 4-limb mid-air leaps & puffed vocal sac',
    soundSummary: 'Double-pulse frog ribbit croak + springy splash',
  },
  {
    id: 'animal_cobra',
    label: 'King Cobra',
    emoji: '🐍',
    poseSummary: 'Compact coil idle, rippling multi-wave ground slither & flared hood',
    soundSummary: 'Sharp cobra hiss flutter + scale slither',
  },
  {
    id: 'animal_gorilla',
    label: 'Silverback Gorilla',
    emoji: '🦍',
    poseSummary: 'Upright stance, 4-limb heavy knuckle-walk & chest-beat finish',
    soundSummary: 'Gorilla chest-beat thump + deep primate grunt',
  },
  {
    id: 'animal_kangaroo',
    label: 'Red Kangaroo',
    emoji: '🦘',
    poseSummary: 'Balanced upright pouch stance, 3-joint hind-leg bounds & counter-tail',
    soundSummary: 'Elastic kangaroo bound thump + marsupial call',
  },
  {
    id: 'animal_rooster',
    label: 'Fighting Rooster',
    emoji: '🐓',
    poseSummary: 'Proud barn stance, high-step strut, fluttering wing & tail feathers',
    soundSummary: 'Cock-a-doodle-doo crow + crisp feather strut',
  },
];

export const ANIMAL_MIX_BY_SEAT: readonly AnimalArchetypeId[] = [
  'animal_lion',
  'animal_elephant',
  'animal_eagle',
  'animal_horse',
  'animal_wolf',
];

export interface AnimalDrawContext {
  gfx: Graphics;
  charId: AnimalArchetypeId;
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
  celebrateProgress: number;
  celebrateKind: 'capture' | 'home_stretch' | 'center_home' | 'bonus' | null;
}

function blendHex(hexA: number, hexB: number, t: number): number {
  const rA = (hexA >> 16) & 0xff;
  const gA = (hexA >> 8) & 0xff;
  const bA = hexA & 0xff;
  const rB = (hexB >> 16) & 0xff;
  const gB = (hexB >> 8) & 0xff;
  const bB = hexB & 0xff;
  const r = Math.round(rA + (rB - rA) * t);
  const g = Math.round(gA + (gB - gA) * t);
  const b = Math.round(bA + (bB - bA) * t);
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function drawLimb(
  gfx: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  fill: number,
  stroke = 0x0f172a,
): void {
  gfx.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: width + 1.8, color: stroke, cap: 'round', join: 'round' });
  gfx.moveTo(x1, y1).lineTo(x2, y2).stroke({ width, color: fill, cap: 'round', join: 'round' });
}

export function drawAnimalGroundAura(
  gfx: Graphics,
  colorHex: number,
  groundFlatten: number,
  hopLiftScale: number,
  dirX: number,
  dirY: number,
  isMovableIdle: boolean,
  nowMs: number,
  seatIdx: number,
  pawnIdx: number,
): void {
  const lightTint = blendHex(colorHex, 0xffffff, 0.48);
  const pulse = isMovableIdle
    ? 1 + Math.sin(nowMs * 0.008 + seatIdx * 0.9 + pawnIdx * 0.5) * 0.045
    : 1;

  // 1. Larger seat-colored glowing spotlight aura anchored firmly on board surface
  const auraR = 21.0 * pulse;
  gfx.ellipse(0, 0, auraR * 1.15, auraR * 1.15 * groundFlatten).fill({ color: colorHex, alpha: 0.16 });
  gfx.ellipse(0, 0, auraR * 0.94, auraR * 0.94 * groundFlatten).fill({ color: colorHex, alpha: 0.26 });
  gfx.ellipse(0, 0, auraR * 0.68, auraR * 0.68 * groundFlatten).fill({ color: lightTint, alpha: 0.18 });

  // 2. Altitude-reactive ambient dark drop shadow under the animal body
  const shadowR = 11.4 * hopLiftScale;
  gfx.ellipse(0, 0, shadowR, shadowR * groundFlatten).fill({ color: 0x000000, alpha: 0.34 * hopLiftScale });

  // 3. Crisp sports-game player ring + directional rim chevron in seat color
  const ringR = 17.4 * pulse;
  gfx.ellipse(0, 0, ringR, ringR * groundFlatten).stroke({ width: 4.2, color: 0x090d16, alpha: 0.78 });
  gfx.ellipse(0, 0, ringR, ringR * groundFlatten).stroke({ width: 2.8, color: colorHex, alpha: 0.98 });
  gfx.ellipse(0, 0, ringR - 1.5, (ringR - 1.5) * groundFlatten).stroke({ width: 1.0, color: lightTint, alpha: 0.85 });

  const rawLen = Math.hypot(dirX, dirY);
  const ux = rawLen > 0.01 ? dirX / rawLen : 1;
  const uy = rawLen > 0.01 ? dirY / rawLen : 0;
  const rx = -uy;
  const ry = ux;
  const tipX = ux * (ringR + 4.8);
  const tipY = uy * (ringR + 4.8) * groundFlatten;
  const lX = (ux * (ringR - 0.8) - rx * 3.6);
  const lY = (uy * (ringR - 0.8) - ry * 3.6) * groundFlatten;
  const rX = (ux * (ringR - 0.8) + rx * 3.6);
  const rY = (uy * (ringR - 0.8) + ry * 3.6) * groundFlatten;
  gfx.poly([tipX, tipY, lX, lY, rX, rY])
    .fill(colorHex)
    .stroke({ width: 1.2, color: 0x090d16 });
}

export function drawAnimalToken(p: AnimalDrawContext): void {
  const {
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
    flightLift = 0,
    celebrateProgress,
    celebrateKind,
  } = p;

  const darkTint = blendHex(colorHex, 0x0f172a, 0.45);
  const lightTint = blendHex(colorHex, 0xffffff, 0.42);
  const goldAccent = 0xfbbf24;

  const rawLen = Math.hypot(dirX, dirY);
  const ux = rawLen > 0.01 ? dirX / rawLen : facing;
  const uy = rawLen > 0.01 ? dirY / rawLen : 0;
  const rx = -uy;
  const ry = ux;
  const gFlat = 0.44;

  const celebrating = celebrateProgress > 0 && celebrateProgress < 1;
  const activeCraft = isMoving || celebrating;
  const celWave = celebrating ? Math.sin(celebrateProgress * Math.PI) : 0;
  // Crisp fast gait phase so even 1-2 square moves visibly drive multi-joint legs & feathers
  const craftPhase = isMoving ? travelPhase * 2.15 : celebrating ? celebrateProgress * Math.PI * 5.2 : 0;
  const idleBreath = !activeCraft ? Math.sin(nowMs * 0.0042 + seatIdx * 1.3 + pawnIdx * 0.8) : 0;
  const movablePulse = !activeCraft && isMovable ? Math.sin(nowMs * 0.008 + seatIdx * 0.9 + pawnIdx * 0.5) : 0;

  // Vertical elevation: only Tree Frog & Kangaroo hop per tile; Eagle soars in air; Cobra & walkers stay grounded
  const isJumpAnimal = charId === 'animal_frog' || charId === 'animal_kangaroo';
  const stepArc = isMoving ? Math.sin(Math.max(0, Math.min(1, stepFraction)) * Math.PI) : 0;
  let liftY = isJumpAnimal ? bounce : 0;
  const bodyHeave =
    charId === 'animal_cobra'
      ? 0
      : charId === 'animal_eagle'
        ? activeCraft
          ? Math.sin(craftPhase * 1.15) * 1.6
          : idleBreath * 0.4
        : isJumpAnimal
          ? activeCraft
            ? Math.sin(craftPhase * 1.2) * 0.8
            : idleBreath * 0.4
          : activeCraft
            ? Math.sin(craftPhase * 2) * 0.85
            : idleBreath * 0.4;

  if (isMoving) {
    if (charId === 'animal_frog') {
      liftY += stepArc * 16.5;
    } else if (charId === 'animal_kangaroo') {
      liftY += stepArc * 15.0;
    } else if (charId === 'animal_eagle') {
      liftY += Math.max(8, flightLift > 0 ? flightLift : 14 + Math.sin(craftPhase * 1.15) * 3.0);
    }
  }
  if (celebrating) {
    if (isJumpAnimal) {
      liftY += celWave * 16;
    } else if (charId === 'animal_eagle') {
      liftY += 10 + celWave * 10;
    }
  }

  let leanFwd = 0;
  let swaySide = 0;
  if (activeCraft) {
    if (charId === 'animal_lion' || charId === 'animal_wolf') {
      leanFwd = 4.0;
    } else if (charId === 'animal_eagle') {
      leanFwd = 5.6;
    } else if (charId === 'animal_gorilla') {
      leanFwd = celebrating ? 0 : 4.2;
      swaySide = Math.sin(craftPhase * 0.95) * 2.6;
    } else if (charId === 'animal_horse') {
      leanFwd = 2.8;
    }
  }

  const mapPt = (fwd: number, side: number, ly: number): { x: number; y: number; depth: number } => {
    const heightFrac = ly < -10 ? (-ly - 10) / 26 : 0;
    const totalFwd = fwd + leanFwd * heightFrac;
    const totalSide = side + swaySide;
    const wx = totalFwd * ux + totalSide * rx;
    const wy = totalFwd * uy + totalSide * ry;
    return {
      x: wx,
      y: wy * gFlat + (ly - liftY),
      depth: wy,
    };
  };

  // Articulated 2-joint quadruped/biped leg helper: hip -> bent knee -> raised paw/hoof
  const drawArticulatedLeg = (
    hipFwd: number,
    side: number,
    hipY: number,
    phase: number,
    reach: number,
    pawLiftMax: number,
    kneeBendFwd: number,
    upperW: number,
    lowerW: number,
    upperCol: number,
    lowerCol: number,
    pawCol: number,
    pawR: number,
  ) => {
    const swing = activeCraft ? Math.sin(phase) : 0;
    const footUp = activeCraft ? Math.max(0, Math.cos(phase)) * pawLiftMax : 0;
    const footFwd = hipFwd + swing * reach;
    const footY = -1.4 - footUp;

    const midFwd = (hipFwd + footFwd) * 0.5 + kneeBendFwd + (footUp > 0.5 ? kneeBendFwd * 0.65 : 0);
    const midY = (hipY + footY) * 0.5 - footUp * 0.35;

    const hip = mapPt(hipFwd, side, hipY + bodyHeave);
    const knee = mapPt(midFwd, side * 1.02, midY);
    const foot = mapPt(footFwd, side, footY);

    drawLimb(gfx, hip.x, hip.y, knee.x, knee.y, upperW, upperCol);
    drawLimb(gfx, knee.x, knee.y, foot.x, foot.y, lowerW, lowerCol);
    if (pawR > 0.1) {
      gfx.circle(foot.x, foot.y, pawR).fill(pawCol).stroke({ width: 1.0, color: 0x0f172a });
    }
  };

  gfx.clear();

  const facingAway = uy < -0.25;

  // 2. Per-Animal Articulated 4-Leg & Moving-Feather Walk Rendering
  switch (charId) {
    case 'animal_lion': {
      const coat = 0xeab308;
      const under = 0xfef08a;
      const mane = blendHex(0x92400e, colorHex, 0.22);
      const gait = craftPhase * 1.05;

      // Multi-segment sinuous tufted tail
      const tSw1 = activeCraft ? Math.sin(gait * 1.4) * 5.2 : idleBreath * 1.8;
      const tSw2 = activeCraft ? Math.cos(gait * 1.4) * 6.5 : idleBreath * 2.5;
      const tBase = mapPt(-8.2, 0, -14.5 + bodyHeave);
      const tMid = mapPt(activeCraft ? -13.5 : -11.5, tSw1, activeCraft ? -18.0 : -11.5);
      const tTip = mapPt(activeCraft ? -18.5 : -14.5, tSw2, activeCraft ? -20.5 : -7.5);
      drawLimb(gfx, tBase.x, tBase.y, tMid.x, tMid.y, 2.6, coat);
      drawLimb(gfx, tMid.x, tMid.y, tTip.x, tTip.y, 2.2, coat);
      gfx.circle(tTip.x, tTip.y, 2.9).fill(0x78350f).stroke({ width: 1.0, color: 0x0f172a });

      // 4-leg feline prowl phases (bounding gallop)
      const legs = [
        { hipFwd: -6.2, side: -4.4, hipY: -13.5, ph: gait + Math.PI, bend: -2.6, upper: 4.0, lower: 3.1 },
        { hipFwd: -6.2, side: 4.4, hipY: -13.5, ph: gait + Math.PI + 0.65, bend: -2.6, upper: 4.0, lower: 3.1 },
        { hipFwd: 5.8, side: -4.4, hipY: -14.8, ph: gait, bend: 2.5, upper: 4.1, lower: 3.2 },
        { hipFwd: 5.8, side: 4.4, hipY: -14.8, ph: gait + 0.65, bend: 2.5, upper: 4.1, lower: 3.2 },
      ].sort((a, b) => mapPt(a.hipFwd, a.side, -2).depth - mapPt(b.hipFwd, b.side, -2).depth);

      const drawLionLeg = (l: (typeof legs)[number]) =>
        drawArticulatedLeg(l.hipFwd, l.side, l.hipY, l.ph, 8.2, 6.2, l.bend, l.upper, l.lower, coat, coat, under, 2.3);

      legs.slice(0, 2).forEach(drawLionLeg);

      const torsoB = mapPt(-6.8, 0, -14.8 + bodyHeave);
      const torsoF = mapPt(5.8, 0, -16.4 + bodyHeave);
      drawLimb(gfx, torsoB.x, torsoB.y, torsoF.x, torsoF.y, 11.4, coat);
      const colPt = mapPt(7.2, 0, -18.2 + bodyHeave);
      gfx.circle(colPt.x, colPt.y, 5.2).fill(colorHex).stroke({ width: 1.1, color: 0x0f172a });

      legs.slice(2).forEach(drawLionLeg);

      // Flowing Lion Mane & Head nod
      const nod = activeCraft ? Math.sin(gait * 2) * 1.8 : 0;
      const head = mapPt(8.5 + (activeCraft ? 1.5 : 0), 0, -23.8 + bodyHeave + nod);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + (activeCraft ? Math.sin(gait) * 0.12 : 0);
        gfx.circle(head.x + Math.cos(ang) * 5.8, head.y + Math.sin(ang) * 5.8, 4.1)
          .fill(mane)
          .stroke({ width: 1.0, color: 0x0f172a });
      }
      gfx.circle(head.x, head.y, 6.2).fill(facingAway ? mane : coat).stroke({ width: 1.5, color: 0x0f172a });
      if (!facingAway) {
        const snout = mapPt(11.6, 0, -22.2 + bodyHeave + nod);
        gfx.circle(snout.x, snout.y, 3.0).fill(under).stroke({ width: 1.0, color: 0x0f172a });
        gfx.circle(snout.x + ux * 1.2, snout.y - 0.8, 1.1).fill(0x0f172a);
        const eL = mapPt(10.5, -2.4, -25.0 + bodyHeave + nod);
        const eR = mapPt(10.5, 2.4, -25.0 + bodyHeave + nod);
        gfx.circle(eL.x, eL.y, 1.05).fill(0x0f172a);
        gfx.circle(eR.x, eR.y, 1.05).fill(0x0f172a);
      }
      break;
    }

    case 'animal_elephant': {
      const hide = 0x64748b;
      const hideDark = 0x475569;
      const gait = craftPhase * 0.88;

      // Swinging rope tail behind
      const tailB = mapPt(-9.0, 0, -17 + bodyHeave);
      const tailT = mapPt(-11.5, activeCraft ? Math.sin(gait * 1.6) * 3.0 : idleBreath * 1.0, -9.5);
      drawLimb(gfx, tailB.x, tailB.y, tailT.x, tailT.y, 1.8, hideDark);

      // True 4-leg heavy diagonal elephant march (real knee bend & thick foot lift!)
      const legs = [
        { hipFwd: -6.2, side: -5.4, hipY: -13.8, ph: gait + Math.PI, col: hideDark },
        { hipFwd: -6.2, side: 5.4, hipY: -13.8, ph: gait, col: hideDark },
        { hipFwd: 5.4, side: -5.4, hipY: -14.2, ph: gait, col: hide },
        { hipFwd: 5.4, side: 5.4, hipY: -14.2, ph: gait + Math.PI, col: hide },
      ].sort((a, b) => mapPt(a.hipFwd, a.side, -2).depth - mapPt(b.hipFwd, b.side, -2).depth);

      const drawEleLeg = (l: (typeof legs)[number]) =>
        drawArticulatedLeg(l.hipFwd, l.side, l.hipY, l.ph, 6.2, 4.8, 1.6, 5.4, 5.0, l.col, l.col, 0xe2e8f0, 2.6);

      legs.slice(0, 2).forEach(drawEleLeg);

      const torsoB = mapPt(-6.6, 0, -18.0 + bodyHeave);
      const torsoF = mapPt(5.4, 0, -18.8 + bodyHeave);
      drawLimb(gfx, torsoB.x, torsoB.y, torsoF.x, torsoF.y, 15.8, hide);
      const sadL = mapPt(-2.5, -5.5, -21.5 + bodyHeave);
      const sadR = mapPt(2.5, 5.5, -21.5 + bodyHeave);
      gfx.ellipse((sadL.x + sadR.x) / 2, (sadL.y + sadR.y) / 2, 7.2, 4.6)
        .fill(colorHex)
        .stroke({ width: 1.4, color: goldAccent });

      legs.slice(2).forEach(drawEleLeg);

      // Head + large flapping ears + 3-segment waving trunk
      const head = mapPt(8.0, 0, -23.8 + bodyHeave);
      const earSide = activeCraft ? 10.6 + Math.sin(gait * 1.4) * 3.8 : 6.6 + idleBreath * 0.5;
      const earFwd = activeCraft ? 5.2 - Math.cos(gait * 1.4) * 2.5 : 6.5;
      const earL = mapPt(earFwd, -earSide, -23.0 + bodyHeave);
      const earR = mapPt(earFwd, earSide, -23.0 + bodyHeave);
      gfx.circle(earL.x, earL.y, 5.6).fill(hideDark).stroke({ width: 1.3, color: 0x0f172a });
      gfx.circle(earR.x, earR.y, 5.6).fill(hideDark).stroke({ width: 1.3, color: 0x0f172a });
      gfx.circle(head.x, head.y, 6.8).fill(hide).stroke({ width: 1.6, color: 0x0f172a });

      if (!facingAway) {
        drawLimb(gfx, mapPt(9.0, -2.6, -21.2).x, mapPt(9.0, -2.6, -21.2).y, mapPt(13.2, -3.4, -19.5).x, mapPt(13.2, -3.4, -19.5).y, 2.0, 0xfef9c3);
        drawLimb(gfx, mapPt(9.0, 2.6, -21.2).x, mapPt(9.0, 2.6, -21.2).y, mapPt(13.2, 3.4, -19.5).x, mapPt(13.2, 3.4, -19.5).y, 2.0, 0xfef9c3);
      }

      const trSw = activeCraft ? Math.sin(gait * 1.2) * 4.2 : idleBreath * 1.0;
      const trunk1 = activeCraft ? mapPt(12.2, trSw * 0.5, -22.5 + bodyHeave) : mapPt(10.5, 0, -17.0);
      const trunk2 = activeCraft
        ? mapPt(15.2, trSw, -25.8 + Math.cos(gait * 1.2) * 3.2)
        : mapPt(11.0, trSw * 0.5, -11.5);
      const trunkTip = activeCraft
        ? mapPt(16.8, trSw * 1.25, -30.5 + Math.cos(gait * 1.2) * 4.2)
        : mapPt(10.6, trSw, -7.2);
      drawLimb(gfx, head.x + ux * 2.2, head.y + 1.5, trunk1.x, trunk1.y, 3.6, hide);
      drawLimb(gfx, trunk1.x, trunk1.y, trunk2.x, trunk2.y, 2.9, hideDark);
      drawLimb(gfx, trunk2.x, trunk2.y, trunkTip.x, trunkTip.y, 2.2, hideDark);
      if (!facingAway) {
        const eL = mapPt(10.6, -2.8, -25.2 + bodyHeave);
        const eR = mapPt(10.6, 2.8, -25.2 + bodyHeave);
        gfx.circle(eL.x, eL.y, 1.1).fill(0x0f172a);
        gfx.circle(eR.x, eR.y, 1.1).fill(0x0f172a);
      }
      break;
    }

    case 'animal_eagle': {
      const feather = 0x78350f;
      const wingDark = 0x451a03;
      const gait = craftPhase * 1.15;
      const flap = activeCraft ? Math.sin(gait) : 0;

      // Multi-feather fanned tail plumes (5 individual feathers fanning & tilting with wing beats!)
      const tailFanSpread = activeCraft ? 7.5 + Math.abs(flap) * 2.5 : 4.5;
      for (let f = -2; f <= 2; f++) {
        const frac = f / 2;
        const tb = mapPt(-5.5, frac * 2.0, -13.5 + bodyHeave);
        const tt = mapPt(-15.5 + Math.abs(frac) * 1.6, frac * tailFanSpread, -14.5 - flap * 2.2 + Math.abs(frac) * 1.2);
        drawLimb(gfx, tb.x, tb.y, tt.x, tt.y, 2.5, f % 2 === 0 ? 0xf8fafc : 0xe2e8f0);
      }

      // Talons
      const talL = mapPt(1.0 + (activeCraft ? Math.sin(gait) * 1.8 : 0), -3.5, activeCraft ? -4.5 : -1.8);
      const talR = mapPt(1.0 - (activeCraft ? Math.sin(gait) * 1.8 : 0), 3.5, activeCraft ? -4.5 : -1.8);
      drawLimb(gfx, mapPt(0, -3.5, -11.5).x, mapPt(0, -3.5, -11.5).y, talL.x, talL.y, 2.4, goldAccent);
      drawLimb(gfx, mapPt(0, 3.5, -11.5).x, mapPt(0, 3.5, -11.5).y, talR.x, talR.y, 2.4, goldAccent);

      // Feathered Body
      const bodyB = mapPt(-2.8, 0, -14 + bodyHeave);
      const bodyF = mapPt(2.6, 0, -23 + bodyHeave);
      drawLimb(gfx, bodyB.x, bodyB.y, bodyF.x, bodyF.y, 11.8, feather);
      const chestMark = mapPt(2.8, 0, -19.5 + bodyHeave);
      gfx.circle(chestMark.x, chestMark.y, 4.3).fill(colorHex).stroke({ width: 1.1, color: 0x0f172a });

      // Multi-feather articulated flapping wings (inner wing + wrist + 5 spreading primary feathers per wing!)
      const shL = mapPt(1.2, -4.6, -22 + bodyHeave);
      const shR = mapPt(1.2, 4.6, -22 + bodyHeave);
      if (!activeCraft) {
        // Perched folded multi-feather wing tips neatly resting along sides
        for (let w = 0; w < 3; w++) {
          const tipL = mapPt(-5.5 - w * 1.4, -6.0 - (idleBreath > 0 ? 0.5 : 0), -11.5 - w * 2.2);
          const tipR = mapPt(-5.5 - w * 1.4, 6.0 + (idleBreath > 0 ? 0.5 : 0), -11.5 - w * 2.2);
          drawLimb(gfx, shL.x, shL.y, tipL.x, tipL.y, 3.4 - w * 0.5, w === 0 ? feather : wingDark);
          drawLimb(gfx, shR.x, shR.y, tipR.x, tipR.y, 3.4 - w * 0.5, w === 0 ? feather : wingDark);
        }
      } else {
        const elbowLift = -24.5 - flap * 7.8;
        const wristLift = -25.5 - flap * 12.2 - Math.cos(gait) * 2.5;
        const drawFlappingWing = (sideSign: -1 | 1, shPt: { x: number; y: number }) => {
          const elbow = mapPt(0.5, sideSign * 10.2, elbowLift);
          const wrist = mapPt(-1.2, sideSign * 16.5, wristLift);
          drawLimb(gfx, shPt.x, shPt.y, elbow.x, elbow.y, 5.6, feather);
          drawLimb(gfx, elbow.x, elbow.y, wrist.x, wrist.y, 4.4, wingDark);
          // 5 fanned primary & secondary wing feathers trailing dynamically!
          for (let q = 0; q < 5; q++) {
            const qFrac = q / 4;
            const origin = q < 2 ? elbow : wrist;
            const tipF = mapPt(-5.5 - q * 1.8, sideSign * (11.5 + qFrac * 10.5), wristLift + 1.5 + q * 1.1 - flap * 2.8);
            drawLimb(gfx, origin.x, origin.y, tipF.x, tipF.y, 2.8 - q * 0.25, q % 2 === 0 ? wingDark : feather);
          }
        };
        drawFlappingWing(-1, shL);
        drawFlappingWing(1, shR);

        // Air flow streaks behind soaring eagle
        const st1 = mapPt(-17, -7, -21);
        const st2 = mapPt(-24, -7, -21);
        gfx.moveTo(st1.x, st1.y).lineTo(st2.x, st2.y).stroke({ width: 1.6, color: lightTint, alpha: 0.72 });
      }

      // Eagle White Head & Sharp Hooked Beak
      const head = mapPt(4.0, 0, -28.6 + bodyHeave);
      gfx.circle(head.x, head.y, 5.6).fill(0xf8fafc).stroke({ width: 1.5, color: 0x0f172a });
      if (!facingAway) {
        const beakTip = mapPt(10.8, 0, -26.5 + bodyHeave);
        const beakTop = mapPt(7.6, -1.6, -29.3 + bodyHeave);
        const beakBot = mapPt(7.6, 1.6, -29.3 + bodyHeave);
        gfx.poly([beakTop.x, beakTop.y, beakTip.x, beakTip.y, beakBot.x, beakBot.y])
          .fill(goldAccent)
          .stroke({ width: 1.1, color: 0x0f172a });
        const eL = mapPt(6.5, -2.3, -29.5 + bodyHeave);
        const eR = mapPt(6.5, 2.3, -29.5 + bodyHeave);
        gfx.circle(eL.x, eL.y, 1.05).fill(0x0f172a);
        gfx.circle(eR.x, eR.y, 1.05).fill(0x0f172a);
      }
      break;
    }

    case 'animal_horse': {
      const coat = 0x9a3412;
      const maneCol = 0x1e293b;
      const gait = craftPhase * 1.18;

      // Flowing multi-strand horse tail whipping behind
      for (let t = -1; t <= 1; t++) {
        const tSw = activeCraft ? Math.sin(gait * 1.2 + t * 0.4) * 3.8 : idleBreath * 1.2;
        const tailB = mapPt(-8.6, t * 0.8, -16 + bodyHeave);
        const tailT = mapPt(activeCraft ? -19.0 : -12.5, t * 1.6 + tSw, activeCraft ? -17.5 + Math.cos(gait) * 2.8 : -7.0);
        drawLimb(gfx, tailB.x, tailB.y, tailT.x, tailT.y, 2.6, maneCol);
      }

      // True 4-leg articulated gallop/trot with distinct forward-bent fore-knees & rear hocks
      const legs = [
        { hipFwd: -6.4, side: -3.8, hipY: -14.2, ph: gait + Math.PI, bend: -2.6 },
        { hipFwd: -6.4, side: 3.8, hipY: -14.2, ph: gait + Math.PI + 0.65, bend: -2.6 },
        { hipFwd: 6.2, side: -3.8, hipY: -14.8, ph: gait, bend: 2.8 },
        { hipFwd: 6.2, side: 3.8, hipY: -14.8, ph: gait + 0.65, bend: 2.8 },
      ].sort((a, b) => mapPt(a.hipFwd, a.side, -2).depth - mapPt(b.hipFwd, b.side, -2).depth);

      const drawHorseLeg = (l: (typeof legs)[number]) =>
        drawArticulatedLeg(l.hipFwd, l.side, l.hipY, l.ph, 9.2, 7.2, l.bend, 3.6, 2.7, coat, coat, 0x0f172a, 2.1);

      legs.slice(0, 2).forEach(drawHorseLeg);

      const bodyB = mapPt(-7.0, 0, -15.6 + bodyHeave);
      const bodyF = mapPt(6.4, 0, -17.0 + bodyHeave);
      drawLimb(gfx, bodyB.x, bodyB.y, bodyF.x, bodyF.y, 10.6, coat);
      const sadPt = mapPt(-0.5, 0, -18.2 + bodyHeave);
      gfx.ellipse(sadPt.x, sadPt.y, 5.8, 3.6).fill(colorHex).stroke({ width: 1.2, color: goldAccent });

      legs.slice(2).forEach(drawHorseLeg);

      // Arched neck, waving mane tufts & head bob
      const headBob = activeCraft ? Math.cos(gait * 1.1) * 2.2 : 0;
      const neckBot = mapPt(6.4, 0, -17.6 + bodyHeave);
      const neckTop = mapPt(9.0 + (activeCraft ? 1.4 : 0), 0, -27.8 + bodyHeave + headBob);
      drawLimb(gfx, neckBot.x, neckBot.y, neckTop.x, neckTop.y, 6.4, coat);

      const maneWave = activeCraft ? Math.sin(gait * 1.6) * 1.8 : 0;
      const maneB = mapPt(4.4, maneWave * 0.5, -19.5 + bodyHeave);
      const maneT = mapPt(7.2, maneWave, -29.4 + bodyHeave + headBob);
      drawLimb(gfx, maneB.x, maneB.y, maneT.x, maneT.y, 3.2, maneCol);

      const muz = mapPt(14.0 + (activeCraft ? 1.4 : 0), 0, -24.6 + bodyHeave + headBob);
      drawLimb(gfx, neckTop.x, neckTop.y, muz.x, muz.y, 5.2, coat);
      drawLimb(gfx, neckTop.x, neckTop.y, mapPt(8.2, -2.5, -32.2 + headBob).x, mapPt(8.2, -2.5, -32.2 + headBob).y, 2.0, coat);
      drawLimb(gfx, neckTop.x, neckTop.y, mapPt(8.2, 2.5, -32.2 + headBob).x, mapPt(8.2, 2.5, -32.2 + headBob).y, 2.0, coat);
      if (!facingAway) {
        const eL = mapPt(11.4, -2.2, -27.2 + bodyHeave + headBob);
        const eR = mapPt(11.4, 2.2, -27.2 + bodyHeave + headBob);
        gfx.circle(eL.x, eL.y, 1.0).fill(0x0f172a);
        gfx.circle(eR.x, eR.y, 1.0).fill(0x0f172a);
      }
      break;
    }

    case 'animal_wolf': {
      const coat = 0x94a3b8;
      const darkFur = 0x475569;
      const gait = craftPhase * 1.2;

      // Multi-segment streaming wolf tail
      const tSw = activeCraft ? Math.sin(gait * 1.5) * 4.0 : idleBreath * 1.5;
      const tailB = mapPt(-7.5, 0, -14.2 + bodyHeave);
      const tailM = mapPt(activeCraft ? -13.5 : -10.5, tSw * 0.5, activeCraft ? -15.2 : -10.5);
      const tailT = mapPt(activeCraft ? -18.5 : -13.0, tSw, activeCraft ? -16.0 : -7.2);
      drawLimb(gfx, tailB.x, tailB.y, tailM.x, tailM.y, 4.4, darkFur);
      drawLimb(gfx, tailM.x, tailM.y, tailT.x, tailT.y, 3.4, darkFur);
      gfx.circle(tailT.x, tailT.y, 2.5).fill(0xf1f5f9).stroke({ width: 1.0, color: 0x0f172a });

      // True 4-leg articulated wolf bound
      const legs = [
        { hipFwd: -6.0, side: -3.6, hipY: -13.2, ph: gait + Math.PI, bend: -2.5, col: darkFur },
        { hipFwd: -6.0, side: 3.6, hipY: -13.2, ph: gait + Math.PI + 0.6, bend: -2.5, col: darkFur },
        { hipFwd: 5.6, side: -3.6, hipY: -13.8, ph: gait, bend: 2.5, col: coat },
        { hipFwd: 5.6, side: 3.6, hipY: -13.8, ph: gait + 0.6, bend: 2.5, col: coat },
      ].sort((a, b) => mapPt(a.hipFwd, a.side, -2).depth - mapPt(b.hipFwd, b.side, -2).depth);

      const drawWolfLeg = (l: (typeof legs)[number]) =>
        drawArticulatedLeg(l.hipFwd, l.side, l.hipY, l.ph, 9.0, 6.4, l.bend, 3.6, 2.7, l.col, l.col, 0xf1f5f9, 2.0);

      legs.slice(0, 2).forEach(drawWolfLeg);

      const bodyB = mapPt(-6.8, 0, -14.2 + bodyHeave);
      const bodyF = mapPt(6.0, 0, -15.4 + bodyHeave);
      drawLimb(gfx, bodyB.x, bodyB.y, bodyF.x, bodyF.y, 9.8, coat);
      const scarf = mapPt(7.4, 0, -17.8 + bodyHeave);
      gfx.circle(scarf.x, scarf.y, 4.6).fill(colorHex).stroke({ width: 1.1, color: 0x0f172a });

      legs.slice(2).forEach(drawWolfLeg);

      const head = mapPt(8.6, 0, -21.6 + bodyHeave);
      const earL = mapPt(7.6, -3.6, -28.2 + bodyHeave);
      const earR = mapPt(7.6, 3.6, -28.2 + bodyHeave);
      drawLimb(gfx, head.x, head.y, earL.x, earL.y, 2.5, darkFur);
      drawLimb(gfx, head.x, head.y, earR.x, earR.y, 2.5, darkFur);
      gfx.circle(head.x, head.y, 5.4).fill(coat).stroke({ width: 1.5, color: 0x0f172a });
      if (!facingAway) {
        const snout = mapPt(13.6, 0, -20.5 + bodyHeave);
        drawLimb(gfx, head.x, head.y, snout.x, snout.y, 3.8, 0xe2e8f0);
        gfx.circle(snout.x, snout.y, 1.3).fill(0x0f172a);
        const eL = mapPt(10.2, -2.2, -23.0 + bodyHeave);
        const eR = mapPt(10.2, 2.2, -23.0 + bodyHeave);
        gfx.circle(eL.x, eL.y, 1.0).fill(goldAccent);
        gfx.circle(eR.x, eR.y, 1.0).fill(goldAccent);
      }
      break;
    }

    case 'animal_frog': {
      const green = 0x22c55e;
      const darkGreen = 0x15803d;
      const cream = 0xfef3c7;
      const midAir = isMoving ? stepArc : celebrating ? Math.abs(Math.sin(craftPhase * 0.95)) : 0;

      // Articulated 3-segment hind legs: folded tight when seated, snap straight backward on leap!
      const hKneeL = mapPt(-2.5 - midAir * 6.5, -7.8, -9.8 + midAir * 2.0);
      const hKneeR = mapPt(-2.5 - midAir * 6.5, 7.8, -9.8 + midAir * 2.0);
      const hFootL = mapPt(midAir > 0.2 ? -12.5 - midAir * 5.0 : -0.5, -6.8, -1.8 + midAir * 2.5);
      const hFootR = mapPt(midAir > 0.2 ? -12.5 - midAir * 5.0 : -0.5, 6.8, -1.8 + midAir * 2.5);
      const hipL = mapPt(-4.0, -3.5, -7.8);
      const hipR = mapPt(-4.0, 3.5, -7.8);
      drawLimb(gfx, hipL.x, hipL.y, hKneeL.x, hKneeL.y, 4.2, darkGreen);
      drawLimb(gfx, hKneeL.x, hKneeL.y, hFootL.x, hFootL.y, 3.2, green);
      drawLimb(gfx, hipR.x, hipR.y, hKneeR.x, hKneeR.y, 4.2, darkGreen);
      drawLimb(gfx, hKneeR.x, hKneeR.y, hFootR.x, hFootR.y, 3.2, green);

      const bodyB = mapPt(-4.0, 0, -8.8 + bodyHeave);
      const bodyF = mapPt(4.8, 0, -13.8 + bodyHeave);
      drawLimb(gfx, bodyB.x, bodyB.y, bodyF.x, bodyF.y, 12.6, green);
      const stripe = mapPt(-0.5, 0, -13.8 + bodyHeave);
      gfx.circle(stripe.x, stripe.y, 4.2).fill(colorHex).stroke({ width: 1.0, color: 0x0f172a });

      // Front arms paddle forward during jump!
      const fArmL = mapPt(5.5 + midAir * 4.0, -4.8, -2.5 - midAir * 5.5);
      const fArmR = mapPt(5.5 + midAir * 4.0, 4.8, -2.5 - midAir * 5.5);
      const shL = mapPt(3.5, -4.2, -11.2 + bodyHeave);
      const shR = mapPt(3.5, 4.2, -11.2 + bodyHeave);
      drawLimb(gfx, shL.x, shL.y, fArmL.x, fArmL.y, 2.8, green);
      drawLimb(gfx, shR.x, shR.y, fArmR.x, fArmR.y, 2.8, green);

      const head = mapPt(6.2, 0, -15.8 + bodyHeave);
      if (!facingAway) {
        const sac = mapPt(8.2, 0, -12.0 + bodyHeave);
        gfx.circle(sac.x, sac.y, 3.0 + midAir * 4.2 + (idleBreath > 0 ? 0.6 : 0)).fill(cream).stroke({ width: 1.1, color: 0x0f172a });
      }
      gfx.circle(head.x, head.y, 5.8).fill(green).stroke({ width: 1.5, color: 0x0f172a });
      const eyeL = mapPt(7.4, -3.8, -20.8 + bodyHeave);
      const eyeR = mapPt(7.4, 3.8, -20.8 + bodyHeave);
      gfx.circle(eyeL.x, eyeL.y, 2.7).fill(goldAccent).stroke({ width: 1.2, color: 0x0f172a });
      gfx.circle(eyeR.x, eyeR.y, 2.7).fill(goldAccent).stroke({ width: 1.2, color: 0x0f172a });
      if (!facingAway) {
        gfx.circle(eyeL.x + ux * 0.6, eyeL.y, 1.05).fill(0x0f172a);
        gfx.circle(eyeR.x + ux * 0.6, eyeR.y, 1.05).fill(0x0f172a);
      }
      break;
    }

    case 'animal_cobra': {
      const scales = 0x10b981;
      const belly = 0xfef08a;
      const hoodColor = blendHex(0x047857, colorHex, 0.35);

      // 11-segment multi-wave S-curve ground slither (continuous traveling sine wave flush on board!)
      const segs = 11;
      const pts: Array<{ x: number; y: number; depth: number }> = [];
      for (let i = 0; i < segs; i++) {
        const t = i / (segs - 1);
        const fwd = -12.0 + t * 18.0;
        const wave = activeCraft
          ? Math.sin(craftPhase * 2.1 - t * 6.5) * (8.0 - t * 2.6)
          : Math.sin(t * Math.PI * 2 + idleBreath * 0.25) * 4.6;
        const ly = t > 0.76 ? -2.6 - (t - 0.76) * 30 : -2.2;
        pts.push(mapPt(fwd, wave, ly));
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const w = 4.2 + (i / pts.length) * 3.0;
        drawLimb(gfx, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, w, i % 2 === 0 ? scales : darkTint);
      }

      const neck = pts[pts.length - 1];
      const swayHead = activeCraft ? Math.sin(craftPhase * 1.9) * 2.4 : 0;
      const headPos = mapPt(7.0, swayHead, activeCraft ? -24.5 : -19.5);
      drawLimb(gfx, neck.x, neck.y, headPos.x, headPos.y, 5.4, scales);

      const hoodWidth = activeCraft ? 8.6 : 4.2;
      const hL = mapPt(5.2, swayHead - hoodWidth, activeCraft ? -21.5 : -17.5);
      const hR = mapPt(5.2, swayHead + hoodWidth, activeCraft ? -21.5 : -17.5);
      const hTop = mapPt(6.5, swayHead, activeCraft ? -28.0 : -22.5);
      const hBot = mapPt(4.2, swayHead, activeCraft ? -15.5 : -12.5);
      gfx.poly([hTop.x, hTop.y, hR.x, hR.y, hBot.x, hBot.y, hL.x, hL.y])
        .fill(hoodColor)
        .stroke({ width: 1.5, color: 0x0f172a, join: 'round' });
      if (!facingAway) {
        gfx.ellipse(headPos.x, headPos.y + 2.2, 2.8, 3.6).fill(belly);
      }
      gfx.circle(headPos.x, headPos.y - 1.5, 4.4).fill(scales).stroke({ width: 1.4, color: 0x0f172a });
      if (!facingAway) {
        const eL = mapPt(8.4, swayHead - 2.0, activeCraft ? -26.2 : -21.2);
        const eR = mapPt(8.4, swayHead + 2.0, activeCraft ? -26.2 : -21.2);
        gfx.circle(eL.x, eL.y, 1.05).fill(goldAccent);
        gfx.circle(eR.x, eR.y, 1.05).fill(goldAccent);
        if (activeCraft || movablePulse > 0.2) {
          const tOut = mapPt(13.8, swayHead, activeCraft ? -25.2 : -20.2);
          const f1 = mapPt(15.8, swayHead - 1.5, activeCraft ? -24.8 : -19.8);
          const f2 = mapPt(15.8, swayHead + 1.5, activeCraft ? -24.8 : -19.8);
          gfx.moveTo(headPos.x + ux * 2.5, headPos.y)
            .lineTo(tOut.x, tOut.y)
            .lineTo(f1.x, f1.y)
            .moveTo(tOut.x, tOut.y)
            .lineTo(f2.x, f2.y)
            .stroke({ width: 1.3, color: 0xef4444 });
        }
      }
      break;
    }

    case 'animal_gorilla': {
      const fur = 0x1f2937;
      const silverBack = 0x94a3b8;
      const chestSkin = 0x334155;
      const gait = craftPhase * 0.95;

      // 2-joint bowed hind legs stepping clearly during knuckle-walk
      drawArticulatedLeg(-2.0, -5.0, -12.5, gait + Math.PI, 6.2, 4.8, 2.0, 5.4, 4.8, fur, fur, fur, 2.5);
      drawArticulatedLeg(-2.0, 5.0, -12.5, gait, 6.2, 4.8, 2.0, 5.4, 4.8, fur, fur, fur, 2.5);

      const torsoB = mapPt(-0.5, 0, -13.2 + bodyHeave);
      const torsoT = mapPt(activeCraft && !celebrating ? 4.2 : 0.6, 0, -25.5 + bodyHeave);
      drawLimb(gfx, torsoB.x, torsoB.y, torsoT.x, torsoT.y, 16.0, fur);
      const backPt = mapPt(-2.8, 0, -21.5 + bodyHeave);
      gfx.ellipse(backPt.x, backPt.y, 7.6, 5.2).fill(silverBack).stroke({ width: 1.0, color: 0x0f172a });
      const chestPt = mapPt(2.8, 0, -19.5 + bodyHeave);
      if (!facingAway) {
        gfx.ellipse(chestPt.x, chestPt.y, 5.8, 4.6).fill(chestSkin);
      }

      // 2-joint muscular arms: natural idle beside hips, heavy knuckle-walk stride, chest-thump on celebration!
      const drawArm = (sideSign: -1 | 1, ph: number) => {
        const sh = mapPt(activeCraft && !celebrating ? 3.2 : 0.6, sideSign * 8.6, -24.5 + bodyHeave);
        if (celebrating) {
          const fist = mapPt(5.5, sideSign * 4.5, -21 + Math.sin(craftPhase * 1.4) * sideSign * 5.5);
          const elb = mapPt(3.0, sideSign * 10.5, -22);
          drawLimb(gfx, sh.x, sh.y, elb.x, elb.y, 5.6, fur);
          drawLimb(gfx, elb.x, elb.y, fist.x, fist.y, 5.0, fur);
          gfx.circle(fist.x, fist.y, 2.7).fill(colorHex).stroke({ width: 1.0, color: 0x0f172a });
          return;
        }
        const sw = activeCraft ? Math.sin(ph) : 0;
        const lift = activeCraft ? Math.max(0, Math.cos(ph)) * 5.5 : 0;
        const elbow = mapPt((activeCraft ? 4.5 : 0.5) + sw * 3.0, sideSign * 10.2, activeCraft ? -14.5 - lift * 0.5 : -17.0);
        const hand = mapPt((activeCraft ? 5.8 : 0.5) + sw * 6.8, sideSign * 9.6, activeCraft ? -2.8 - lift : -9.2);
        drawLimb(gfx, sh.x, sh.y, elbow.x, elbow.y, 5.8, fur);
        drawLimb(gfx, elbow.x, elbow.y, hand.x, hand.y, 5.2, fur);
        gfx.circle(hand.x, hand.y, 2.8).fill(colorHex).stroke({ width: 1.0, color: 0x0f172a });
      };
      drawArm(-1, gait);
      drawArm(1, gait + Math.PI);

      const head = mapPt(activeCraft && !celebrating ? 6.4 : 1.5, 0, -31.5 + bodyHeave);
      gfx.circle(head.x, head.y, 6.4).fill(fur).stroke({ width: 1.6, color: 0x0f172a });
      if (!facingAway) {
        gfx.ellipse(head.x + ux * 1.4, head.y + 1.5, 3.8, 3.0).fill(chestSkin);
        const eL = mapPt(activeCraft && !celebrating ? 8.4 : 3.5, -2.2, -32.2 + bodyHeave);
        const eR = mapPt(activeCraft && !celebrating ? 8.4 : 3.5, 2.2, -32.2 + bodyHeave);
        gfx.circle(eL.x, eL.y, 1.0).fill(0xfef3c7);
        gfx.circle(eR.x, eR.y, 1.0).fill(0xfef3c7);
      }
      break;
    }

    case 'animal_kangaroo': {
      const coat = 0xd97706;
      const pouchCream = 0xfef3c7;
      const midAir = isMoving ? stepArc : celebrating ? Math.abs(Math.sin(craftPhase * 1.0)) : 0;

      // Heavy 2-segment counterbalance tail whipping up & down
      const tMid = mapPt(activeCraft ? -9.5 : -7.0, 0, activeCraft ? -11.5 - midAir * 2.5 : -6.5);
      const tTip = mapPt(activeCraft ? -17.5 : -12.0, 0, activeCraft ? -13.0 - midAir * 6.5 : -2.2);
      const tBase = mapPt(-3.0, 0, -10.5 + bodyHeave);
      drawLimb(gfx, tBase.x, tBase.y, tMid.x, tMid.y, 5.2, coat);
      drawLimb(gfx, tMid.x, tMid.y, tTip.x, tTip.y, 3.8, coat);

      // 3-segment springy kangaroo hind legs (hip -> knee -> ankle -> long foot)
      const drawRooLeg = (sideSign: -1 | 1) => {
        const hip = mapPt(-1.0, sideSign * 4.2, -12.5 + bodyHeave);
        const knee = mapPt(2.5 + midAir * 2.5, sideSign * 4.8, -8.5 + midAir * 1.5);
        const ankle = mapPt(-2.5 - midAir * 3.8, sideSign * 4.6, -3.5);
        const toe = mapPt(5.2 - midAir * 1.5, sideSign * 4.6, -1.5);
        drawLimb(gfx, hip.x, hip.y, knee.x, knee.y, 4.6, coat);
        drawLimb(gfx, knee.x, knee.y, ankle.x, ankle.y, 3.6, coat);
        drawLimb(gfx, ankle.x, ankle.y, toe.x, toe.y, 2.8, coat);
      };
      drawRooLeg(-1);
      drawRooLeg(1);

      const torsoB = mapPt(-0.8, 0, -12.5 + bodyHeave);
      const torsoT = mapPt(activeCraft ? 3.8 : 0.8, 0, -25.0 + bodyHeave);
      drawLimb(gfx, torsoB.x, torsoB.y, torsoT.x, torsoT.y, 9.8, coat);
      if (!facingAway) {
        const bellyPt = mapPt(2.8, 0, -16.5 + bodyHeave);
        gfx.ellipse(bellyPt.x, bellyPt.y, 3.6, 4.6).fill(pouchCream);
      }
      const bandana = mapPt(3.4, 0, -23.5 + bodyHeave);
      gfx.circle(bandana.x, bandana.y, 4.1).fill(colorHex).stroke({ width: 1.0, color: 0x0f172a });

      // Front paws pumping dynamically in sync with hops!
      const pawPump = activeCraft ? Math.sin(craftPhase * 2.0) * 2.5 : 0;
      const pawL = mapPt(activeCraft ? 6.8 : 4.2, -3.4, (activeCraft ? -19.5 : -16.5) + pawPump);
      const pawR = mapPt(activeCraft ? 6.8 : 4.2, 3.4, (activeCraft ? -19.5 : -16.5) + pawPump);
      drawLimb(gfx, mapPt(2.0, -4.0, -22.5).x, mapPt(2.0, -4.0, -22.5).y, pawL.x, pawL.y, 2.5, coat);
      drawLimb(gfx, mapPt(2.0, 4.0, -22.5).x, mapPt(2.0, 4.0, -22.5).y, pawR.x, pawR.y, 2.5, coat);

      const head = mapPt(activeCraft ? 5.6 : 2.2, 0, -30.5 + bodyHeave);
      const earL = mapPt(activeCraft ? 3.6 : 1.5, -3.2, -39.2 + bodyHeave);
      const earR = mapPt(activeCraft ? 3.6 : 1.5, 3.2, -39.2 + bodyHeave);
      drawLimb(gfx, head.x, head.y, earL.x, earL.y, 2.6, coat);
      drawLimb(gfx, head.x, head.y, earR.x, earR.y, 2.6, coat);
      gfx.circle(head.x, head.y, 4.8).fill(coat).stroke({ width: 1.4, color: 0x0f172a });
      if (!facingAway) {
        const snout = mapPt(9.2, 0, -29.2 + bodyHeave);
        drawLimb(gfx, head.x, head.y, snout.x, snout.y, 3.2, coat);
        gfx.circle(snout.x, snout.y, 1.1).fill(0x0f172a);
        const eL = mapPt(6.8, -2.0, -31.5 + bodyHeave);
        const eR = mapPt(6.8, 2.0, -31.5 + bodyHeave);
        gfx.circle(eL.x, eL.y, 0.95).fill(0x0f172a);
        gfx.circle(eR.x, eR.y, 0.95).fill(0x0f172a);
      }
      break;
    }

    case 'animal_rooster': {
      const bronze = 0xea580c;
      const tailGreen = 0x065f46;
      const combRed = 0xdc2626;
      const legYel = 0xfacc15;
      const gait = craftPhase * 1.25;
      const peckBob = activeCraft ? Math.max(0, Math.sin(gait * 1.4)) * 4.5 : 0;

      // 5 individual arched tail sickle feathers fanning & bobbing on every strut step!
      for (let t = -2; t <= 2; t++) {
        const fSw = activeCraft ? Math.sin(gait * 1.4 + t * 0.5) * 2.8 : idleBreath * 0.8;
        const tb = mapPt(-5.0, t * 1.1, -15 + bodyHeave);
        const tt = mapPt(-14.5 + Math.abs(t), t * 2.5 + fSw, -28.0 + Math.abs(t) * 2.2 - (activeCraft ? Math.cos(gait) * 2.5 : 0));
        drawLimb(gfx, tb.x, tb.y, tt.x, tt.y, 2.8, t === 0 ? colorHex : t % 2 === 0 ? tailGreen : 0x1e3a8a);
      }

      // High-stepping 2-joint strutting legs
      drawArticulatedLeg(0.4, -3.4, -10.8, gait, 6.2, 5.8, -1.8, 2.8, 2.2, bronze, legYel, legYel, 1.6);
      drawArticulatedLeg(0.4, 3.4, -10.8, gait + Math.PI, 6.2, 5.8, -1.8, 2.8, 2.2, bronze, legYel, legYel, 1.6);

      const bodyB = mapPt(-4.2, 0, -13 + bodyHeave);
      const bodyF = mapPt(4.0, 0, -18.5 + bodyHeave);
      drawLimb(gfx, bodyB.x, bodyB.y, bodyF.x, bodyF.y, 12.2, bronze);

      // Multi-feather fluttering side wings (individual wing quills open & flap cleanly when strutting!)
      const drawWingFeathers = (sideSign: -1 | 1) => {
        const wBase = mapPt(1.0, sideSign * 4.8, -18 + bodyHeave);
        if (!activeCraft) {
          drawLimb(gfx, wBase.x, wBase.y, mapPt(-3.5, sideSign * 6.0, -14.5).x, mapPt(-3.5, sideSign * 6.0, -14.5).y, 4.4, colorHex);
          return;
        }
        const wingOpen = 6.5 + Math.abs(Math.sin(gait * 1.6)) * 5.0;
        const flapY = -16.5 - Math.sin(gait * 1.6) * 5.2;
        for (let q = 0; q < 3; q++) {
          const tipQ = mapPt(-2.5 - q * 2.0, sideSign * (wingOpen + q * 1.8), flapY + q * 1.4);
          drawLimb(gfx, wBase.x, wBase.y, tipQ.x, tipQ.y, 3.0 - q * 0.4, q === 0 ? colorHex : 0xf59e0b);
        }
      };
      drawWingFeathers(-1);
      drawWingFeathers(1);

      const head = mapPt(5.0 + peckBob, 0, -27.5 + bodyHeave + peckBob * 0.45);
      drawLimb(gfx, bodyF.x, bodyF.y, head.x, head.y, 5.6, 0xf59e0b);
      gfx.circle(head.x, head.y, 4.8).fill(0xfef3c7).stroke({ width: 1.4, color: 0x0f172a });

      const c1 = mapPt(3.8 + peckBob, 0, -33.2 + bodyHeave + peckBob * 0.45);
      const c2 = mapPt(6.4 + peckBob, 0, -33.8 + bodyHeave + peckBob * 0.45);
      gfx.circle(c1.x, c1.y, 2.6).fill(combRed).stroke({ width: 1.0, color: 0x0f172a });
      gfx.circle(c2.x, c2.y, 2.8).fill(combRed).stroke({ width: 1.0, color: 0x0f172a });

      if (!facingAway) {
        const beakTip = mapPt(11.0 + peckBob, 0, -26.8 + bodyHeave + peckBob * 0.45);
        const beakB1 = mapPt(7.6 + peckBob, -1.6, -28.4 + bodyHeave + peckBob * 0.45);
        const beakB2 = mapPt(7.6 + peckBob, 1.6, -28.4 + bodyHeave + peckBob * 0.45);
        gfx.poly([beakB1.x, beakB1.y, beakTip.x, beakTip.y, beakB2.x, beakB2.y])
          .fill(legYel)
          .stroke({ width: 1.0, color: 0x0f172a });
        const wattle = mapPt(7.6 + peckBob, 0, -24.2 + bodyHeave + peckBob * 0.45);
        gfx.circle(wattle.x, wattle.y, 2.2).fill(combRed).stroke({ width: 0.9, color: 0x0f172a });
        const eL = mapPt(6.8 + peckBob, -2.0, -28.6 + bodyHeave + peckBob * 0.45);
        const eR = mapPt(6.8 + peckBob, 2.0, -28.6 + bodyHeave + peckBob * 0.45);
        gfx.circle(eL.x, eL.y, 0.95).fill(0x0f172a);
        gfx.circle(eR.x, eR.y, 0.95).fill(0x0f172a);
      }
      break;
    }
  }

  // Capture / Home celebration sparkles
  if (celebrating && (celebrateKind === 'capture' || celebrateKind === 'center_home')) {
    const sparkR = 14 + celWave * 6;
    for (let s = 0; s < 4; s++) {
      const ang = celebrateProgress * Math.PI * 3 + (s * Math.PI) / 2;
      gfx.circle(Math.cos(ang) * sparkR, -20 - liftY + Math.sin(ang) * sparkR * 0.65, 2.1).fill(goldAccent);
    }
  }
}
