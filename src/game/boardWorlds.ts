import type { Graphics } from 'pixi.js';
import type { BoardThemeId } from './rules';

export type ProjectWorldFn = (wx: number, wy: number, wz: number) => { x: number; y: number; persp: number };

export interface BoardYardMeta {
  baseCenter: { x: number; y: number };
  totalRot: number;
  playerColorHex: number;
}

const VALID_THEMES = new Set<string>([
  'classic',
  'jungle',
  'pool',
  'dance',
  'museum',
  'cliff',
  'galaxy',
  'desert',
  'city',
  'volcano',
  'arctic',
]);

export function resolveBoardThemeId(themeId: string): BoardThemeId {
  return (VALID_THEMES.has(themeId) ? themeId : 'classic') as BoardThemeId;
}

export function getThemeSafeStarStyle(themeId: BoardThemeId): { fill: string; stroke: string } {
  switch (themeId) {
    case 'dance':
      return { fill: '#fef08a', stroke: '#db2777' };
    case 'galaxy':
      return { fill: '#e0f2fe', stroke: '#7c3aed' };
    case 'volcano':
      return { fill: '#fef08a', stroke: '#7c2d12' };
    case 'pool':
      return { fill: '#ffffff', stroke: '#0369a1' };
    case 'jungle':
      return { fill: '#fef9c3', stroke: '#14532d' };
    case 'desert':
      return { fill: '#fffbeb', stroke: '#92400e' };
    case 'museum':
      return { fill: '#b45309', stroke: '#fffbeb' };
    case 'arctic':
      return { fill: '#0284c7', stroke: '#ffffff' };
    case 'city':
      return { fill: '#facc15', stroke: '#0f172a' };
    case 'cliff':
      return { fill: '#f8fafc', stroke: '#1e293b' };
    default:
      return { fill: '#000000', stroke: '#ffffff' };
  }
}

export function drawThemedTrackTile(
  tile: Graphics,
  themeId: BoardThemeId,
  sw: number,
  sh: number,
  fillHex: number,
  borderColor: number,
  playerColorHex: number,
  col: number,
  row: number,
  isColored: boolean,
  isSafe: boolean,
  isNeonTournament: boolean,
): void {
  const hx = sw / 2;
  const hy = sh / 2;
  const seed = (col * 17 + row * 31) & 15;

  if (isNeonTournament) {
    tile.rect(-hx - 2, -hy - 2, sw + 4, sh + 4).stroke({
      width: 5,
      color: playerColorHex,
      alpha: 0.45,
      join: 'round',
    });
  }

  // Base square fill
  tile.rect(-hx, -hy, sw, sh).fill(fillHex);

  // Per-world inside-tile materiality & architectural details
  switch (themeId) {
    case 'classic':
      break;

    case 'jungle': {
      // Carved temple mossy stone slab + leafy edge flourishes
      tile
        .rect(-hx + 3, -hy + 3, sw - 6, sh - 6)
        .stroke({ width: 1.5, color: isColored ? 0xfef9c3 : 0x4d7c0f, alpha: isColored ? 0.32 : 0.42 });
      // Stone fissure crack
      const cx = (seed % 5) * 3 - 6;
      tile
        .moveTo(-hx + 4, -hy * 0.3)
        .lineTo(cx, 0)
        .lineTo(hx * 0.45, hy * 0.5)
        .stroke({ width: 1.2, color: 0x14532d, alpha: isColored ? 0.25 : 0.35 });
      if (!isColored) {
        tile.circle(-hx + 6, -hy + 6, 4).fill({ color: 0x22c55e, alpha: 0.45 });
        tile.circle(hx - 6, hy - 6, 3.5).fill({ color: 0x15803d, alpha: 0.42 });
      }
      if (isSafe) {
        tile.circle(0, 0, Math.min(hx, hy) * 0.72).stroke({ width: 2, color: 0xfacc15, alpha: 0.65 });
      }
      break;
    }

    case 'pool': {
      // Ceramic swimming pool 2x2 mosaic grid + water caustic glint
      const gridCol = isColored ? 0xffffff : 0x38bdf8;
      tile
        .moveTo(0, -hy + 2)
        .lineTo(0, hy - 2)
        .moveTo(-hx + 2, 0)
        .lineTo(hx - 2, 0)
        .stroke({ width: 1.3, color: gridCol, alpha: isColored ? 0.35 : 0.42 });
      // Glossy top-left water sheen
      tile
        .moveTo(-hx + 4, -hy + 4)
        .lineTo(hx - 5, -hy + 4)
        .lineTo(-hx + 4, hy - 5)
        .closePath()
        .fill({ color: 0xffffff, alpha: isColored ? 0.16 : 0.35 });
      if (isColored && col === 1) {
        // Swim lane stripe
        tile.rect(-hx * 0.22, -hy + 3, sw * 0.22, sh - 6).fill({ color: 0x0c4a6e, alpha: 0.26 });
      }
      if (isSafe) {
        // Life-ring float pad beneath safe star
        tile
          .circle(0, 0, Math.min(hx, hy) * 0.78)
          .fill({ color: 0x0284c7, alpha: 0.4 })
          .stroke({ width: 3.5, color: 0xffffff, alpha: 0.85 });
      }
      break;
    }

    case 'dance': {
      // Dark disco glass pad with vibrant neon bezel + LED center glow
      const neonPalette = [0xf43f5e, 0x06b6d4, 0xd946ef, 0xfacc15, 0x4ade80];
      const padCol = isColored ? playerColorHex : neonPalette[seed % neonPalette.length];
      tile
        .rect(-hx + 3, -hy + 3, sw - 6, sh - 6)
        .fill({ color: padCol, alpha: isColored ? 0.22 : 0.24 })
        .stroke({ width: 2, color: padCol, alpha: 0.88 });
      // Four tiny corner LED diode pins
      const d = hx - 6;
      const e = hy - 6;
      tile
        .circle(-d, -e, 1.8)
        .fill(0xffffff)
        .circle(d, -e, 1.8)
        .fill(0xffffff)
        .circle(-d, e, 1.8)
        .fill(0xffffff)
        .circle(d, e, 1.8)
        .fill(0xffffff);
      if (isSafe) {
        tile.circle(0, 0, Math.min(hx, hy) * 0.74).stroke({ width: 2.5, color: 0xfef08a, alpha: 0.9 });
      }
      break;
    }

    case 'museum': {
      // Cream marble slab with delicate diagonal gold/stone veins + brass trim
      tile
        .rect(-hx + 3, -hy + 3, sw - 6, sh - 6)
        .stroke({ width: 1.5, color: isColored ? 0xfde68a : 0xc09b45, alpha: 0.72 });
      tile
        .moveTo(-hx + 4, hy * 0.4)
        .bezierCurveTo(-hx * 0.2, -hy * 0.2, hx * 0.2, hy * 0.3, hx - 4, -hy * 0.45)
        .stroke({ width: 1.2, color: isColored ? 0xfffbeb : 0xa1887f, alpha: isColored ? 0.25 : 0.36 });
      if (isSafe) {
        // Museum brass medallion frame
        tile
          .circle(0, 0, Math.min(hx, hy) * 0.76)
          .fill({ color: 0xfef3c7, alpha: 0.55 })
          .stroke({ width: 2.2, color: 0xb48a28, alpha: 0.95 });
      }
      break;
    }

    case 'cliff': {
      // Beveled mountain granite slab + rocky crack texture
      tile
        .poly([-hx + 2, -hy + 2, hx - 2, -hy + 2, hx - 5, -hy + 6, -hx + 5, -hy + 6])
        .fill({ color: 0xf8fafc, alpha: isColored ? 0.22 : 0.42 });
      tile
        .poly([-hx + 2, hy - 2, hx - 2, hy - 2, hx - 5, hy - 6, -hx + 5, hy - 6])
        .fill({ color: 0x0f172a, alpha: 0.28 });
      // Chiseled granite crack
      tile
        .moveTo(-hx * 0.65, -hy * 0.5)
        .lineTo(0, (seed % 3) * 3 - 3)
        .lineTo(hx * 0.6, hy * 0.55)
        .stroke({ width: 1.3, color: 0x1e293b, alpha: 0.34 });
      if (isSafe) {
        tile.circle(0, 0, Math.min(hx, hy) * 0.74).stroke({ width: 2.2, color: 0xf8fafc, alpha: 0.85 });
      }
      break;
    }

    case 'galaxy': {
      // Translucent deep cosmos slab with twinkling stars + cyan/magenta nebula mist
      tile
        .circle((seed % 4) * 3 - 4, (seed % 3) * 3 - 3, Math.min(hx, hy) * 0.58)
        .fill({ color: isColored ? playerColorHex : (seed % 2 === 0 ? 0x7c3aed : 0x0ea5e9), alpha: 0.28 });
      tile
        .rect(-hx + 2.5, -hy + 2.5, sw - 5, sh - 5)
        .stroke({ width: 1.4, color: isColored ? 0xe0f2fe : 0x38bdf8, alpha: 0.55 });
      // Tiny stardust pins inside each square
      tile
        .circle(-hx * 0.45, -hy * 0.42, 1.3)
        .fill({ color: 0xffffff, alpha: 0.75 })
        .circle(hx * 0.42, hy * 0.36, 1.1)
        .fill({ color: 0x7dd3fc, alpha: 0.78 });
      if (isSafe) {
        tile.circle(0, 0, Math.min(hx, hy) * 0.76).stroke({ width: 2.2, color: 0x38bdf8, alpha: 0.92 });
      }
      break;
    }

    case 'desert': {
      // Sandstone block with wind-swept sand ripple curve + warm corner shadow
      tile
        .moveTo(-hx + 3, -hy * 0.25)
        .bezierCurveTo(-hx * 0.2, -hy * 0.65, hx * 0.2, hy * 0.15, hx - 3, -hy * 0.25)
        .stroke({ width: 1.6, color: isColored ? 0xfef3c7 : 0xb45309, alpha: isColored ? 0.35 : 0.34 });
      tile
        .moveTo(-hx + 3, hy * 0.42)
        .bezierCurveTo(-hx * 0.2, hy * 0.05, hx * 0.2, hy * 0.75, hx - 3, hy * 0.38)
        .stroke({ width: 1.4, color: isColored ? 0xfde68a : 0x92400e, alpha: isColored ? 0.28 : 0.3 });
      if (isSafe) {
        tile
          .circle(0, 0, Math.min(hx, hy) * 0.74)
          .fill({ color: 0xd97706, alpha: 0.38 })
          .stroke({ width: 2.2, color: 0xfffbeb, alpha: 0.85 });
      }
      break;
    }

    case 'city': {
      // Architectural glass & brushed steel plaza tile with diagonal skyscraper glass reflection
      tile
        .poly([-hx + 3, -hy + 3, hx * 0.2, -hy + 3, -hx + 3, hy * 0.2])
        .fill({ color: 0xffffff, alpha: isColored ? 0.2 : 0.42 });
      tile
        .rect(-hx + 3, -hy + 3, sw - 6, sh - 6)
        .stroke({ width: 1.3, color: 0x0284c7, alpha: isColored ? 0.3 : 0.45 });
      if (isColored && col === 1) {
        // Sleek urban avenue center lane dash
        tile.rect(-hx * 0.2, -hy * 0.55, sw * 0.2, sh * 0.55).fill({ color: 0xffffff, alpha: 0.42 });
      }
      if (isSafe) {
        // Rooftop helipad emblem ring
        tile
          .circle(0, 0, Math.min(hx, hy) * 0.76)
          .fill({ color: 0x1e293b, alpha: 0.55 })
          .stroke({ width: 2.2, color: 0xfacc15, alpha: 0.92 });
      }
      break;
    }

    case 'volcano': {
      // Dark volcanic basalt stone with glowing molten magma crack + scorched rim
      tile
        .rect(-hx + 2.5, -hy + 2.5, sw - 5, sh - 5)
        .stroke({ width: 1.4, color: 0xf97316, alpha: isColored ? 0.5 : 0.55 });
      tile
        .moveTo(-hx + 4, -hy * 0.45)
        .lineTo(-2, (seed % 3) * 4 - 4)
        .lineTo(hx - 4, hy * 0.45)
        .stroke({ width: 2.0, color: 0xfacc15, alpha: isColored ? 0.28 : 0.46 });
      if (isSafe) {
        tile
          .circle(0, 0, Math.min(hx, hy) * 0.74)
          .fill({ color: 0x7c2d12, alpha: 0.7 })
          .stroke({ width: 2.2, color: 0xfacc15, alpha: 0.95 });
      }
      break;
    }

    case 'arctic': {
      // Translucent crystal ice block with snowy diagonal facet & glacial fracture lines
      tile
        .poly([-hx + 2, -hy + 2, hx * 0.55, -hy + 2, -hx + 2, hy * 0.55])
        .fill({ color: 0xffffff, alpha: isColored ? 0.22 : 0.58 });
      tile
        .moveTo(-hx * 0.5, hy * 0.4)
        .lineTo(hx * 0.1, -hy * 0.1)
        .lineTo(hx * 0.6, -hy * 0.45)
        .stroke({ width: 1.4, color: isColored ? 0xe0f2fe : 0x0284c7, alpha: 0.4 });
      if (isSafe) {
        tile
          .circle(0, 0, Math.min(hx, hy) * 0.76)
          .fill({ color: 0xffffff, alpha: 0.65 })
          .stroke({ width: 2.2, color: 0x0284c7, alpha: 0.85 });
      }
      break;
    }
  }

  // Crisp outer tile border on top so every Ludo square stays 100% distinct
  tile.rect(-hx, -hy, sw, sh).stroke({ width: 3, color: borderColor, join: 'round' });
}

export function drawThemedYardBase(
  innerTri: Graphics,
  themeId: BoardThemeId,
  baseWidth: number,
  baseHeight: number,
  playerColorHex: number,
  trackColor: number,
  borderColor: number,
  ss: number,
  isTournament: boolean,
): void {
  const inset = 0.7;
  const tipX = (baseHeight / 2) * inset; // +70
  const baseX = (-baseHeight / 2) * inset; // -70
  const halfY = (baseWidth / 2) * inset; // 84
  const spanX = tipX - baseX; // 140

  const triPoly = [tipX, 0, baseX, -halfY, baseX, halfY];

  // Exact local coordinates of the 4 pawn slots inside the yard (matches getBasePawnPos)
  const pawnSpots: Array<[number, number]> = [
    [-ss * 1.375, -ss * 1.788],
    [-ss * 1.375, ss * 1.788],
    [ss * 0.115, -ss * 0.715],
    [ss * 0.115, ss * 0.715],
  ];

  // Helper to draw small 5-leaf or fern shapes inside the yard
  const drawLeaf = (cx: number, cy: number, ang: number, len: number, wid: number, col: number, alpha = 0.85) => {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const tx = cx + c * len;
    const ty = cy + s * len;
    const nx = -s * wid;
    const ny = c * wid;
    innerTri
      .moveTo(cx, cy)
      .quadraticCurveTo(cx + c * len * 0.5 + nx, cy + s * len * 0.5 + ny, tx, ty)
      .quadraticCurveTo(cx + c * len * 0.5 - nx, cy + s * len * 0.5 - ny, cx, cy)
      .fill({ color: col, alpha });
  };

  switch (themeId) {
    case 'classic': {
      innerTri.poly(triPoly).fill(isTournament ? 0xffffff : trackColor);
      pawnSpots.forEach(([px, py]) => {
        innerTri.circle(px, py, 16).fill({ color: playerColorHex, alpha: 0.16 }).stroke({
          width: 2.5,
          color: playerColorHex,
          alpha: 0.65,
        });
      });
      break;
    }

    case 'jungle': {
      // Rich mossy forest floor + tropical fern clusters + hanging vines + tree stump pawn pads
      innerTri.poly(triPoly).fill(0x2d6a3e);
      // Inner lighter clearing patch
      innerTri.poly([tipX * 0.74, 0, baseX * 0.76, -halfY * 0.74, baseX * 0.76, halfY * 0.74]).fill(0x3f8a4b);
      // Creeping edge vines along slanted walls
      innerTri
        .moveTo(baseX + 4, -halfY + 6)
        .bezierCurveTo(-18, -38, 22, -16, tipX - 10, 0)
        .bezierCurveTo(22, 16, -18, 38, baseX + 4, halfY - 6)
        .stroke({ width: 3.5, color: 0x14532d, alpha: 0.75 });
      // Lush corner ferns & foliage inside yard corners
      drawLeaf(baseX + 6, -halfY + 14, 0.3, 28, 8, 0x15803d);
      drawLeaf(baseX + 6, -halfY + 14, 0.75, 24, 7, 0x22c55e);
      drawLeaf(baseX + 6, halfY - 14, -0.3, 28, 8, 0x15803d);
      drawLeaf(baseX + 6, halfY - 14, -0.75, 24, 7, 0x22c55e);
      drawLeaf(tipX - 8, 0, Math.PI - 0.35, 20, 6, 0x22c55e);
      drawLeaf(tipX - 8, 0, Math.PI + 0.35, 20, 6, 0x16a34a);
      // Tropical gold-pink flowers tucked near corners
      innerTri.circle(baseX + 18, -halfY + 28, 3.8).fill(0xfde047);
      innerTri.circle(baseX + 18, halfY - 28, 3.8).fill(0xf472b6);
      // Wooden tree-stump resting pads for the 4 pawns
      pawnSpots.forEach(([px, py]) => {
        innerTri
          .circle(px, py, 16.5)
          .fill(0x6b4423)
          .stroke({ width: 2.5, color: 0xa3e635, alpha: 0.85 });
        innerTri.circle(px, py, 10.5).stroke({ width: 1.4, color: 0xd6b07c, alpha: 0.7 });
      });
      break;
    }

    case 'pool': {
      // Miniature private swimming pool inside every player's yard!
      innerTri.poly(triPoly).fill(0xe0f2fe); // White stone coping edge
      // Pool basin water
      innerTri
        .poly([tipX * 0.84, 0, baseX + 9, -halfY * 0.82, baseX + 9, halfY * 0.82])
        .fill(0x0ea5e9)
        .stroke({ width: 2, color: 0x0369a1 });
      // Deeper turquoise center water
      innerTri
        .poly([tipX * 0.56, 0, baseX + 20, -halfY * 0.56, baseX + 20, halfY * 0.56])
        .fill({ color: 0x0284c7, alpha: 0.72 });
      // Underwater mosaic grid lines inside the pool
      for (let y = -50; y <= 50; y += 25) {
        innerTri
          .moveTo(baseX + 14, y)
          .lineTo(tipX * 0.65 - Math.abs(y) * 0.45, y)
          .stroke({ width: 1.2, color: 0xbae6fd, alpha: 0.32 });
      }
      // Chrome swimming pool ladder along the back wall
      innerTri
        .moveTo(baseX + 5, -14)
        .lineTo(baseX + 22, -14)
        .moveTo(baseX + 5, 14)
        .lineTo(baseX + 22, 14)
        .moveTo(baseX + 12, -14)
        .lineTo(baseX + 12, 14)
        .moveTo(baseX + 19, -14)
        .lineTo(baseX + 19, 14)
        .stroke({ width: 2.5, color: 0xf8fafc, alpha: 0.92 });
      // Floating aqua-white swim rings under the 4 pawns
      pawnSpots.forEach(([px, py]) => {
        innerTri
          .circle(px, py, 16)
          .fill(0xf0f9ff)
          .stroke({ width: 3, color: playerColorHex, alpha: 0.88 });
      });
      break;
    }

    case 'dance': {
      // Glossy VIP LED Dance Floor inside the yard!
      innerTri.poly(triPoly).fill(0x0b051a);
      const neonCols = [0xf43f5e, 0x06b6d4, 0xd946ef, 0xfacc15, 0x4ade80];
      // Angled LED grid cells clipped inside triangle bounds
      for (let gx = -56; gx <= 44; gx += 22) {
        for (let gy = -66; gy <= 66; gy += 22) {
          // Check triangle boundary roughly
          const maxYAtX = ((tipX - gx) / spanX) * halfY * 0.84;
          if (Math.abs(gy) + 10 > maxYAtX) continue;
          const col = neonCols[(Math.abs(gx + gy) / 22) % neonCols.length | 0];
          innerTri
            .rect(gx - 8, gy - 8, 16, 16)
            .fill({ color: col, alpha: 0.28 })
            .stroke({ width: 1.3, color: col, alpha: 0.85 });
        }
      }
      // Equalizer bars along back wall of yard
      for (let b = -3; b <= 3; b++) {
        const barLen = 8 + ((Math.abs(b) * 5 + 4) % 14);
        const by = b * 14;
        innerTri.rect(baseX + 4, by - 3, barLen, 6).fill(neonCols[(b + 4) % neonCols.length]);
      }
      // Glowing spotlight circles under pawns
      pawnSpots.forEach(([px, py]) => {
        innerTri
          .circle(px, py, 16)
          .fill({ color: playerColorHex, alpha: 0.35 })
          .stroke({ width: 2.5, color: 0xffffff, alpha: 0.9 });
      });
      break;
    }

    case 'museum': {
      // Cream & espresso marble rotunda exhibit with ornate gold corner trim & velvet carpet runner
      innerTri.poly(triPoly).fill(0xf3ead8);
      // Warm burgundy royal velvet inner runner
      innerTri
        .poly([tipX * 0.72, 0, baseX + 12, -halfY * 0.7, baseX + 12, halfY * 0.7])
        .fill(0x7f1d1d)
        .stroke({ width: 2.2, color: 0xd4af37 });
      // Delicate gold filigree arch near tip
      innerTri.circle(tipX * 0.42, 0, 10).stroke({ width: 1.6, color: 0xfacc15, alpha: 0.8 });
      // Brass pedestal plinths under the 4 pawns
      pawnSpots.forEach(([px, py]) => {
        innerTri
          .circle(px, py, 16.5)
          .fill(0xfffbeb)
          .stroke({ width: 3, color: 0xb48a28 });
        innerTri.circle(px, py, 11.5).stroke({ width: 1.2, color: playerColorHex, alpha: 0.75 });
      });
      break;
    }

    case 'cliff': {
      // Rugged terraced mountain granite cliff plateau
      innerTri.poly(triPoly).fill(0x475569);
      // Terraced higher rock ledge inside
      innerTri
        .poly([tipX * 0.8, 0, baseX + 14, -halfY * 0.76, baseX + 14, halfY * 0.76])
        .fill(0x64748b)
        .stroke({ width: 2, color: 0x334155 });
      // Upper rocky ridge slab
      innerTri
        .poly([tipX * 0.5, 0, baseX + 26, -halfY * 0.48, baseX + 26, halfY * 0.48])
        .fill(0x94a3b8);
      // Chiseled cliff crevices
      innerTri
        .moveTo(-45, -35)
        .lineTo(-10, -14)
        .lineTo(15, -2)
        .moveTo(-42, 42)
        .lineTo(-12, 18)
        .stroke({ width: 1.8, color: 0x1e293b, alpha: 0.65 });
      // Small alpine evergreen tufts near cliff base
      [-halfY + 24, halfY - 24].forEach((py) => {
        innerTri
          .poly([baseX + 24, py, baseX + 8, py - 8, baseX + 8, py + 8])
          .fill(0x166534)
          .stroke({ width: 1, color: 0x052e16 });
      });
      // Hewn stone boulder pads under the 4 pawns
      pawnSpots.forEach(([px, py]) => {
        innerTri
          .circle(px, py, 16)
          .fill(0xe2e8f0)
          .stroke({ width: 2.5, color: 0x334155 });
      });
      break;
    }

    case 'galaxy': {
      // Cosmic starfield & spiral galaxy vortex inside each yard!
      innerTri.poly(triPoly).fill(0x0b0f29);
      innerTri.circle(-8, 0, 52).fill({ color: 0x4c1d95, alpha: 0.45 });
      innerTri.circle(-4, 0, 32).fill({ color: 0x0ea5e9, alpha: 0.3 });
      // Spiral cosmic glow arms
      for (let arm = 0; arm < 2; arm++) {
        const sign = arm === 0 ? 1 : -1;
        innerTri
          .moveTo(-6, 0)
          .bezierCurveTo(10, 22 * sign, -22, 44 * sign, -52, 26 * sign)
          .stroke({ width: 5, color: arm === 0 ? 0xe879f9 : 0x38bdf8, alpha: 0.42 });
      }
      // Constellation stars
      [
        [-52, -52],
        [-32, -18],
        [24, -12],
        [44, 0],
        [-48, 48],
        [-22, 26],
      ].forEach(([sx, sy], idx) => {
        innerTri.circle(sx, sy, idx % 2 === 0 ? 2.2 : 1.5).fill(0xffffff);
      });
      // Glowing orbital star-ring under each pawn
      pawnSpots.forEach(([px, py]) => {
        innerTri
          .circle(px, py, 16.5)
          .fill({ color: 0x1e1b4b, alpha: 0.9 })
          .stroke({ width: 2.2, color: 0x38bdf8, alpha: 0.92 });
      });
      break;
    }

    case 'desert': {
      // Golden desert sand dunes + shimmering turquoise oasis pool at inner apex!
      innerTri.poly(triPoly).fill(0xf4c567);
      // Sweeping dark-gold wind-blown dune ridge curve
      innerTri
        .poly([baseX + 2, -halfY + 2, -25, -18, 5, 16, baseX + 2, halfY - 2])
        .fill(0xd99b38);
      innerTri
        .moveTo(-55, -52)
        .bezierCurveTo(-18, -16, -24, 18, -54, 52)
        .stroke({ width: 2.2, color: 0xfef3c7, alpha: 0.6 });
      // Desert turquoise oasis spring nestled near apex
      innerTri
        .ellipse(tipX * 0.48, 0, 15, 11)
        .fill(0x06b6d4)
        .stroke({ width: 2.2, color: 0x16a34a, alpha: 0.75 });
      // Sandstone temple rings under the 4 pawns
      pawnSpots.forEach(([px, py]) => {
        innerTri
          .circle(px, py, 16)
          .fill(0xfef3c7)
          .stroke({ width: 2.5, color: 0x92400e });
      });
      break;
    }

    case 'city': {
      // Illuminated modern high-rise skyline rooftop deck inside each yard!
      innerTri.poly(triPoly).fill(0x1e293b);
      // Glass curtain-wall reflection band
      innerTri
        .poly([tipX * 0.78, 0, baseX + 12, -halfY * 0.76, baseX + 12, halfY * 0.76])
        .fill(0x334155)
        .stroke({ width: 1.5, color: 0x38bdf8, alpha: 0.65 });
      // Row of miniature lit high-rise building silhouettes rising cleanly along back edge
      const bCols = [-48, -32, -16, 0, 16, 32, 48];
      bCols.forEach((by, idx) => {
        const bh = 16 + ((idx * 9) % 14);
        innerTri
          .rect(baseX + 3, by - 5, bh, 10)
          .fill(idx % 2 === 0 ? 0x0f172a : 0x020617)
          .stroke({ width: 1, color: 0x38bdf8, alpha: 0.55 });
        // Lit yellow/cyan skyscraper windows
        for (let w = 0; w < 2; w++) {
          innerTri.rect(baseX + 7 + w * 6, by - 2, 3, 4).fill(idx % 3 === 0 ? 0x38bdf8 : 0xfacc15);
        }
      });
      // Glowing rooftop helipad rings under pawns
      pawnSpots.forEach(([px, py]) => {
        innerTri
          .circle(px, py, 16)
          .fill(0xf1f5f9)
          .stroke({ width: 2.5, color: 0x0284c7 });
      });
      break;
    }

    case 'volcano': {
      // Scorched basalt caldera filled with glowing molten lava rivers & cooled rock pads!
      innerTri.poly(triPoly).fill(0x291512);
      // Glowing magma lake inside the yard
      innerTri
        .poly([tipX * 0.78, 0, baseX + 10, -halfY * 0.76, baseX + 10, halfY * 0.76])
        .fill(0x9a3412);
      innerTri
        .poly([tipX * 0.58, 0, baseX + 20, -halfY * 0.54, baseX + 20, halfY * 0.54])
        .fill(0xea580c);
      // Bright yellow-orange lava rivers snaking across the caldera
      innerTri
        .moveTo(baseX + 12, -32)
        .bezierCurveTo(-18, -10, 5, 14, tipX * 0.6, 0)
        .moveTo(baseX + 14, 34)
        .bezierCurveTo(-16, 16, -2, -8, tipX * 0.45, -4)
        .stroke({ width: 4.5, color: 0xfacc15, alpha: 0.85 });
      // Cooled obsidian basalt stepping stones where pawns stand safely
      pawnSpots.forEach(([px, py]) => {
        innerTri
          .circle(px, py, 16.5)
          .fill(0x1c1917)
          .stroke({ width: 2.8, color: 0xf97316 });
      });
      break;
    }

    case 'arctic': {
      // Crystal glacial ice floor + sharp frosted ice facets + snowy crystal pads
      innerTri.poly(triPoly).fill(0xe0f2fe);
      innerTri
        .poly([tipX * 0.76, 0, baseX + 10, -halfY * 0.76, baseX + 10, 0])
        .fill({ color: 0xbae6fd, alpha: 0.75 });
      innerTri
        .poly([tipX * 0.76, 0, baseX + 10, 0, baseX + 10, halfY * 0.76])
        .fill({ color: 0x7dd3fc, alpha: 0.55 });
      // Crisp white frost fracture star lines
      innerTri
        .moveTo(-48, -42)
        .lineTo(-10, -8)
        .lineTo(35, 0)
        .moveTo(-48, 42)
        .lineTo(-10, 8)
        .lineTo(15, 18)
        .stroke({ width: 1.8, color: 0xffffff, alpha: 0.85 });
      // Snow-rimmed ice crystal pawn pads
      pawnSpots.forEach(([px, py]) => {
        innerTri
          .circle(px, py, 16)
          .fill(0xffffff)
          .stroke({ width: 2.5, color: 0x0284c7, alpha: 0.88 });
      });
      break;
    }
  }

  // Crisp inner triangle frame on top
  innerTri.poly(triPoly).stroke({ width: 3, color: borderColor, join: 'round' });
}

export function drawThemedCenterHubOverlay(
  hubGfx: Graphics,
  themeId: BoardThemeId,
  wr: number,
): void {
  if (themeId === 'classic') return;
  const r = wr * 0.54;

  switch (themeId) {
    case 'jungle':
      hubGfx
        .circle(0, 0, r)
        .fill({ color: 0x14532d, alpha: 0.65 })
        .stroke({ width: 3, color: 0xa3e635, alpha: 0.9 });
      break;
    case 'pool':
      hubGfx
        .circle(0, 0, r)
        .fill({ color: 0x0284c7, alpha: 0.72 })
        .stroke({ width: 3.5, color: 0xffffff, alpha: 0.92 });
      break;
    case 'dance':
      hubGfx
        .circle(0, 0, r)
        .fill({ color: 0x0f0724, alpha: 0.82 })
        .stroke({ width: 3, color: 0xf43f5e, alpha: 0.95 });
      hubGfx.circle(0, 0, r * 0.74).stroke({ width: 2, color: 0x06b6d4, alpha: 0.9 });
      break;
    case 'museum':
      hubGfx
        .circle(0, 0, r)
        .fill({ color: 0x451a03, alpha: 0.7 })
        .stroke({ width: 3.5, color: 0xfbbf24, alpha: 0.95 });
      break;
    case 'cliff':
      hubGfx
        .circle(0, 0, r)
        .fill({ color: 0x1e293b, alpha: 0.72 })
        .stroke({ width: 3, color: 0xe2e8f0, alpha: 0.88 });
      break;
    case 'galaxy':
      hubGfx
        .circle(0, 0, r)
        .fill({ color: 0x090d26, alpha: 0.82 })
        .stroke({ width: 3, color: 0x38bdf8, alpha: 0.95 });
      break;
    case 'desert':
      hubGfx
        .circle(0, 0, r)
        .fill({ color: 0x78350f, alpha: 0.72 })
        .stroke({ width: 3, color: 0xfde047, alpha: 0.92 });
      break;
    case 'city':
      hubGfx
        .circle(0, 0, r)
        .fill({ color: 0x0f172a, alpha: 0.76 })
        .stroke({ width: 3, color: 0x38bdf8, alpha: 0.92 });
      break;
    case 'volcano':
      hubGfx
        .circle(0, 0, r)
        .fill({ color: 0x450a0a, alpha: 0.8 })
        .stroke({ width: 3, color: 0xfacc15, alpha: 0.95 });
      break;
    case 'arctic':
      hubGfx
        .circle(0, 0, r)
        .fill({ color: 0x0c4a6e, alpha: 0.65 })
        .stroke({ width: 3, color: 0xffffff, alpha: 0.95 });
      break;
  }
}

/**
 * Lightweight 60fps subtle animations projected ON the 3D board plane (inside the 5 yards & center hub).
 * Never clutters outer studio backdrop or obstructs tiles/pawns.
 */
export function drawBoardLiveSurfaceEffects(
  gfx: Graphics,
  themeId: BoardThemeId,
  nowMs: number,
  yards: BoardYardMeta[],
  rotRad: number,
  projWorld: ProjectWorldFn,
): void {
  gfx.clear();
  if (themeId === 'classic' || yards.length === 0) return;

  const t = nowMs * 0.001;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  const yardToProj = (yard: BoardYardMeta, lx: number, ly: number, z = 1) => {
    const cr = Math.cos(yard.totalRot);
    const sr = Math.sin(yard.totalRot);
    const bx = yard.baseCenter.x + lx * cr - ly * sr;
    const by = yard.baseCenter.y + lx * sr + ly * cr;
    const wx = bx * cosR - by * sinR;
    const wy = bx * sinR + by * cosR;
    return projWorld(wx, wy, z);
  };

  switch (themeId) {
    case 'jungle': {
      // Soft glowing jungle fireflies floating strictly inside each triangular yard
      yards.forEach((yard, idx) => {
        for (let f = 0; f < 3; f++) {
          const lx = -22 + Math.sin(t * 1.4 + f * 2.1 + idx) * 26;
          const ly = Math.cos(t * 1.1 + f * 1.7 + idx) * 24;
          const z = 4 + Math.sin(t * 2.5 + f + idx) * 3;
          const pt = yardToProj(yard, lx, ly, z);
          const glow = 0.4 + 0.6 * Math.sin(t * 4.2 + f * 2 + idx);
          gfx.circle(pt.x, pt.y, 4 * pt.persp).fill({ color: 0xfef08a, alpha: glow * 0.35 });
          gfx.circle(pt.x, pt.y, 1.8 * pt.persp).fill({ color: 0xfde047, alpha: glow });
        }
      });
      break;
    }

    case 'pool': {
      // Expanding water ripple rings inside each yard's miniature swimming pool + center pool shimmer
      yards.forEach((yard, idx) => {
        const pulse = (t * 0.55 + idx * 0.2) % 1;
        const pt = yardToProj(yard, -6, 0, 1);
        const radX = (8 + pulse * 26) * pt.persp;
        gfx
          .ellipse(pt.x, pt.y, radX, radX * 0.55)
          .stroke({ width: 1.8, color: 0xffffff, alpha: (1 - pulse) * 0.65 });
      });
      const cPulse = (t * 0.5) % 1;
      const cpt = projWorld(0, 0, 1);
      gfx
        .ellipse(cpt.x, cpt.y, (12 + cPulse * 24) * cpt.persp, (7 + cPulse * 14) * cpt.persp)
        .stroke({ width: 1.6, color: 0xbae6fd, alpha: (1 - cPulse) * 0.55 });
      break;
    }

    case 'dance': {
      // Smooth beat-synced neon pad glow cycling inside the 5 dance yards + center disco pulse
      const neonCols = [0xf43f5e, 0x06b6d4, 0xd946ef, 0xfacc15, 0x4ade80];
      const beat = Math.floor(t * 2.6);
      yards.forEach((yard, idx) => {
        const col = neonCols[(beat + idx) % neonCols.length];
        const glow = 0.25 + 0.35 * Math.abs(Math.sin(t * 5.2 + idx * 0.9));
        const pt = yardToProj(yard, -6, 0, 1);
        gfx
          .ellipse(pt.x, pt.y, 20 * pt.persp, 11 * pt.persp)
          .fill({ color: col, alpha: glow * 0.55 })
          .stroke({ width: 2, color: col, alpha: glow + 0.2 });
      });
      const cpt = projWorld(0, 0, 1);
      const cCol = neonCols[beat % neonCols.length];
      gfx.ellipse(cpt.x, cpt.y, 32 * cpt.persp, 18 * cpt.persp).stroke({
        width: 2.2,
        color: cCol,
        alpha: 0.4 + 0.3 * Math.sin(t * 5.2),
      });
      break;
    }

    case 'museum': {
      // Soft golden chandelier light breathing on each marble rotunda
      yards.forEach((yard, idx) => {
        const alpha = 0.12 + 0.1 * Math.sin(t * 1.8 + idx * 1.1);
        const pt = yardToProj(yard, -10, 0, 1);
        gfx.ellipse(pt.x, pt.y, 26 * pt.persp, 14 * pt.persp).fill({ color: 0xfde68a, alpha });
      });
      break;
    }

    case 'cliff': {
      // Soft drifting alpine mist wisping gently across the cliff yard edges
      yards.forEach((yard, idx) => {
        const phase = (t * 0.28 + idx * 0.21) % 1;
        const lx = -38 + phase * 55;
        const pt = yardToProj(yard, lx, Math.sin(t + idx) * 18, 2);
        gfx.ellipse(pt.x, pt.y, 22 * pt.persp, 9 * pt.persp).fill({
          color: 0xf8fafc,
          alpha: Math.sin(phase * Math.PI) * 0.2,
        });
      });
      break;
    }

    case 'galaxy': {
      // Twinkling stars inside every yard + orbiting micro-star around center HOME galaxy
      yards.forEach((yard, idx) => {
        for (let s = 0; s < 3; s++) {
          const lx = -36 + s * 28;
          const ly = (s % 2 === 0 ? -1 : 1) * (16 - s * 3);
          const pt = yardToProj(yard, lx, ly, 1);
          const a = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.8 + s * 2.1 + idx));
          gfx.circle(pt.x, pt.y, 2.1 * pt.persp).fill({ color: s % 2 === 0 ? 0x7dd3fc : 0xffffff, alpha: a });
        }
      });
      for (let k = 0; k < 4; k++) {
        const ang = t * 1.1 + (k * Math.PI) / 2;
        const pt = projWorld(Math.cos(ang) * 32, Math.sin(ang) * 32, 2);
        gfx.circle(pt.x, pt.y, 2.4 * pt.persp).fill({ color: k % 2 === 0 ? 0x38bdf8 : 0xe879f9, alpha: 0.85 });
      }
      break;
    }

    case 'desert': {
      // Gentle golden sand-sparkle & turquoise oasis glint inside each desert yard
      yards.forEach((yard, idx) => {
        const gleam = 0.35 + 0.55 * Math.abs(Math.sin(t * 2.4 + idx * 1.4));
        const pt = yardToProj(yard, 33, 0, 1);
        gfx.ellipse(pt.x, pt.y, 9 * pt.persp, 5.5 * pt.persp).fill({ color: 0xa5f3fc, alpha: gleam * 0.55 });
      });
      break;
    }

    case 'city': {
      // Rooftop beacon blinks & glass shimmer inside each skyscraper rooftop yard
      yards.forEach((yard, idx) => {
        const blink = 0.3 + 0.7 * Math.abs(Math.sin(t * 3.1 + idx * 1.2));
        const pt = yardToProj(yard, -56, -40, 3);
        const pt2 = yardToProj(yard, -56, 40, 3);
        gfx.circle(pt.x, pt.y, 2.4 * pt.persp).fill({ color: 0x38bdf8, alpha: blink });
        gfx.circle(pt2.x, pt2.y, 2.4 * pt.persp).fill({ color: 0xfacc15, alpha: 1 - blink * 0.6 });
      });
      break;
    }

    case 'volcano': {
      // Glowing molten lava heat pulse + tiny rising ember sparks inside each caldera yard
      yards.forEach((yard, idx) => {
        const pulse = 0.3 + 0.45 * Math.sin(t * 3.6 + idx * 1.3);
        const pt = yardToProj(yard, -6, 0, 1);
        gfx.ellipse(pt.x, pt.y, 18 * pt.persp, 10 * pt.persp).fill({ color: 0xfacc15, alpha: pulse * 0.45 });
        const emberLife = (t * 0.55 + idx * 0.27) % 1;
        const ep = yardToProj(yard, -14 + idx * 4, Math.sin(t * 2 + idx) * 14, 2 + emberLife * 14);
        gfx.circle(ep.x, ep.y, 2.2 * pt.persp).fill({
          color: 0xfef08a,
          alpha: Math.sin(emberLife * Math.PI) * 0.9,
        });
      });
      break;
    }

    case 'arctic': {
      // Diamond frost crystal glints sparkling inside each glacial ice yard
      yards.forEach((yard, idx) => {
        for (let c = 0; c < 3; c++) {
          const lx = -34 + c * 26;
          const ly = (c === 1 ? -1 : 1) * 18;
          const pt = yardToProj(yard, lx, ly, 1);
          const glint = Math.max(0, Math.sin(t * 2.9 + c * 2.2 + idx * 1.1));
          if (glint > 0.45) {
            gfx.circle(pt.x, pt.y, (glint * 3.2) * pt.persp).fill({ color: 0xffffff, alpha: glint * 0.85 });
          }
        }
      });
      break;
    }
  }
}
