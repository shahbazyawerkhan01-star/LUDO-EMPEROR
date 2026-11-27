import {
  Application,
  Assets,
  Container,
  Graphics,
  PerspectiveMesh,
  RenderTexture,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import {
  drawAnimalGroundAura,
  drawCharacterToken,
  getTokenLocomotionMode,
  isAnimalCharacter,
  resolveCharacterGender,
  resolveCharacterId,
  type CharacterArchetypeId,
  type CharacterCelebrationKind,
} from './characterTokens';
import {
  createEnvironmentFloorTexture,
  createEnvironmentSkyTexture,
} from './environments';
import {
  drawBoardLiveSurfaceEffects,
  drawThemedCenterHubOverlay,
  drawThemedTrackTile,
  drawThemedYardBase,
  getThemeSafeStarStyle,
  resolveBoardThemeId,
  type BoardYardMeta,
} from './boardWorlds';
import { sfx } from './sfx';
import type { TokenGenderMode, TokenStyleId } from '../sdk/runSdk';
import {
  BOARD_CONFIG,
  BOARD_THEMES,
  canMovePawn,
  DEFAULT_ENVIRONMENT_ID,
  getLegalMoves,
  getPawnPath,
  getPlayerColor,
  isLoneTokenOnTrack,
  PAWN_ASSET_URLS,
  resolvePawnTapMove,
  resolveSeatDicePalette,
  shadeRgb,
  stripSeatTag,
  VALID_ENVIRONMENT_IDS,
  type EnvironmentId,
  type PawnState,
  type PlayerConfig,
} from './rules';

export interface NameplateScreenPos {
  seatIdx: number;
  x: number;
  y: number;
  w: number;
  h: number;
  angleDeg: number;
}

export interface SceneCallbacks {
  onPawnTap: (playerIdx: number, pawnIdx: number) => void;
  onPawnDoubleTap?: (playerIdx: number, pawnIdx: number) => void;
  onBaseTap: (playerIdx: number) => void;
  onDiceTap: () => void;
  onNameplatesChange?: (plates: NameplateScreenPos[]) => void;
}

export interface SceneSnapshot {
  players: PlayerConfig[];
  pawns: PawnState[][];
  currentPlayer: number;
  dice: [number, number];
  movesAvailable: number[];
  selectedDieIndex: number | null;
  hasRolled: boolean;
  isRolling: boolean;
  isTournament: boolean;
  boardThemeId: string;
  tournamentBoardThemeId: string;
  diceStyle: string;
  tokenStyle: TokenStyleId;
  seatTokenOverrides?: Partial<Record<number, CharacterArchetypeId | null>>;
  tokenGenderMode: TokenGenderMode;
  backgroundId: string;
  rotateBoard: boolean;
  cameraTilt: number;
  gameStarted: boolean;
  mySeat: number | null;
  isOnline: boolean;
}

interface AnimPawn {
  displayPos: number;
  flightFromPos: number;
  flightFromX: number;
  flightFromY: number;
  renderX: number;
  renderY: number;
  initializedPos: boolean;
  lastSteppedTile: number;
  stepCounter: number;
  travelPhase: number;
  facing: 1 | -1;
  dirX: number;
  dirY: number;
  celebrateUntil: number;
  celebrateDuration: number;
  celebrateKind: CharacterCelebrationKind | null;
  revUntil: number;
  revDuration: number;
  revFromPos: number;
  revTargetPos: number;
  smokeTimer: number;
  turboSkidActive: boolean;
  container: Container;
  shadow: Graphics;
  ring: Graphics;
  sprite: Sprite | null;
  fallbackGfx: Graphics;
  characterGfx: Graphics;
}

interface SmokeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  grow: number;
  age: number;
  maxAge: number;
  alpha: number;
  color: number;
}

interface Dice3DAnim {
  startX: number;
  startY: number;
  startZ: number;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  rx: number;
  ry: number;
  rz: number;
  vrx: number;
  vry: number;
  vrz: number;
  lockedAtU78: boolean;
  lockStartRX: number;
  lockStartRY: number;
  lockStartRZ: number;
  targetRX: number;
  targetRY: number;
  targetRZ: number;
  hoverOffset: number;
  value: number;
}

interface FloatingReaction {
  node: Text;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
}

interface SpeechBubble {
  node: Container;
  playerIdx: number;
  age: number;
  maxAge: number;
}

const CUBE_VERTICES = [
  { x: -1, y: -1, z: 1 },
  { x: 1, y: -1, z: 1 },
  { x: 1, y: 1, z: 1 },
  { x: -1, y: 1, z: 1 },
  { x: -1, y: -1, z: -1 },
  { x: 1, y: -1, z: -1 },
  { x: 1, y: 1, z: -1 },
  { x: -1, y: 1, z: -1 },
];

const CUBE_FACES = [
  { indices: [0, 1, 2, 3], value: 1 },
  { indices: [5, 4, 7, 6], value: 6 },
  { indices: [4, 5, 1, 0], value: 2 },
  { indices: [3, 2, 6, 7], value: 5 },
  { indices: [1, 5, 6, 2], value: 3 },
  { indices: [4, 0, 3, 7], value: 4 },
];

function rotate3D(p: { x: number; y: number; z: number }, rx: number, ry: number, rz: number) {
  let y = p.y * Math.cos(rx) - p.z * Math.sin(rx);
  let z = p.y * Math.sin(rx) + p.z * Math.cos(rx);
  p.y = y;
  p.z = z;

  let x = p.x * Math.cos(ry) + p.z * Math.sin(ry);
  z = -p.x * Math.sin(ry) + p.z * Math.cos(ry);
  p.x = x;
  p.z = z;

  x = p.x * Math.cos(rz) - p.y * Math.sin(rz);
  y = p.x * Math.sin(rz) + p.y * Math.cos(rz);
  p.x = x;
  p.y = y;
  return p;
}

// Quadratic-Bezier rounded quad using fractional edge corner bevel (0.25) so perspective faces curve cleanly
function traceRoundedQuadBezier(
  gfx: Graphics,
  pts: Array<{ x: number; y: number }>,
  cornerFraction = 0.25,
): void {
  if (pts.length < 4) return;
  const f = Math.max(0.05, Math.min(0.45, cornerFraction));
  for (let i = 0; i < 4; i++) {
    const prev = pts[(i + 3) % 4];
    const curr = pts[i];
    const next = pts[(i + 1) % 4];
    const x1 = curr.x + (prev.x - curr.x) * f;
    const y1 = curr.y + (prev.y - curr.y) * f;
    const x2 = curr.x + (next.x - curr.x) * f;
    const y2 = curr.y + (next.y - curr.y) * f;
    if (i === 0) gfx.moveTo(x1, y1);
    else gfx.lineTo(x1, y1);
    gfx.quadraticCurveTo(curr.x, curr.y, x2, y2);
  }
  gfx.closePath();
}

interface BoardDieRenderOpts {
  rotX: number;
  rotY: number;
  rotZ: number;
  borderHex: number;
  glowHex: number | null;
  seatGlowHex?: number;
  styleId: string;
  used?: boolean;
  selected?: boolean;
  hoverPulse?: number;
}

function bilerpQuad(
  pts: Array<{ x: number; y: number }>,
  u: number,
  v: number,
): { x: number; y: number } {
  const [p0, p1, p2, p3] = pts;
  const a00 = (1 - u) * (1 - v);
  const a10 = u * (1 - v);
  const a11 = u * v;
  const a01 = (1 - u) * v;
  return {
    x: p0.x * a00 + p1.x * a10 + p2.x * a11 + p3.x * a01,
    y: p0.y * a00 + p1.y * a10 + p2.y * a11 + p3.y * a01,
  };
}

function drawBoardDie3D(
  g: Graphics,
  sh: Graphics,
  proj: (bx: number, by: number, bz: number) => { x: number; y: number; persp: number },
  cx: number,
  cy: number,
  cz: number,
  halfSize: number,
  _value: number,
  color: [number, number, number],
  pip: number,
  opts: BoardDieRenderOpts,
): void {
  g.clear();
  sh.clear();

  const { rotX, rotY, rotZ, borderHex, glowHex, seatGlowHex, styleId, used = false, selected = false, hoverPulse = 0 } = opts;

  // Dynamic board-plane contact shadow scaled & faded by height cz
  const shCenter = proj(cx, cy, 0);
  const shEdgeX = proj(cx + halfSize, cy, 0);
  const shEdgeY = proj(cx, cy + halfSize, 0);
  const radX = Math.max(8, Math.hypot(shEdgeX.x - shCenter.x, shEdgeX.y - shCenter.y));
  const radY = Math.max(5, Math.hypot(shEdgeY.x - shCenter.x, shEdgeY.y - shCenter.y));
  const heightScale = Math.max(0.56, 1.12 - cz * 0.13);
  const shadowAlpha = Math.max(0.06, (used ? 0.14 : 0.36) - cz * 0.075);
  sh.ellipse(shCenter.x + 1.5, shCenter.y + 2, radX * heightScale * 1.18, radY * heightScale * 1.12)
    .fill({ color: 0x000000, alpha: shadowAlpha });

  // Selection halo or waiting-to-roll pulse directly on the board plane synced to active seat color
  if (selected || hoverPulse > 0) {
    const haloColor = seatGlowHex ?? glowHex ?? 0xf1c40f;
    const haloAlpha = selected ? 0.6 + hoverPulse * 0.25 : 0.16 + hoverPulse * 0.38;
    const haloSpread = selected ? 1.44 + hoverPulse * 0.12 : 1.32 + hoverPulse * 0.08;
    sh.ellipse(shCenter.x, shCenter.y, radX * haloSpread, radY * haloSpread)
      .fill({ color: haloColor, alpha: haloAlpha * 0.28 })
      .stroke({ width: selected ? 3.2 : 2.2, color: haloColor, alpha: haloAlpha });
  }

  const centerZ = cz + halfSize;
  const rotVerts = CUBE_VERTICES.map((v) =>
    rotate3D({ x: v.x * halfSize, y: v.y * halfSize, z: v.z * halfSize }, rotX, rotY, rotZ),
  );
  const projVerts = rotVerts.map((rv) => proj(cx + rv.x, cy + rv.y, centerZ + rv.z));

  // Darker shaded inner bevel core (0.81 * halfSize, shade 0.52) so 3-face curved intersections look seamlessly molded
  const coreScale = 0.81;
  const coreProj = rotVerts.map((rv) =>
    proj(cx + rv.x * coreScale, cy + rv.y * coreScale, centerZ + rv.z * coreScale),
  );
  const coreRgb = shadeRgb(color, 0.52);
  const coreFillHex = rgbToHexNumber(coreRgb[0], coreRgb[1], coreRgb[2]);
  const alpha = used ? 0.43 : 1;

  const coreFaces = CUBE_FACES.map((f) => {
    const avgPersp = f.indices.reduce((sum, idx) => sum + coreProj[idx].persp, 0) / 4;
    const p0 = coreProj[f.indices[0]];
    const p1 = coreProj[f.indices[1]];
    const p2 = coreProj[f.indices[2]];
    const cross = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
    return { pts: f.indices.map((i) => coreProj[i]), avgPersp, cross };
  })
    .filter((f) => f.cross > -2)
    .sort((a, b) => a.avgPersp - b.avgPersp);

  coreFaces.forEach((cf) => {
    traceRoundedQuadBezier(g, cf.pts, 0.25);
    g.fill({ color: coreFillHex, alpha });
  });

  // Front faces sorted back-to-front by camera depth (ascending persp = farthest first)
  const visibleFaces = CUBE_FACES.map((f) => {
    const pts = f.indices.map((idx) => projVerts[idx]);
    const cross = (pts[1].x - pts[0].x) * (pts[2].y - pts[0].y) - (pts[1].y - pts[0].y) * (pts[2].x - pts[0].x);
    const avgPersp = pts.reduce((s, p) => s + p.persp, 0) / 4;
    // Compute rotated unit normal for directional lighting
    const rv0 = rotVerts[f.indices[0]];
    const rv1 = rotVerts[f.indices[1]];
    const rv2 = rotVerts[f.indices[2]];
    const ax = rv1.x - rv0.x;
    const ay = rv1.y - rv0.y;
    const az = rv1.z - rv0.z;
    const bx = rv2.x - rv0.x;
    const by = rv2.y - rv0.y;
    const bz = rv2.z - rv0.z;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const nLen = Math.hypot(nx, ny, nz) || 1;
    return {
      value: f.value,
      pts,
      cross,
      avgPersp,
      ux: nx / nLen,
      uy: ny / nLen,
      uz: nz / nLen,
    };
  })
    .filter((f) => f.cross > 0.2)
    .sort((a, b) => a.avgPersp - b.avgPersp);

  const pipCoords: Record<number, Array<[number, number]>> = {
    1: [[0.5, 0.5]],
    2: [[0.28, 0.28], [0.72, 0.72]],
    3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
    6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
  };

  visibleFaces.forEach((f) => {
    // Directional light: upper top face stays crisp (0.94..1.02), side faces shade cleanly (0.58..0.78)
    const ndotl = -0.28 * f.ux - 0.36 * f.uy + 0.89 * f.uz;
    const shade =
      ndotl >= 0.45
        ? Math.min(1.04, 0.92 + (ndotl - 0.45) * 0.2)
        : Math.max(0.52, 0.72 + ndotl * 0.24);
    const shaded = shadeRgb(color, shade);
    const faceHex = rgbToHexNumber(shaded[0], shaded[1], shaded[2]);

    if (glowHex !== null && !used) {
      traceRoundedQuadBezier(g, f.pts, 0.25);
      g.stroke({ width: 3.4, color: glowHex, alpha: 0.36 });
    }

    traceRoundedQuadBezier(g, f.pts, 0.25);
    g.fill({ color: faceHex, alpha }).stroke({ width: 1.45, color: borderHex, alpha });

    // Dice theme surface finishes inside projected quad
    if (styleId === 'marble') {
      const m1 = bilerpQuad(f.pts, 0.16, 0.78);
      const m2 = bilerpQuad(f.pts, 0.52, 0.48);
      const m3 = bilerpQuad(f.pts, 0.84, 0.22);
      g.moveTo(m1.x, m1.y).lineTo(m2.x, m2.y).lineTo(m3.x, m3.y)
        .stroke({ width: 1.1, color: 0x64748b, alpha: 0.32 * alpha });
    } else if (styleId === 'galaxy') {
      [
        [0.2, 0.55],
        [0.52, 0.22],
        [0.78, 0.58],
      ].forEach(([su, sv]) => {
        const sp = bilerpQuad(f.pts, su, sv);
        g.circle(sp.x, sp.y, 1.05 * f.avgPersp).fill({ color: 0xe0e7ff, alpha: 0.65 * alpha });
      });
    } else if (styleId === 'fire') {
      const e1 = bilerpQuad(f.pts, 0.18, 0.18);
      const e2 = bilerpQuad(f.pts, 0.82, 0.18);
      const e3 = bilerpQuad(f.pts, 0.82, 0.82);
      const e4 = bilerpQuad(f.pts, 0.18, 0.82);
      g.poly([e1.x, e1.y, e2.x, e2.y, e3.x, e3.y, e4.x, e4.y])
        .stroke({ width: 1.4, color: 0xfb923c, alpha: 0.45 * alpha });
    } else if (styleId === 'ice' || styleId === 'holographic' || styleId === 'gold') {
      const s1 = bilerpQuad(f.pts, 0.16, 0.42);
      const s2 = bilerpQuad(f.pts, 0.42, 0.16);
      const s3 = bilerpQuad(f.pts, 0.62, 0.16);
      const s4 = bilerpQuad(f.pts, 0.16, 0.62);
      g.poly([s1.x, s1.y, s2.x, s2.y, s3.x, s3.y, s4.x, s4.y])
        .fill({ color: 0xffffff, alpha: (styleId === 'gold' ? 0.22 : 0.3) * alpha });
    } else if (styleId === 'wood') {
      const w1 = bilerpQuad(f.pts, 0.18, 0.36);
      const w2 = bilerpQuad(f.pts, 0.82, 0.42);
      g.moveTo(w1.x, w1.y).lineTo(w2.x, w2.y).stroke({ width: 1.0, color: 0x3e2723, alpha: 0.35 * alpha });
    }

    // Perspective-mapped opposite-face-sum-7 circular pips aligned directly to each 3D face's plane
    const pips = pipCoords[f.value] || pipCoords[1];
    const pipUvR = 0.098;
    const pipSegments = 12;

    pips.forEach(([u, v]) => {
      const pipPoly: number[] = [];
      for (let s = 0; s < pipSegments; s++) {
        const ang = (s / pipSegments) * Math.PI * 2;
        const pt = bilerpQuad(
          f.pts,
          u + Math.cos(ang) * pipUvR,
          v + Math.sin(ang) * pipUvR,
        );
        pipPoly.push(pt.x, pt.y);
      }
      g.poly(pipPoly).fill({ color: pip, alpha });

      const edgeSpanMin = Math.min(
        Math.hypot(f.pts[1].x - f.pts[0].x, f.pts[1].y - f.pts[0].y),
        Math.hypot(f.pts[3].x - f.pts[0].x, f.pts[3].y - f.pts[0].y),
      );
      if (edgeSpanMin > 16) {
        const hiPoly: number[] = [];
        const hiR = pipUvR * 0.34;
        const hiU = u - pipUvR * 0.25;
        const hiV = v - pipUvR * 0.25;
        for (let s = 0; s < 8; s++) {
          const ang = (s / 8) * Math.PI * 2;
          const pt = bilerpQuad(
            f.pts,
            hiU + Math.cos(ang) * hiR,
            hiV + Math.sin(ang) * hiR,
          );
          hiPoly.push(pt.x, pt.y);
        }
        g.poly(hiPoly).fill({ color: 0xffffff, alpha: 0.2 * alpha });
      }
    });
  });
}

function hexToNumber(hex: string): number {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return Number.isNaN(n) ? 0xffffff : n;
}

function rgbToHexNumber(r: number, g: number, b: number): number {
  const cr = Math.max(0, Math.min(255, Math.round(r)));
  const cg = Math.max(0, Math.min(255, Math.round(g)));
  const cb = Math.max(0, Math.min(255, Math.round(b)));
  return (cr << 16) | (cg << 8) | cb;
}

export class LudoScene {
  private app: Application;
  private containerEl: HTMLElement;
  private callbacks: SceneCallbacks;
  private destroyed = false;
  private initialized = false;

  private static readonly BOARD_TEX_HALF = 460;
  private static readonly BOARD_TEX_SIZE = 920;
  private static readonly BG_TEX_SIZE = 1024;
  private static readonly BG_TEX_HALF = 512;
  private static readonly BG_WORLD_HALF = 1320;
  private static readonly CAMERA_FOCAL = 5800;

  // Clean neutral studio backdrop + 3D perspective studio tabletop locked to board
  private bgLayer = new Container();
  private floorSprite: Sprite | null = null;
  private floorTexture: Texture | null = null;
  private bgOffscreenStage = new Container();
  private bgSpinLayer = new Container();
  private bgStaticLayer = new Container();
  private bgRenderTexture: RenderTexture | null = null;
  private bgPerspectiveMesh: PerspectiveMesh | null = null;
  private bgDirty = true;
  private lastRenderedBgRotDeg = Number.NaN;
  private lastBgMeshKey = '';

  // True 3D Perspective Tabletop World
  private boardRoot = new Container();
  private boardOffscreenStage = new Container();
  private boardSpinLayer = new Container();
  private boardStaticLayer = new Container();
  private boardRenderTexture: RenderTexture | null = null;
  private boardShadowMesh: PerspectiveMesh | null = null;
  private boardPerspectiveMesh: PerspectiveMesh | null = null;
  private boardSurfaceAnimGfx = new Graphics();
  private boardHitLayer = new Container();
  private baseHitPolys: Graphics[] = [];
  private baseTriWorlds: Array<Array<{ x: number; y: number }>> = [];
  private yardMetas: BoardYardMeta[] = [];
  private homeLabelNode: Text | null = null;
  private shadowLayer = new Container();
  private smokeGfx = new Graphics();
  private pawnLayer = new Container();

  // Non-interactive 3D Physical Dice directly ON the board + Screen-space FX
  private boardDiceLayer = new Container();
  private boardDieShadows: [Graphics, Graphics] = [new Graphics(), new Graphics()];
  private boardDieNodes: [Graphics, Graphics] = [new Graphics(), new Graphics()];
  private fxLayer = new Container();

  private animPawns: AnimPawn[][] = [];
  private smokeParticles: SmokeParticle[] = [];
  private lastPawnTap: { pIdx: number; iIdx: number; atMs: number } | null = null;
  private pendingTapTimer: ReturnType<typeof setTimeout> | null = null;
  private pawnTextures: Array<Texture | null> = [null, null, null, null, null];
  private bgTextures = new Map<string, Texture>();

  private snapshot: SceneSnapshot | null = null;
  private lastBoardKey = '';
  private lastBgKey = '';
  private boardDirty = true;
  private lastRenderedRotDeg = Number.NaN;
  private lastMeshKey = '';
  private rotationOffsetDeg = 0;
  private targetRotationDeg = 0;
  private currentTiltDeg = 30;
  private targetTiltDeg = 30;
  private tiltInitialized = false;

  private logicalW = 1280;
  private logicalH = 720;
  private boardAnchor = { x: 455, y: 366, scale: 1.09, tilt: 0.75 };

  private static readonly DIE_HALF_SIZE = 0.42 * 1.2; // 0.504 board-tile units (1.2x scaled)
  private static readonly FLY_DURATION_MS = 800;
  private flyActive = false;
  private flyHoldingResult = false;
  private flySeat = 0;
  private flyFinal: [number, number] = [1, 6];
  private flyStartMs = 0;
  private flyStage: 0 | 1 | 2 | 3 = 0;
  private diceAnims: [Dice3DAnim, Dice3DAnim] = [
    this.makeDiceAnim(1, -1.62, 0.28),
    this.makeDiceAnim(6, 1.62, -0.28),
  ];

  private reactions: FloatingReaction[] = [];
  private speechBubbles = new Map<number, SpeechBubble>();
  private plateMetas: Array<{
    seatIdx: number;
    baseCenter: { x: number; y: number };
    totalRot: number;
    plateX: number;
    plateW: number;
    plateH: number;
  }> = [];
  private lastEmittedPlates: NameplateScreenPos[] = [];

  constructor(containerEl: HTMLElement, callbacks: SceneCallbacks) {
    this.containerEl = containerEl;
    this.callbacks = callbacks;
    this.app = new Application();
  }

  private makeDiceAnim(val: number, restX: number, restY: number): Dice3DAnim {
    const targets = this.getDiceTargetAngles(val);
    return {
      startX: restX,
      startY: restY,
      startZ: 0,
      x: restX,
      y: restY,
      z: 0,
      targetX: restX,
      targetY: restY,
      rx: targets.rx,
      ry: targets.ry,
      rz: 0,
      vrx: 0,
      vry: 0,
      vrz: 0,
      lockedAtU78: false,
      lockStartRX: targets.rx,
      lockStartRY: targets.ry,
      lockStartRZ: 0,
      targetRX: targets.rx,
      targetRY: targets.ry,
      targetRZ: 0,
      hoverOffset: 0,
      value: val,
    };
  }

  public async init(logicalW = 1280, logicalH = 720): Promise<void> {
    if (this.initialized || this.destroyed) return;
    this.logicalW = logicalW;
    this.logicalH = logicalH;
    await this.app.init({
      width: logicalW,
      height: logicalH,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    this.containerEl.innerHTML = '';
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.containerEl.appendChild(canvas);

    this.bgLayer.eventMode = 'none';
    this.bgLayer.interactiveChildren = false;
    this.app.stage.addChild(this.bgLayer);
    this.app.stage.addChild(this.boardRoot);

    // Offscreen 3D tabletop studio stage (spins & tilts identically with board)
    this.bgSpinLayer.x = LudoScene.BG_TEX_HALF;
    this.bgSpinLayer.y = LudoScene.BG_TEX_HALF;
    this.bgOffscreenStage.addChild(this.bgSpinLayer);
    this.bgSpinLayer.addChild(this.bgStaticLayer);

    this.bgRenderTexture = RenderTexture.create({
      width: LudoScene.BG_TEX_SIZE,
      height: LudoScene.BG_TEX_SIZE,
      resolution: 1,
      antialias: true,
    });

    this.bgPerspectiveMesh = new PerspectiveMesh({
      texture: this.bgRenderTexture,
      verticesX: 28,
      verticesY: 28,
    });
    this.boardRoot.addChild(this.bgPerspectiveMesh);

    this.boardSpinLayer.x = LudoScene.BOARD_TEX_HALF;
    this.boardSpinLayer.y = LudoScene.BOARD_TEX_HALF;
    this.boardOffscreenStage.addChild(this.boardSpinLayer);
    this.boardSpinLayer.addChild(this.boardStaticLayer);

    this.boardRenderTexture = RenderTexture.create({
      width: LudoScene.BOARD_TEX_SIZE,
      height: LudoScene.BOARD_TEX_SIZE,
      resolution: 2,
      antialias: true,
    });

    this.boardShadowMesh = new PerspectiveMesh({
      texture: this.boardRenderTexture,
      verticesX: 20,
      verticesY: 20,
    });
    this.boardShadowMesh.tint = 0x000000;
    this.boardShadowMesh.alpha = 0.3;
    this.boardRoot.addChild(this.boardShadowMesh);

    this.boardPerspectiveMesh = new PerspectiveMesh({
      texture: this.boardRenderTexture,
      verticesX: 24,
      verticesY: 24,
    });
    this.boardRoot.addChild(this.boardPerspectiveMesh);

    this.boardSurfaceAnimGfx.eventMode = 'none';
    this.boardRoot.addChild(this.boardSurfaceAnimGfx);

    this.boardRoot.addChild(this.boardHitLayer);
    for (let i = 0; i < 5; i++) {
      const hitPoly = new Graphics();
      hitPoly.eventMode = 'static';
      hitPoly.cursor = 'pointer';
      hitPoly.on('pointertap', () => this.callbacks.onBaseTap(i));
      this.boardHitLayer.addChild(hitPoly);
      this.baseHitPolys.push(hitPoly);
    }

    this.shadowLayer.eventMode = 'none';
    this.shadowLayer.interactiveChildren = false;
    this.boardRoot.addChild(this.shadowLayer);
    this.smokeGfx.eventMode = 'none';
    this.boardRoot.addChild(this.smokeGfx);
    this.boardRoot.addChild(this.pawnLayer);

    // Pre-allocated non-interactive 3D dice layer ON the board (never blocks pawn taps)
    this.boardDiceLayer.eventMode = 'none';
    this.boardDiceLayer.interactiveChildren = false;
    this.boardDiceLayer.addChild(this.boardDieShadows[0]);
    this.boardDiceLayer.addChild(this.boardDieShadows[1]);
    this.boardDiceLayer.addChild(this.boardDieNodes[0]);
    this.boardDiceLayer.addChild(this.boardDieNodes[1]);
    this.boardRoot.addChild(this.boardDiceLayer);

    this.app.stage.addChild(this.fxLayer);

    this.createPawnNodes();
    this.loadAssetsAsync();

    this.app.ticker.add((ticker) => {
      this.updateFrame(ticker.deltaTime);
    });
    this.initialized = true;
    this.handleResize();
  }

  private async loadAssetsAsync(): Promise<void> {
    PAWN_ASSET_URLS.forEach(async (url, idx) => {
      try {
        const tex = await Assets.load<Texture>(url);
        if (this.destroyed) return;
        this.pawnTextures[idx] = tex;
        for (let i = 0; i < 4; i++) {
          const ap = this.animPawns[idx]?.[i];
          if (ap) {
            if (!ap.sprite) {
              ap.sprite = new Sprite(tex);
              ap.sprite.anchor.set(0.5, 0.82);
              ap.container.addChild(ap.sprite);
            } else {
              ap.sprite.texture = tex;
            }
            ap.fallbackGfx.visible = false;
          }
        }
      } catch {
        // Keep vector pawn fallback seamlessly
      }
    });
  }

  private clearPendingTap(): void {
    if (this.pendingTapTimer !== null) {
      clearTimeout(this.pendingTapTimer);
      this.pendingTapTimer = null;
    }
    this.lastPawnTap = null;
  }

  private canDoubleTapCombinedMove(pIdx: number, iIdx: number): boolean {
    const snap = this.snapshot;
    if (!snap || !snap.gameStarted || !snap.hasRolled || snap.isRolling) return false;
    if (pIdx !== snap.currentPlayer) return false;
    if (snap.isOnline && snap.mySeat !== snap.currentPlayer) return false;
    if (snap.players[pIdx]?.isAI) return false;
    if (snap.movesAvailable.length < 2) return false;
    const pawn = snap.pawns[pIdx]?.[iIdx];
    if (!pawn || pawn.status !== 'on-path') return false;
    const total = snap.movesAvailable.reduce((a, b) => a + Number(b), 0);
    if (!canMovePawn(snap.pawns, pIdx, iIdx, total, snap.dice, snap.movesAvailable)) return false;
    const singleRes = resolvePawnTapMove(
      snap.pawns,
      pIdx,
      iIdx,
      snap.movesAvailable,
      snap.dice,
      snap.selectedDieIndex,
      false,
    );
    if (singleRes?.dieIdx === 'combined') return false;
    return true;
  }

  private handlePawnPointerTap(pIdx: number, iIdx: number): void {
    const now = performance.now();
    if (
      this.lastPawnTap &&
      this.lastPawnTap.pIdx === pIdx &&
      this.lastPawnTap.iIdx === iIdx &&
      now - this.lastPawnTap.atMs <= 320 &&
      this.canDoubleTapCombinedMove(pIdx, iIdx)
    ) {
      this.clearPendingTap();
      if (this.callbacks.onPawnDoubleTap) {
        this.callbacks.onPawnDoubleTap(pIdx, iIdx);
      } else {
        this.callbacks.onPawnTap(pIdx, iIdx);
      }
      return;
    }

    if (this.pendingTapTimer !== null) {
      const prev = this.lastPawnTap;
      this.clearPendingTap();
      if (prev) {
        this.callbacks.onPawnTap(prev.pIdx, prev.iIdx);
      }
    }

    if (this.callbacks.onPawnDoubleTap && this.canDoubleTapCombinedMove(pIdx, iIdx)) {
      this.lastPawnTap = { pIdx, iIdx, atMs: now };
      this.pendingTapTimer = setTimeout(() => {
        this.pendingTapTimer = null;
        this.lastPawnTap = null;
        if (!this.destroyed) {
          this.callbacks.onPawnTap(pIdx, iIdx);
        }
      }, 215);
    } else {
      this.callbacks.onPawnTap(pIdx, iIdx);
    }
  }

  private createPawnNodes(): void {
    this.clearPendingTap();
    this.smokeParticles.length = 0;
    this.smokeGfx.clear();
    this.shadowLayer.removeChildren();
    this.pawnLayer.removeChildren();
    this.animPawns = Array.from({ length: 5 }, (_, pIdx) =>
      Array.from({ length: 4 }, (_, iIdx) => {
        const container = new Container();
        container.eventMode = 'static';
        container.cursor = 'pointer';
        container.on('pointertap', (e) => {
          e.stopPropagation();
          this.handlePawnPointerTap(pIdx, iIdx);
        });

        const ring = new Graphics();
        const shadow = new Graphics();
        shadow.ellipse(0, 0, 11.5, 6).fill({ color: 0x000000, alpha: 0.3 });
        const fallbackGfx = new Graphics();
        const characterGfx = new Graphics();
        characterGfx.visible = false;
        container.hitArea = {
          contains: (x: number, y: number) => x >= -24 && x <= 24 && y >= -40 && y <= 18,
        };

        this.shadowLayer.addChild(shadow);
        this.shadowLayer.addChild(ring);
        container.addChild(fallbackGfx);
        container.addChild(characterGfx);

        this.pawnLayer.addChild(container);
        return {
          displayPos: -1,
          flightFromPos: -1,
          flightFromX: 0,
          flightFromY: 0,
          renderX: 0,
          renderY: 0,
          initializedPos: false,
          lastSteppedTile: -1,
          stepCounter: 0,
          travelPhase: 0,
          facing: 1,
          dirX: 1,
          dirY: 0,
          celebrateUntil: 0,
          celebrateDuration: 1000,
          celebrateKind: null,
          revUntil: 0,
          revDuration: 460,
          revFromPos: -1,
          revTargetPos: -1,
          smokeTimer: 0,
          turboSkidActive: false,
          container,
          shadow,
          ring,
          sprite: null,
          fallbackGfx,
          characterGfx,
        };
      }),
    );
  }

  public syncState(next: SceneSnapshot): void {
    const prevSnap = this.snapshot;
    const prevRolling = prevSnap?.isRolling ?? false;

    if (prevSnap && prevSnap.gameStarted && next.gameStarted) {
      const nowMs = Date.now();
      let anyCaptured = false;
      for (let vp = 0; vp < 5; vp++) {
        for (let vi = 0; vi < 4; vi++) {
          const oldV = prevSnap.pawns[vp]?.[vi];
          const newV = next.pawns[vp]?.[vi];
          if (oldV && newV && oldV.status === 'on-path' && newV.status === 'home') {
            anyCaptured = true;
          }
        }
      }

      for (let pIdx = 0; pIdx < 5; pIdx++) {
        for (let iIdx = 0; iIdx < 4; iIdx++) {
          const oldP = prevSnap.pawns[pIdx]?.[iIdx];
          const newP = next.pawns[pIdx]?.[iIdx];
          const ap = this.animPawns[pIdx]?.[iIdx];
          if (!oldP || !newP || !ap) continue;

          if (newP.pos > oldP.pos || (oldP.status === 'home' && newP.status !== 'home')) {
            ap.stepCounter = 0;
            ap.lastSteppedTile = Math.floor(ap.displayPos);
            ap.flightFromPos = ap.displayPos;
            ap.flightFromX = ap.renderX;
            ap.flightFromY = ap.renderY;
            if (anyCaptured && pIdx === prevSnap.currentPlayer) {
              ap.celebrateKind = 'capture';
              ap.celebrateDuration = 1050;
              ap.celebrateUntil = nowMs + 1050;
            } else if (oldP.pos < 68 && newP.pos === 68) {
              ap.celebrateKind = 'center_home';
              ap.celebrateDuration = 1200;
              ap.celebrateUntil = nowMs + 1200;
            } else if (oldP.pos < 63 && newP.pos >= 63) {
              ap.celebrateKind = 'home_stretch';
              ap.celebrateDuration = 900;
              ap.celebrateUntil = nowMs + 900;
            }
          }
        }
      }
    }

    this.snapshot = next;

    const turnChanged = !!prevSnap && prevSnap.currentPlayer !== next.currentPlayer;
    const matchReset = !next.gameStarted || (!!prevSnap && prevSnap.gameStarted && !next.gameStarted);
    const serverResyncCleared =
      !!prevSnap && !next.isRolling && !next.hasRolled && (prevSnap.hasRolled || prevSnap.isRolling);

    if (matchReset || turnChanged || serverResyncCleared) {
      this.clearPendingTap();
      this.flyActive = false;
      this.flyHoldingResult = false;
      this.flyStage = 0;
      this.flySeat = next.currentPlayer;
      if (matchReset) {
        this.smokeParticles.length = 0;
        this.smokeGfx.clear();
        for (const row of this.animPawns) {
          for (const ap of row) {
            ap.turboSkidActive = false;
            ap.revUntil = 0;
          }
        }
      }
    }

    if (next.isRolling && !prevRolling) {
      this.startFly(next.dice, next.currentPlayer);
    } else if (!next.isRolling && !this.flyActive) {
      if (!this.flyHoldingResult) {
        this.flySeat = next.currentPlayer;
      }
      const restSpots = this.getBoardDiceRestSpots();
      if (next.hasRolled) {
        this.flyHoldingResult = false;
      }
      this.diceAnims.forEach((d, idx) => {
        const val = this.flyHoldingResult ? this.flyFinal[idx] : next.dice[idx] || 1;
        d.value = val;
        const targets = this.getDiceTargetAngles(val);
        d.targetRX = targets.rx;
        d.targetRY = targets.ry;
        d.targetX = restSpots[idx].x;
        d.targetY = restSpots[idx].y;
        d.x = d.targetX;
        d.y = d.targetY;
        d.z = 0;
        d.rx = targets.rx;
        d.ry = targets.ry;
        if (!next.hasRolled && !this.flyHoldingResult) {
          d.rz = 0;
          d.targetRZ = 0;
        }
      });
    }

    if (next.rotateBoard) {
      // Bring active player's triangular base & upright nameplate cleanly to bottom center (+90°)
      this.targetRotationDeg = 144 - next.currentPlayer * 72;
    } else {
      this.targetRotationDeg = 0;
    }

    const rawTilt = next.cameraTilt;
    const deg =
      typeof rawTilt !== 'number' || Number.isNaN(rawTilt)
        ? 30
        : rawTilt >= 0 && rawTilt <= 1.2
          ? Math.max(0, Math.min(55, Math.round((Math.acos(Math.max(0.57, Math.min(1, rawTilt))) * 180) / Math.PI)))
          : Math.max(0, Math.min(55, rawTilt));
    this.targetTiltDeg = deg;
    if (!this.tiltInitialized) {
      this.currentTiltDeg = deg;
      this.tiltInitialized = true;
    }

    this.applyBoardTransform();
  }

  private getPitchRad(): number {
    return (Math.max(0, Math.min(55, this.currentTiltDeg)) * Math.PI) / 180;
  }

  private projectLocal(wx: number, wy: number, wz = 0): { x: number; y: number; persp: number } {
    const pitchRad = this.getPitchRad();
    const sinP = Math.sin(pitchRad);
    const cosP = Math.cos(pitchRad);
    const zCam = LudoScene.CAMERA_FOCAL - wy * sinP - wz * cosP;
    const persp = LudoScene.CAMERA_FOCAL / Math.max(450, zCam);
    return {
      x: wx * persp,
      y: (wy * cosP - wz * sinP) * persp,
      persp,
    };
  }

  private worldToScreen(wx: number, wy: number, wz = 0): { x: number; y: number; persp: number } {
    const p = this.projectLocal(wx, wy, wz);
    return {
      x: this.boardAnchor.x + p.x * this.boardAnchor.scale,
      y: this.boardAnchor.y + p.y * this.boardAnchor.scale,
      persp: p.persp,
    };
  }

  public spawnReaction(playerIdx: number, emoji: string): void {
    if (!this.initialized || this.destroyed) return;
    const base = this.getCenterOfBase(playerIdx);
    const center = this.worldToScreen(base.x, base.y);
    for (let i = 0; i < 3; i++) {
      const node = new Text({
        text: emoji,
        style: { fontSize: 34 + Math.random() * 10 },
      });
      node.anchor.set(0.5);
      node.x = center.x + (Math.random() - 0.5) * 40;
      node.y = center.y + (Math.random() - 0.5) * 20;
      this.fxLayer.addChild(node);
      this.reactions.push({
        node,
        vx: (Math.random() - 0.5) * 1.4,
        vy: -(1.8 + Math.random() * 1.2),
        age: 0,
        maxAge: 75 + i * 10,
      });
    }
  }

  public showSpeechBubble(playerIdx: number, text: string): void {
    if (!this.initialized || this.destroyed || !text) return;
    for (const old of this.speechBubbles.values()) {
      this.fxLayer.removeChild(old.node);
      old.node.destroy({ children: true });
    }
    this.speechBubbles.clear();

    const base = this.getCenterOfBase(playerIdx);
    const center = this.worldToScreen(base.x, base.y);
    const wScreen = this.logicalW;
    const hScreen = this.logicalH;
    const speakerName = stripSeatTag(this.snapshot?.players[playerIdx]?.name || `Player ${playerIdx + 1}`);
    const playerColorHex = this.getPlayerColorHex(playerIdx);
    const playerColorStr = this.getPlayerColorString(playerIdx);

    const wrap = new Container();
    wrap.x = Math.max(132, Math.min(wScreen - 132, center.x));
    wrap.y = Math.max(115, Math.min(hScreen - 130, center.y - 54));

    const header = new Text({
      text: `🗣️ ${speakerName}`,
      style: {
        fontFamily: 'Fredoka, Inter, sans-serif',
        fontSize: 13,
        fontWeight: '700',
        fill: playerColorStr,
        stroke: { color: '#000000', width: 3 },
      },
    });
    header.anchor.set(0.5, 0);

    const label = new Text({
      text: text.slice(0, 96),
      style: {
        fontFamily: 'Fredoka, Inter, sans-serif',
        fontSize: 15,
        fontWeight: '700',
        fill: '#ffffff',
        stroke: { color: '#000000', width: 3.5 },
        wordWrap: true,
        wordWrapWidth: 215,
        align: 'center',
      },
    });
    label.anchor.set(0.5, 0);

    const contentW = Math.max(header.width, label.width);
    const w = Math.min(246, Math.max(118, contentW + 26));
    const h = Math.max(52, header.height + label.height + 20);

    header.y = -h / 2 + 7;
    label.y = -h / 2 + 7 + header.height + 3;

    // Crystal-clear reflective mirror-glass speech pane so board & tokens behind stay completely visible
    const bg = new Graphics();
    bg.roundRect(-w / 2, -h / 2, w, h, 14)
      .fill({ color: 0xffffff, alpha: 0.16 })
      .stroke({ width: 2.5, color: playerColorHex, alpha: 0.92 });
    // Inner silver mirror rim & subtle top glass sheen reflection
    bg.roundRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 12)
      .stroke({ width: 1, color: 0xffffff, alpha: 0.65 });
    bg.roundRect(-w / 2 + 4, -h / 2 + 3, w - 8, Math.max(10, h * 0.34), 10)
      .fill({ color: 0xffffff, alpha: 0.14 });
    // Small glass speech tail pointing down toward the player's base
    bg.poly([-8, h / 2 - 1, 8, h / 2 - 1, 0, h / 2 + 10])
      .fill({ color: 0xffffff, alpha: 0.22 })
      .stroke({ width: 2, color: playerColorHex, alpha: 0.9 });

    wrap.addChild(bg);
    wrap.addChild(header);
    wrap.addChild(label);
    this.fxLayer.addChild(wrap);
    this.speechBubbles.set(playerIdx, { node: wrap, playerIdx, age: 0, maxAge: 260 });
  }

  private getDiceTargetAngles(val: number): { rx: number; ry: number } {
    if (val === 6) return { rx: Math.PI, ry: 0 };
    if (val === 2) return { rx: -Math.PI / 2, ry: 0 };
    if (val === 5) return { rx: Math.PI / 2, ry: 0 };
    if (val === 3) return { rx: 0, ry: -Math.PI / 2 };
    if (val === 4) return { rx: 0, ry: Math.PI / 2 };
    return { rx: 0, ry: 0 };
  }

  private getBoardDiceRestSpots(): [{ x: number; y: number }, { x: number; y: number }] {
    return [
      { x: -1.62, y: 0.28 },
      { x: 1.62, y: -0.28 },
    ];
  }

  private startFly(dice: [number, number], seatIdx: number): void {
    const ss = BOARD_CONFIG.spaceSize;
    const baseWorld = this.getCenterOfBase(seatIdx);
    const baseBX = baseWorld.x / ss;
    const baseBY = baseWorld.y / ss;
    const restSpots = this.getBoardDiceRestSpots();

    this.flyFinal = [dice[0] || 1, dice[1] || 1];
    this.flySeat = seatIdx;
    this.flyActive = true;
    this.flyHoldingResult = false;
    this.flyStartMs = Date.now();
    this.flyStage = 0;

    this.diceAnims.forEach((d, idx) => {
      const val = this.flyFinal[idx];
      const targets = this.getDiceTargetAngles(val);
      const sx = baseBX + (idx === 0 ? -0.55 : 0.55);
      const sy = baseBY + (idx === 0 ? 0.25 : -0.25);

      d.value = val;
      d.startX = sx;
      d.startY = sy;
      d.startZ = 0.9;
      d.x = sx;
      d.y = sy;
      d.z = d.startZ;
      d.targetX = restSpots[idx].x;
      d.targetY = restSpots[idx].y;
      d.rx = Math.random() * Math.PI * 2;
      d.ry = Math.random() * Math.PI * 2;
      d.rz = Math.random() * Math.PI * 2;
      d.vrx = (idx === 0 ? 1 : -1) * (0.28 + Math.random() * 0.14);
      d.vry = (idx === 0 ? -1 : 1) * (0.24 + Math.random() * 0.14);
      d.vrz = (Math.random() - 0.5) * 0.22;
      d.lockedAtU78 = false;
      d.lockStartRX = d.rx;
      d.lockStartRY = d.ry;
      d.lockStartRZ = d.rz;
      d.targetRX = targets.rx;
      d.targetRY = targets.ry;
      d.targetRZ = (idx === 0 ? -0.16 : 0.14) + (Math.random() - 0.5) * 0.18;
      d.hoverOffset = 0;
    });
  }

  private updateFly(nowMs: number, delta: number): void {
    if (!this.flyActive) return;

    const u = Math.max(0, Math.min(1, (nowMs - this.flyStartMs) / LudoScene.FLY_DURATION_MS));
    const prevStage = this.flyStage;
    const stage: 0 | 1 | 2 | 3 = u >= 1.0 ? 3 : u >= 0.84 ? 2 : u >= 0.62 ? 1 : 0;

    // Fire wooden impact & rattle strictly at physical board-touch frames
    if (prevStage < 1 && stage >= 1) {
      sfx.diceHit(1.0);
      sfx.diceRoll((1 - 0.62) * LudoScene.FLY_DURATION_MS + 150);
    }
    if (prevStage < 2 && stage >= 2) {
      sfx.diceHit(0.55);
    }
    if (prevStage < 3 && stage >= 3) {
      sfx.diceHit(0.32);
    }
    this.flyStage = stage;

    // Horizontal travel profile: 76% at bounce 1 (0.62), 94% at bounce 2 (0.84), 100% at settle (1.0)
    const horizProgress =
      u < 0.62
        ? (u / 0.62) * 0.76
        : u < 0.84
          ? 0.76 + ((u - 0.62) / 0.22) * 0.18
          : 0.94 + ((u - 0.84) / 0.16) * 0.06;

    // Height profile: ballistic throw arc (peak 3.4) -> bounce 1 (peak 1.1) -> settle bounce (peak 0.35)
    let cz = 0;
    if (u < 0.62) {
      const t = u / 0.62;
      cz = this.diceAnims[0].startZ * (1 - t) + 3.4 * 4 * t * (1 - t);
    } else if (u < 0.84) {
      const t = (u - 0.62) / 0.22;
      cz = 1.1 * 4 * t * (1 - t);
    } else if (u < 1.0) {
      const t = (u - 0.84) / 0.16;
      cz = 0.35 * 4 * t * (1 - t);
    }

    const wrapNearest = (from: number, to: number): number => {
      const tau = Math.PI * 2;
      const diff = ((((to - from) % tau) + tau * 1.5) % tau) - Math.PI;
      return from + diff;
    };

    this.diceAnims.forEach((d) => {
      d.x = d.startX + (d.targetX - d.startX) * horizProgress;
      d.y = d.startY + (d.targetY - d.startY) * horizProgress;
      d.z = cz;

      if (u < 0.78) {
        const tumbleScale = u < 0.62 ? 1.0 : 0.6;
        d.rx += d.vrx * tumbleScale * delta;
        d.ry += d.vry * tumbleScale * delta;
        d.rz += d.vrz * tumbleScale * delta;
      } else {
        if (!d.lockedAtU78) {
          d.lockedAtU78 = true;
          d.lockStartRX = d.rx;
          d.lockStartRY = d.ry;
          d.lockStartRZ = d.rz;
          d.targetRX = wrapNearest(d.rx, d.targetRX);
          d.targetRY = wrapNearest(d.ry, d.targetRY);
          d.targetRZ = wrapNearest(d.rz, d.targetRZ);
        }
        const k = Math.max(0, Math.min(1, (u - 0.78) / 0.22));
        const ease = k * k * (3 - 2 * k);
        d.rx = d.lockStartRX + (d.targetRX - d.lockStartRX) * ease;
        d.ry = d.lockStartRY + (d.targetRY - d.lockStartRY) * ease;
        d.rz = d.lockStartRZ + (d.targetRZ - d.lockStartRZ) * ease;
      }
    });

    if (u >= 1.0) {
      this.flyActive = false;
      this.flyHoldingResult = true;
      this.diceAnims.forEach((d) => {
        d.x = d.targetX;
        d.y = d.targetY;
        d.z = 0;
        d.rx = d.targetRX;
        d.ry = d.targetRY;
        d.rz = d.targetRZ;
      });
    }
  }

  private getPlayerColorString(i: number): string {
    return getPlayerColor(i, Boolean(this.snapshot?.isTournament));
  }

  private getPlayerColorHex(i: number): number {
    return hexToNumber(this.getPlayerColorString(i));
  }

  private getStaticArmAngle(i: number): number {
    const p = this.snapshot?.players[i];
    const baseAngle = i * 72 - 90;
    const adj = p?.angleAdj || 0;
    return ((baseAngle + adj) * Math.PI) / 180;
  }

  private getArmAngle(i: number): number {
    return this.getStaticArmAngle(i) + (this.rotationOffsetDeg * Math.PI) / 180;
  }

  private getArmLocalToWorld(
    armIndex: number,
    lx: number,
    ly: number,
    ox = 0,
    oy = 0,
    includeBoardRotation = true,
  ): { x: number; y: number } {
    const p = this.snapshot?.players[armIndex];
    const angle = includeBoardRotation ? this.getArmAngle(armIndex) : this.getStaticArmAngle(armIndex);
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    const totalLX = lx + (p?.radiusAdj || 0) + ox;
    const totalLY = ly + oy;
    return {
      x: totalLX * c - totalLY * s,
      y: totalLX * s + totalLY * c,
    };
  }

  private getSpaceCoords(
    armIndex: number,
    col: number,
    row: number,
    includeBoardRotation = true,
  ): { x: number; y: number } {
    const p = this.snapshot?.players[armIndex];
    const ss = BOARD_CONFIG.spaceSize;
    const wr = BOARD_CONFIG.wingRadius;
    const hScale = p?.spaceHeightScale ?? 1;
    const wScale = p?.widthAdj ?? 1;
    let lx = wr + (row + 0.5) * ss * hScale;
    let ly = (col - 1) * ss * wScale;
    const ox = p?.xAdj || 0;
    const oy = p?.yAdj || 0;
    if (col === 1) {
      lx += p?.winPathXAdj || 0;
      ly += p?.winPathYAdj || 0;
    }
    return this.getArmLocalToWorld(armIndex, lx, ly, ox, oy, includeBoardRotation);
  }

  private getCenterOfBase(i: number, includeBoardRotation = true): { x: number; y: number } {
    const p = this.snapshot?.players[i];
    const ss = BOARD_CONFIG.spaceSize;
    const wr = BOARD_CONFIG.wingRadius;
    const dist = wr + 8.5 * ss;
    const ox = (p?.xAdj || 0) + (p?.baseXAdj || 0);
    const oy = (p?.yAdj || 0) + (p?.baseYAdj || 0);
    return this.getArmLocalToWorld(i, dist, 0, ox, oy, includeBoardRotation);
  }

  private getBasePawnPos(pIdx: number, iIdx: number): { x: number; y: number } {
    const p = this.snapshot?.players[pIdx];
    const ss = BOARD_CONFIG.spaceSize;
    const bc = this.getCenterOfBase(pIdx);
    const baseRot = this.getArmAngle(pIdx) + ((p?.baseRotation || 0) * Math.PI) / 180;
    const s = Math.sin(baseRot);
    const c = Math.cos(baseRot);
    const offsets = [
      { lx: -ss * 1.375, ly: -ss * 1.788 },
      { lx: -ss * 1.375, ly: ss * 1.788 },
      { lx: ss * 0.115, ly: -ss * 0.715 },
      { lx: ss * 0.115, ly: ss * 0.715 },
    ];
    const off = offsets[iIdx] || offsets[0];
    return {
      x: bc.x + (off.lx * c - off.ly * s),
      y: bc.y + (off.lx * s + off.ly * c),
    };
  }

  private getCenterOfWinHome(i: number): { x: number; y: number } {
    const wr = BOARD_CONFIG.wingRadius;
    const rOuter = wr / Math.cos(Math.PI / 5);
    const centerAngleDeg = i * 72 - 90 + this.rotationOffsetDeg;
    const aStart = ((centerAngleDeg - 36) * Math.PI) / 180;
    const aEnd = ((centerAngleDeg + 36) * Math.PI) / 180;
    const p1x = Math.cos(aStart) * rOuter;
    const p1y = Math.sin(aStart) * rOuter;
    const p2x = Math.cos(aEnd) * rOuter;
    const p2y = Math.sin(aEnd) * rOuter;
    const p = this.snapshot?.players[i];
    return {
      x: (p1x + p2x) / 3 + (p?.winXAdj || 0),
      y: (p1y + p2y) / 3 + (p?.winYAdj || 0),
    };
  }

  private getSpaceOrHomeCoords(
    node: { arm: number; c: number; r: number; isHome?: boolean },
    playerIdx: number,
    pawnIdx: number,
  ): { x: number; y: number } {
    if (node.isHome) {
      const c = this.getCenterOfWinHome(playerIdx);
      const offsets = [
        { x: -14, y: -14 },
        { x: 14, y: -14 },
        { x: -14, y: 14 },
        { x: 14, y: 14 },
      ];
      const off = offsets[pawnIdx % 4];
      const rotRad = (this.rotationOffsetDeg * Math.PI) / 180;
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);
      return {
        x: c.x + (off.x * cosR - off.y * sinR),
        y: c.y + (off.x * sinR + off.y * cosR),
      };
    }
    return this.getSpaceCoords(node.arm, node.c, node.r);
  }

  private applyBoardTransform(): void {
    if (!this.initialized || this.destroyed) return;
    const w = this.logicalW;
    const h = this.logicalH;
    const isLandscape = w > h;
    const tilt = Math.cos(this.getPitchRad());

    if (isLandscape) {
      // Exact non-clipping landscape layout (1280x720): board x=41..868, y=66..658
      this.boardAnchor = {
        x: w * (455 / 1280),
        y: h * (366 / 720),
        scale: Math.min(w / 1280, h / 720) * 1.09,
        tilt,
      };
    } else {
      // Portrait layout (720x1280 — mobile & tablet): tucked up cleanly under raised #title
      this.boardAnchor = {
        x: w * 0.5,
        y: h * (444 / 1280),
        scale: Math.min(w / 720, h / 1280) * 0.86,
        tilt,
      };
    }

    this.boardRoot.x = this.boardAnchor.x;
    this.boardRoot.y = this.boardAnchor.y;
    // Uniform scale here because true 3D foreshortening is applied via PerspectiveMesh & projectLocal
    this.boardRoot.scale.set(this.boardAnchor.scale);
  }

  private handleResize(): void {
    if (!this.initialized || this.destroyed) return;
    this.applyBoardTransform();
    this.lastBgKey = '';
    this.lastBgMeshKey = '';
    this.lastEmittedPlates = [];
    this.renderBackground(this.logicalW, this.logicalH);
  }

  private resolveActiveEnvironmentId(): EnvironmentId {
    if (!this.snapshot) return DEFAULT_ENVIRONMENT_ID;
    const themeId = this.snapshot.isTournament
      ? this.snapshot.tournamentBoardThemeId
      : this.snapshot.boardThemeId;
    const theme = BOARD_THEMES[themeId] || BOARD_THEMES.classic;
    const candidate = this.snapshot.backgroundId;
    if (candidate && VALID_ENVIRONMENT_IDS.has(candidate)) {
      return candidate as EnvironmentId;
    }
    return theme.bgId || DEFAULT_ENVIRONMENT_ID;
  }

  private renderBackground(w: number, h: number): void {
    if (!this.snapshot) return;
    const envId = this.resolveActiveEnvironmentId();
    const bgKey = `${envId}:${w}:${h}:${this.snapshot.isTournament}:${Math.round(this.boardAnchor.x)}`;

    if (bgKey !== this.lastBgKey) {
      this.lastBgKey = bgKey;
      this.bgDirty = true;
      this.lastBgMeshKey = '';

      if (this.floorTexture) {
        this.floorTexture.destroy(true);
      }
      this.floorTexture = createEnvironmentSkyTexture(envId, w, h, this.boardAnchor.x, this.boardAnchor.y);
      if (!this.floorSprite) {
        this.floorSprite = new Sprite(this.floorTexture);
        this.bgLayer.addChildAt(this.floorSprite, 0);
      } else {
        this.floorSprite.texture = this.floorTexture;
      }
      this.floorSprite.width = w;
      this.floorSprite.height = h;

      this.bgStaticLayer.removeChildren().forEach((c) => {
        if (c instanceof Graphics) c.destroy();
        else (c as Sprite).destroy({ texture: false });
      });

      let envTex = this.bgTextures.get(envId);
      if (!envTex) {
        envTex = createEnvironmentFloorTexture(envId, LudoScene.BG_TEX_SIZE);
        this.bgTextures.set(envId, envTex);
      }
      const floorTile = new Sprite(envTex);
      floorTile.anchor.set(0.5);
      // Scale 1.45 ensures 360-degree spin never exposes edges on tilted plane
      floorTile.scale.set(1.45);
      this.bgStaticLayer.addChild(floorTile);
    }
  }

  private rebuildBoardGeometryIfNeeded(): void {
    if (!this.snapshot) return;
    const rawThemeId = this.snapshot.isTournament
      ? this.snapshot.tournamentBoardThemeId || 'classic'
      : this.snapshot.boardThemeId || 'classic';
    const themeId = resolveBoardThemeId(rawThemeId);
    const key = [
      themeId,
      this.snapshot.isTournament,
      this.snapshot.isOnline ? '1' : '0',
      this.snapshot.mySeat ?? 'none',
      this.snapshot.players.map((p) => `${p.name}:${p.isAI ? 1 : 0}`).join('|'),
    ].join('::');

    if (key === this.lastBoardKey) return;
    this.lastBoardKey = key;
    this.boardDirty = true;
    this.lastMeshKey = '';

    this.homeLabelNode = null;
    this.plateMetas = [];
    this.baseTriWorlds = [];
    this.yardMetas = [];
    this.lastEmittedPlates = [];
    this.boardStaticLayer.removeChildren().forEach((c) => c.destroy({ children: true }));

    const theme = BOARD_THEMES[themeId] || BOARD_THEMES.classic;
    const trackColor = hexToNumber(theme.track);
    const safeColor = hexToNumber(theme.safe);
    const isNeonTournament = this.snapshot.isTournament && themeId !== 'classic';
    const borderColor = isNeonTournament ? 0xffffff : hexToNumber(theme.border);
    const safeStarStyle = getThemeSafeStarStyle(themeId);
    const ss = BOARD_CONFIG.spaceSize;
    const wr = BOARD_CONFIG.wingRadius;

    // 1. 5 Pentagonal Arms (18 squares each — exact flush alignment to central pentagon & base triangles)
    for (let i = 0; i < 5; i++) {
      const p = this.snapshot.players[i];
      const playerColorHex = this.getPlayerColorHex(i);
      const armAngle = this.getStaticArmAngle(i);
      const sw = ss * (p?.widthAdj || 1);
      const sh = ss * (p?.spaceHeightScale || 1);

      for (let c = 0; c < 3; c++) {
        for (let r = 0; r < 6; r++) {
          const pos = this.getSpaceCoords(i, c, r, false);
          const isSafe = (c === 2 && r === 4) || (c === 0 && r === 3);
          const isColored = (c === 1 && r < 5) || (c === 2 && r === 4);

          let fillHex = trackColor;
          if (isColored) fillHex = playerColorHex;
          else if (isSafe) fillHex = this.snapshot.isTournament ? playerColorHex : safeColor;

          const tile = new Graphics();
          drawThemedTrackTile(
            tile,
            themeId,
            sw,
            sh,
            fillHex,
            borderColor,
            playerColorHex,
            c,
            r,
            isColored,
            isSafe,
            isNeonTournament,
          );
          tile.x = pos.x;
          tile.y = pos.y;
          tile.rotation = armAngle;
          this.boardStaticLayer.addChild(tile);

          if (isSafe) {
            const star = new Text({
              text: '★',
              style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 34,
                fontWeight: '700',
                fill: safeStarStyle.fill,
                stroke: { color: safeStarStyle.stroke, width: 4 },
              },
            });
            star.anchor.set(0.5);
            star.x = pos.x;
            star.y = pos.y;
            star.rotation = armAngle;
            this.boardStaticLayer.addChild(star);
          }
        }
      }
    }

    // 2. 5 Triangular Bases + Raised Nameplates (Exact 5-Fold Pentagonal Pocket Fit)
    for (let i = 0; i < 5; i++) {
      const p = this.snapshot.players[i];
      const playerColorHex = this.getPlayerColorHex(i);
      const armAngle = this.getStaticArmAngle(i);
      const baseCenter = this.getCenterOfBase(i, false);
      const baseWidth = 6 * ss * (p?.baseWidthScale || 1);
      const baseHeight = 5 * ss * (p?.baseHeightScale || 1);
      const totalRot = armAngle + ((p?.baseRotation || 0) * Math.PI) / 180;
      const cosT = Math.cos(totalRot);
      const sinT = Math.sin(totalRot);

      const localCorners = [
        { x: baseHeight / 2, y: 0 },
        { x: -baseHeight / 2, y: -baseWidth / 2 },
        { x: -baseHeight / 2, y: baseWidth / 2 },
      ];
      this.baseTriWorlds.push(
        localCorners.map((pt) => ({
          x: baseCenter.x + pt.x * cosT - pt.y * sinT,
          y: baseCenter.y + pt.x * sinT + pt.y * cosT,
        })),
      );
      this.yardMetas.push({
        baseCenter,
        totalRot,
        playerColorHex,
      });

      const baseCont = new Container();
      baseCont.x = baseCenter.x;
      baseCont.y = baseCenter.y;
      baseCont.rotation = totalRot;

      const outerTri = new Graphics();
      if (this.snapshot.isTournament) {
        outerTri
          .poly([baseHeight / 2, 0, -baseHeight / 2, -baseWidth / 2, -baseHeight / 2, baseWidth / 2])
          .stroke({ width: 10, color: playerColorHex, alpha: 0.4, join: 'round' });
      }
      outerTri
        .poly([baseHeight / 2, 0, -baseHeight / 2, -baseWidth / 2, -baseHeight / 2, baseWidth / 2])
        .fill(playerColorHex)
        .stroke({ width: isNeonTournament ? 3 : 4, color: borderColor, join: 'round' });
      baseCont.addChild(outerTri);

      const innerTri = new Graphics();
      drawThemedYardBase(
        innerTri,
        themeId,
        baseWidth,
        baseHeight,
        playerColorHex,
        trackColor,
        borderColor,
        ss,
        this.snapshot.isTournament,
      );
      baseCont.addChild(innerTri);

      const plateWidth = baseWidth * 0.95;
      const plateHeight = 40;
      const plateX = -baseHeight / 2 - plateHeight / 2 - 15;

      const plateWrap = new Container();
      plateWrap.x = plateX;
      plateWrap.y = 0;
      plateWrap.rotation = Math.PI / 2;

      const plateBg = new Graphics();
      plateBg
        .roundRect(-plateWidth / 2 + 4, -plateHeight / 2 + 4, plateWidth, plateHeight, 8)
        .fill({ color: 0x000000, alpha: 0.3 })
        .roundRect(-plateWidth / 2 - 2, -plateHeight / 2 - 2, plateWidth + 4, plateHeight + 4, 10)
        .fill(trackColor)
        .roundRect(-plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight, 8)
        .fill(playerColorHex);
      plateWrap.addChild(plateBg);

      const cleanName = stripSeatTag(p?.name || `Player ${i + 1}`).toUpperCase();
      const plateText = new Text({
        text: cleanName,
        style: {
          fontFamily: 'Fredoka, sans-serif',
          fontSize: 28,
          fontWeight: '700',
          fill: this.snapshot.isTournament ? '#000000' : '#ffffff',
          dropShadow: this.snapshot.isTournament
            ? false
            : { color: '#000000', alpha: 0.8, distance: 1.5, blur: 2 },
        },
      });
      plateText.anchor.set(0.5);
      const hasWhisperBadge =
        this.snapshot.isOnline && !!p && !p.isAI && i !== this.snapshot.mySeat;
      const maxTextWidth = hasWhisperBadge ? plateWidth * 0.66 : plateWidth * 0.8;
      if (plateText.width > maxTextWidth) {
        plateText.scale.set(maxTextWidth / plateText.width);
      }
      plateWrap.addChild(plateText);
      baseCont.addChild(plateWrap);

      this.plateMetas.push({
        seatIdx: i,
        baseCenter,
        totalRot,
        plateX,
        plateW: plateWidth,
        plateH: plateHeight,
      });

      this.boardStaticLayer.addChild(baseCont);
    }

    // 3. Center Pentagon Home Wedges (Exact Circumradius rPent meeting every arm & triangle apex)
    const rPent = wr / Math.cos(Math.PI / 5);
    for (let i = 0; i < 5; i++) {
      const p = this.snapshot.players[i];
      const playerColorHex = this.getPlayerColorHex(i);
      const centerAngleDeg = i * 72 - 90;
      const aStart = ((centerAngleDeg - 36) * Math.PI) / 180;
      const aEnd = ((centerAngleDeg + 36) * Math.PI) / 180;
      const wx = p?.winXAdj || 0;
      const wy = p?.winYAdj || 0;

      const wedge = new Graphics();
      if (this.snapshot.isTournament) {
        wedge
          .poly([
            wx,
            wy,
            Math.cos(aStart) * rPent + wx,
            Math.sin(aStart) * rPent + wy,
            Math.cos(aEnd) * rPent + wx,
            Math.sin(aEnd) * rPent + wy,
          ])
          .stroke({ width: 8, color: playerColorHex, alpha: 0.35, join: 'round' });
      }
      wedge
        .poly([
          wx,
          wy,
          Math.cos(aStart) * rPent + wx,
          Math.sin(aStart) * rPent + wy,
          Math.cos(aEnd) * rPent + wx,
          Math.sin(aEnd) * rPent + wy,
        ])
        .fill(playerColorHex)
        .stroke({ width: 3, color: themeId === 'classic' ? 0x000000 : borderColor, join: 'round' });
      this.boardStaticLayer.addChild(wedge);
    }

    const centerHubOverlay = new Graphics();
    drawThemedCenterHubOverlay(centerHubOverlay, themeId, wr);
    this.boardStaticLayer.addChild(centerHubOverlay);

    const homeLabel = new Text({
      text: 'HOME',
      style: {
        fontFamily: 'Fredoka, sans-serif',
        fontSize: 28,
        fontWeight: '700',
        fill: theme.homeText,
        dropShadow: { color: '#000000', alpha: 0.75, blur: 5, distance: 1 },
      },
    });
    homeLabel.anchor.set(0.5);
    homeLabel.rotation = -(this.rotationOffsetDeg * Math.PI) / 180;
    this.homeLabelNode = homeLabel;
    this.boardStaticLayer.addChild(homeLabel);
  }

  private drawBoardDice3D(
    nowMs: number,
    remainDiceFlags: [boolean, boolean],
    activeIdx: number,
  ): void {
    if (!this.snapshot) return;
    if (!this.snapshot.gameStarted) {
      this.boardDiceLayer.visible = false;
      return;
    }
    this.boardDiceLayer.visible = true;

    const activeSeatIdx = this.flyActive || this.flyHoldingResult ? this.flySeat : this.snapshot.currentPlayer;
    const palette = resolveSeatDicePalette(
      activeSeatIdx,
      Boolean(this.snapshot.isTournament),
      this.snapshot.diceStyle,
    );
    const dotHex = hexToNumber(palette.pipColor);
    const borderHex = hexToNumber(palette.borderColor);
    const seatGlowHex = hexToNumber(palette.seatHex);
    const isClassic = !this.snapshot.diceStyle || this.snapshot.diceStyle === 'classic';
    const ss = BOARD_CONFIG.spaceSize;

    const isLocalTurn =
      !this.snapshot.players[this.snapshot.currentPlayer]?.isAI &&
      (!this.snapshot.isOnline || this.snapshot.mySeat === this.snapshot.currentPlayer);
    const waitingToRoll =
      !this.snapshot.hasRolled &&
      !this.snapshot.isRolling &&
      !this.flyActive &&
      !this.flyHoldingResult &&
      isLocalTurn;

    const postLandAll =
      !this.flyActive && !this.flyHoldingResult && this.snapshot.hasRolled && !this.snapshot.isRolling;
    const legalMoves = postLandAll
      ? getLegalMoves(
          this.snapshot.pawns,
          this.snapshot.currentPlayer,
          this.snapshot.movesAvailable,
          this.snapshot.dice,
        )
      : [];

    const projBoardUnits = (bx: number, by: number, bz: number) =>
      this.projectLocal(bx * ss, by * ss, bz * ss);

    // Depth sort the two board dice back-to-front so whichever arcs nearer renders in front
    const order = [0, 1].sort((a, b) => {
      const pa = projBoardUnits(this.diceAnims[a].x, this.diceAnims[a].y, this.diceAnims[a].z);
      const pb = projBoardUnits(this.diceAnims[b].x, this.diceAnims[b].y, this.diceAnims[b].z);
      return pa.persp - pb.persp;
    });

    order.forEach((idx, zOrder) => {
      const d = this.diceAnims[idx];
      const sh = this.boardDieShadows[idx];
      const g = this.boardDieNodes[idx];
      this.boardDiceLayer.setChildIndex(sh, zOrder);
      this.boardDiceLayer.setChildIndex(g, 2 + zOrder);

      const postLand = postLandAll;
      let playableForDie = true;
      if (postLand) {
        if (!remainDiceFlags[idx]) {
          playableForDie = false;
        } else if (this.snapshot!.movesAvailable.length >= 2) {
          playableForDie = legalMoves.some((m) => m.dieIdx === idx || m.dieIdx === 'combined');
        } else if (this.snapshot!.movesAvailable.length === 1) {
          playableForDie = legalMoves.some((m) => m.dieIdx === 0);
        } else {
          playableForDie = false;
        }
      }
      const used = postLand && (!remainDiceFlags[idx] || !playableForDie);
      const selected = postLand && remainDiceFlags[idx] && playableForDie && activeIdx === idx;
      const hoverPulse =
        waitingToRoll || selected
          ? 0.5 + 0.5 * Math.sin(nowMs * (selected ? 0.008 : 0.005) + idx * 0.7)
          : 0;
      const floatZ = waitingToRoll ? 0.06 + hoverPulse * 0.07 : selected ? 0.05 + hoverPulse * 0.05 : 0;

      drawBoardDie3D(
        g,
        sh,
        projBoardUnits,
        d.x,
        d.y,
        d.z + floatZ,
        LudoScene.DIE_HALF_SIZE,
        d.value,
        palette.faceRgb,
        dotHex,
        {
          rotX: d.rx,
          rotY: d.ry,
          rotZ: d.rz,
          borderHex,
          glowHex: !isClassic || waitingToRoll || selected ? seatGlowHex : null,
          seatGlowHex,
          styleId: this.snapshot!.diceStyle,
          used,
          selected,
          hoverPulse,
        },
      );
    });
  }

  private updateBoardPerspective(rotRad: number): void {
    if (!this.boardRenderTexture || !this.boardPerspectiveMesh || !this.boardShadowMesh) return;

    const needsBgTextureRender =
      this.bgDirty ||
      Number.isNaN(this.lastRenderedBgRotDeg) ||
      Math.abs(this.rotationOffsetDeg - this.lastRenderedBgRotDeg) > 0.02;

    if (needsBgTextureRender && this.bgRenderTexture) {
      this.bgSpinLayer.rotation = rotRad;
      this.app.renderer.render({
        container: this.bgOffscreenStage,
        target: this.bgRenderTexture,
        clear: true,
      });
      this.lastRenderedBgRotDeg = this.rotationOffsetDeg;
      this.bgDirty = false;
    }

    const bgMeshKey = `${this.currentTiltDeg.toFixed(2)}:${this.rotationOffsetDeg.toFixed(2)}:${this.boardAnchor.scale.toFixed(3)}`;
    if (this.bgPerspectiveMesh && bgMeshKey !== this.lastBgMeshKey) {
      this.lastBgMeshKey = bgMeshKey;
      const fr = LudoScene.BG_WORLD_HALF;
      const fz = -14;
      const ftl = this.projectLocal(-fr, -fr, fz);
      const ftr = this.projectLocal(fr, -fr, fz);
      const fbr = this.projectLocal(fr, fr, fz);
      const fbl = this.projectLocal(-fr, fr, fz);
      this.bgPerspectiveMesh.setCorners(ftl.x, ftl.y, ftr.x, ftr.y, fbr.x, fbr.y, fbl.x, fbl.y);
    }

    const needsTextureRender =
      this.boardDirty ||
      Number.isNaN(this.lastRenderedRotDeg) ||
      Math.abs(this.rotationOffsetDeg - this.lastRenderedRotDeg) > 0.02;

    if (needsTextureRender) {
      this.boardSpinLayer.rotation = rotRad;
      if (this.homeLabelNode) {
        this.homeLabelNode.rotation = -rotRad;
      }
      this.app.renderer.render({
        container: this.boardOffscreenStage,
        target: this.boardRenderTexture,
        clear: true,
      });
      this.lastRenderedRotDeg = this.rotationOffsetDeg;
      this.boardDirty = false;
    }

    const meshKey = `${this.currentTiltDeg.toFixed(2)}:${this.rotationOffsetDeg.toFixed(2)}:${this.boardAnchor.scale.toFixed(3)}`;
    if (meshKey !== this.lastMeshKey) {
      this.lastMeshKey = meshKey;
      const r = LudoScene.BOARD_TEX_HALF;
      const tl = this.projectLocal(-r, -r, 0);
      const tr = this.projectLocal(r, -r, 0);
      const br = this.projectLocal(r, r, 0);
      const bl = this.projectLocal(-r, r, 0);
      this.boardPerspectiveMesh.setCorners(tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y);

      const pitchRad = this.getPitchRad();
      const shadowDepth = -8 - Math.sin(pitchRad) * 22;
      const stl = this.projectLocal(-r, -r, shadowDepth);
      const str = this.projectLocal(r, -r, shadowDepth);
      const sbr = this.projectLocal(r, r, shadowDepth);
      const sbl = this.projectLocal(-r, r, shadowDepth);
      this.boardShadowMesh.setCorners(stl.x, stl.y, str.x, str.y, sbr.x, sbr.y, sbl.x, sbl.y);
      this.boardShadowMesh.alpha = 0.18 + Math.sin(pitchRad) * 0.2;

      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);
      for (let i = 0; i < 5; i++) {
        const tri = this.baseTriWorlds[i];
        const polyGfx = this.baseHitPolys[i];
        if (!tri || !polyGfx) continue;
        polyGfx.clear();
        const pts: number[] = [];
        for (const pt of tri) {
          const wx = pt.x * cosR - pt.y * sinR;
          const wy = pt.x * sinR + pt.y * cosR;
          const pr = this.projectLocal(wx, wy, 0);
          pts.push(pr.x, pr.y);
        }
        polyGfx.poly(pts).fill({ color: 0xffffff, alpha: 0.001 });
      }
    }
  }

  private updateFrame(delta: number): void {
    if (!this.snapshot || this.destroyed) return;

    const tiltDiff = this.targetTiltDeg - this.currentTiltDeg;
    if (Math.abs(tiltDiff) > 0.05) {
      this.currentTiltDeg += tiltDiff * Math.min(1, 0.22 * delta);
      this.boardAnchor.tilt = Math.cos(this.getPitchRad());
    } else if (this.currentTiltDeg !== this.targetTiltDeg) {
      this.currentTiltDeg = this.targetTiltDeg;
      this.boardAnchor.tilt = Math.cos(this.getPitchRad());
    }

    const prevRotDeg = this.rotationOffsetDeg;
    const rotDiff = ((((this.targetRotationDeg - this.rotationOffsetDeg) % 360) + 540) % 360) - 180;
    if (Math.abs(rotDiff) > 0.15) {
      this.rotationOffsetDeg += rotDiff * Math.min(1, 0.11 * delta);
    } else {
      this.rotationOffsetDeg = this.targetRotationDeg;
    }
    const rotRad = (this.rotationOffsetDeg * Math.PI) / 180;
    const rotStepDeg = ((((this.rotationOffsetDeg - prevRotDeg) % 360) + 540) % 360) - 180;
    const rotStepRad = (rotStepDeg * Math.PI) / 180;

    this.renderBackground(this.logicalW, this.logicalH);
    this.rebuildBoardGeometryIfNeeded();
    this.updateBoardPerspective(rotRad);
    this.emitNameplatePositionsIfChanged(rotRad);

    const isSelectable =
      this.snapshot.hasRolled &&
      !this.snapshot.isRolling &&
      this.snapshot.movesAvailable.length > 0;

    const remainDiceFlags: [boolean, boolean] =
      this.snapshot.movesAvailable.length >= 2
        ? [true, true]
        : this.snapshot.movesAvailable.length === 1
          ? [
              this.snapshot.dice[0] === this.snapshot.movesAvailable[0],
              this.snapshot.dice[0] !== this.snapshot.movesAvailable[0] &&
                this.snapshot.dice[1] === this.snapshot.movesAvailable[0],
            ]
          : [false, false];

    const activeIdx =
      this.snapshot.movesAvailable.length === 1
        ? remainDiceFlags[0]
          ? 0
          : remainDiceFlags[1]
            ? 1
            : -1
        : this.snapshot.selectedDieIndex ?? -1;

    const frameNowMs = Date.now();
    const rawThemeId = this.snapshot.isTournament
      ? this.snapshot.tournamentBoardThemeId || 'classic'
      : this.snapshot.boardThemeId || 'classic';
    const activeThemeId = resolveBoardThemeId(rawThemeId);
    drawBoardLiveSurfaceEffects(
      this.boardSurfaceAnimGfx,
      activeThemeId,
      frameNowMs,
      this.yardMetas,
      rotRad,
      (wx, wy, wz) => this.projectLocal(wx, wy, wz),
    );
    this.updateFly(frameNowMs, delta);
    this.drawBoardDice3D(frameNowMs, remainDiceFlags, activeIdx);

    // Compute occupancy on board for radial stacking
    const occupancy = new Map<string, Array<{ pIdx: number; iIdx: number }>>();
    for (let pIdx = 0; pIdx < 5; pIdx++) {
      const path = getPawnPath(pIdx);
      this.snapshot.pawns[pIdx]?.forEach((pawn, iIdx) => {
        if (pawn.status === 'on-path') {
          const sq = path[pawn.pos];
          if (sq && !sq.isHome) {
            const key = `${sq.arm}-${sq.c}-${sq.r}`;
            const list = occupancy.get(key) || [];
            list.push({ pIdx, iIdx });
            occupancy.set(key, list);
          }
        }
      });
    }

    const ss = BOARD_CONFIG.spaceSize;
    const nowMs = Date.now();
    const canInteract =
      this.snapshot.gameStarted &&
      this.snapshot.hasRolled &&
      !this.snapshot.isRolling &&
      (!this.snapshot.isOnline || this.snapshot.mySeat === this.snapshot.currentPlayer);

    const drawOrder: Array<{ pIdx: number; iIdx: number; pos: number; projY: number; node: AnimPawn }> = [];
    const groundFlatten = Math.max(0.55, Math.cos(this.getPitchRad()));

    for (let pIdx = 0; pIdx < 5; pIdx++) {
      const path = getPawnPath(pIdx);
      const colorHex = this.getPlayerColorHex(pIdx);
      const isLone = isLoneTokenOnTrack(this.snapshot.pawns, pIdx);
      const combinedSteps = this.snapshot.movesAvailable.reduce((a, b) => a + Number(b), 0);
      const charId = resolveCharacterId(
        this.snapshot.tokenStyle,
        pIdx,
        this.snapshot.seatTokenOverrides,
      );
      const charGender = resolveCharacterGender(
        this.snapshot.tokenGenderMode,
        this.snapshot.players[pIdx]?.gender,
      );
      const fastCadence = this.snapshot.dice[0] === 6 && this.snapshot.dice[1] === 6;

      const locomotion = getTokenLocomotionMode(charId);
      const isAnimal = isAnimalCharacter(charId);

      for (let iIdx = 0; iIdx < 4; iIdx++) {
        const pawn = this.snapshot.pawns[pIdx][iIdx];
        const ap = this.animPawns[pIdx][iIdx];
        const diff = pawn.pos - ap.displayPos;
        const isSkid = locomotion === 'skid';

        // Trigger pre-launch rev-up & burnout smoke on far Classic forward runs (e.g. 5+4=9, 6+3=9, 5+5=10, 6+4=10, 6+5=11, 6+6=12)
        if (isSkid && ap.initializedPos && ap.displayPos >= 0 && !ap.turboSkidActive && diff >= 8.95) {
          ap.turboSkidActive = true;
          ap.revDuration = 460;
          ap.revUntil = nowMs + ap.revDuration;
          ap.revFromPos = ap.displayPos;
          ap.revTargetPos = pawn.pos;
          ap.smokeTimer = 0;
          sfx.playTurboSkidLaunch();
        } else if (ap.turboSkidActive && diff < -0.05) {
          ap.turboSkidActive = false;
          ap.revUntil = 0;
        }

        const revRemaining = isSkid && ap.turboSkidActive ? Math.max(0, ap.revUntil - nowMs) : 0;
        const isRevving = revRemaining > 0 && diff > 0.01;
        const revProgress = isRevving && ap.revDuration > 0 ? 1 - revRemaining / ap.revDuration : 0;

        if (Math.abs(diff) > 0.01) {
          if (isRevving) {
            // Hold position with subtle forward tire-creep vibration while revving up
            ap.displayPos = ap.revFromPos + 0.08 * (revProgress * revProgress);
          } else if (locomotion === 'fly' && diff > 0.01) {
            const flightSpan = Math.max(1, pawn.pos - ap.flightFromPos);
            const flySpeed = Math.max(0.115, flightSpan * 0.022) * delta;
            ap.displayPos += Math.min(diff, flySpeed);
          } else if (isSkid && ap.turboSkidActive && diff > 0.01) {
            const launchSpeed = Math.max(0.22, Math.min(0.42, 0.23 + diff * 0.018)) * delta;
            ap.displayPos += Math.min(diff, launchSpeed);
          } else if (isSkid && diff > 0.01) {
            ap.displayPos += Math.min(diff, 0.155 * delta);
          } else {
            ap.displayPos += diff > 0 ? Math.min(diff, 0.105 * delta) : Math.max(diff, -0.34 * delta);
          }
        } else {
          ap.displayPos = pawn.pos;
          ap.flightFromPos = pawn.pos;
          if (ap.turboSkidActive) {
            ap.turboSkidActive = false;
            ap.revUntil = 0;
            // Emit crisp braking puff ring on stopping after a turbo skid
            const stopProj = this.projectLocal(ap.renderX, ap.renderY, 0);
            const stopScale = stopProj.persp * 0.84;
            for (let b = 0; b < 5; b++) {
              const ang = (b / 5) * Math.PI * 2 + Math.random() * 0.5;
              this.spawnSmokeParticle(
                stopProj.x + Math.cos(ang) * 5 * stopScale,
                stopProj.y + Math.sin(ang) * 3 * stopScale,
                Math.cos(ang) * 0.85 * stopScale,
                Math.sin(ang) * 0.5 * stopScale - 0.35 * stopScale,
                4.2 * stopScale,
                0.24 * stopScale,
                16 + Math.random() * 6,
                0.42,
                0xe2e8f0,
              );
            }
          }
        }

        // Fire per-tile crisp character step cues (Eagle emits soar cue on takeoff / long span rather than ground tile clicks)
        const currentTile = Math.floor(ap.displayPos + 0.001);
        if (charId && diff > 0.02) {
          if (locomotion === 'fly') {
            if (ap.stepCounter === 0 || currentTile - ap.lastSteppedTile >= 4) {
              ap.lastSteppedTile = currentTile;
              sfx.playCharacterMoveStep(charId, charGender, ap.stepCounter, fastCadence);
              ap.stepCounter += 1;
            }
          } else if (currentTile > ap.lastSteppedTile) {
            ap.lastSteppedTile = currentTile;
            sfx.playCharacterMoveStep(charId, charGender, ap.stepCounter, fastCadence);
            ap.stepCounter += 1;
          }
        } else if (Math.abs(diff) <= 0.01) {
          ap.lastSteppedTile = Math.floor(pawn.pos);
        }

        let stackX = 0;
        let stackY = 0;
        if (pawn.status === 'on-path') {
          const sq = path[pawn.pos];
          if (sq && !sq.isHome) {
            const shared = occupancy.get(`${sq.arm}-${sq.c}-${sq.r}`);
            if (shared && shared.length > 1) {
              const sIdx = shared.findIndex((s) => s.pIdx === pIdx && s.iIdx === iIdx);
              if (sIdx >= 0) {
                const ang = (sIdx / shared.length) * Math.PI * 2 + rotRad;
                stackX = Math.cos(ang) * ss * 0.25;
                stackY = Math.sin(ang) * ss * 0.25;
              }
            }
          }
        }

        const isEagleFlight = locomotion === 'fly' && diff > 0.02;
        let flightLift = 0;
        let target: { x: number; y: number };
        if (isEagleFlight) {
          const flightSpan = Math.max(0.5, pawn.pos - ap.flightFromPos);
          const flightT = Math.max(0, Math.min(1, (ap.displayPos - ap.flightFromPos) / flightSpan));
          const smoothT = flightT * flightT * (3 - 2 * flightT);
          const destBase =
            pawn.pos < 0
              ? this.getBasePawnPos(pIdx, iIdx)
              : this.getSpaceOrHomeCoords(path[Math.min(path.length - 1, pawn.pos)], pIdx, iIdx);
          target = {
            x: ap.flightFromX + (destBase.x + stackX - ap.flightFromX) * smoothT - stackX,
            y: ap.flightFromY + (destBase.y + stackY - ap.flightFromY) * smoothT - stackY,
          };
          flightLift = Math.sin(flightT * Math.PI) * (24 + Math.min(20, flightSpan * 2.5)) + 10;
        } else if (ap.displayPos < 0) {
          const base = this.getBasePawnPos(pIdx, iIdx);
          const firstSq = this.getSpaceCoords(path[0].arm, path[0].c, path[0].r);
          const t = Math.max(0, Math.min(1, ap.displayPos + 1));
          target = {
            x: base.x + (firstSq.x - base.x) * t,
            y: base.y + (firstSq.y - base.y) * t,
          };
        } else {
          const i1 = Math.floor(ap.displayPos);
          const i2 = Math.min(path.length - 1, Math.ceil(ap.displayPos));
          const t = ap.displayPos - i1;
          const p1 = this.getSpaceOrHomeCoords(path[i1], pIdx, iIdx);
          const p2 = this.getSpaceOrHomeCoords(path[i2], pIdx, iIdx);
          target = {
            x: p1.x + (p2.x - p1.x) * t,
            y: p1.y + (p2.y - p1.y) * t,
          };
          if (locomotion === 'slither' && diff > 0.03) {
            const segDx = p2.x - p1.x;
            const segDy = p2.y - p1.y;
            const segLen = Math.hypot(segDx, segDy);
            if (segLen > 0.1) {
              const taper = Math.min(1, Math.abs(diff) * 1.4);
              const sWave = Math.sin(ap.travelPhase * 2.4) * ss * 0.14 * taper;
              target.x += (-segDy / segLen) * sWave;
              target.y += (segDx / segLen) * sWave;
            }
          }
        }

        if (!ap.initializedPos) {
          ap.renderX = target.x + stackX;
          ap.renderY = target.y + stackY;
          ap.flightFromX = ap.renderX;
          ap.flightFromY = ap.renderY;
          ap.flightFromPos = pawn.pos;
          ap.initializedPos = true;
        } else {
          // Rotate stationary/moving pawn coords in lockstep with GPU board spin so pawns never slip off squares
          if (Math.abs(rotStepRad) > 1e-6) {
            const cs = Math.cos(rotStepRad);
            const sn = Math.sin(rotStepRad);
            const rx = ap.renderX * cs - ap.renderY * sn;
            const ry = ap.renderX * sn + ap.renderY * cs;
            ap.renderX = rx;
            ap.renderY = ry;
            const fx = ap.flightFromX * cs - ap.flightFromY * sn;
            const fy = ap.flightFromX * sn + ap.flightFromY * cs;
            ap.flightFromX = fx;
            ap.flightFromY = fy;
          }
          const lerpAmt = isEagleFlight
            ? Math.min(1, 0.55 * delta)
            : isSkid
              ? Math.min(1, (ap.turboSkidActive ? 0.5 : 0.3) * delta)
              : locomotion === 'slither'
                ? Math.min(1, 0.24 * delta)
                : Math.min(1, 0.18 * delta);
          ap.renderX += (target.x + stackX - ap.renderX) * lerpAmt;
          ap.renderY += (target.y + stackY - ap.renderY) * lerpAmt;
        }

        const settleDist = Math.hypot(target.x + stackX - ap.renderX, target.y + stackY - ap.renderY);
        const isMovingNow = !isRevving && (Math.abs(diff) > 0.03 || settleDist > 1.8);
        if (isMovingNow) {
          ap.travelPhase += delta * (isSkid && ap.turboSkidActive ? 0.38 : 0.22);
        } else if (Math.abs(diff) <= 0.01 && settleDist <= 1.2) {
          ap.travelPhase = 0;
          ap.flightFromX = ap.renderX;
          ap.flightFromY = ap.renderY;
        }

        const isMovable =
          pIdx === this.snapshot.currentPlayer &&
          canInteract &&
          (this.snapshot.movesAvailable.some((s) =>
            canMovePawn(this.snapshot!.pawns, pIdx, iIdx, s, this.snapshot!.dice, this.snapshot!.movesAvailable),
          ) ||
            (isLone &&
              this.snapshot.movesAvailable.length > 1 &&
              canMovePawn(
                this.snapshot.pawns,
                pIdx,
                iIdx,
                combinedSteps,
                this.snapshot.dice,
                this.snapshot.movesAvailable,
              )));

        const isJumper = locomotion === 'jump';
        const bounce = isMovable && isJumper ? Math.abs(Math.sin(nowMs / 150)) * 22 : 0;
        const stepFraction = ((ap.displayPos % 1) + 1) % 1;
        const moveJumpLift =
          isJumper && isMovingNow && diff > 0.02
            ? Math.sin(stepFraction * Math.PI) * 15
            : 0;
        const activeAirLift = isEagleFlight ? flightLift : bounce + moveJumpLift;

        const proj = this.projectLocal(ap.renderX, ap.renderY, 0);

        const bodyScale = proj.persp * 0.84;
        ap.container.x = proj.x;
        ap.container.y = proj.y;
        ap.container.scale.set(bodyScale);

        // Compute screen-space path direction so both characters and classic skidding tokens know travel vector
        if (charId || isSkid) {
          const isReturning = diff < -0.04;
          let dirFrom = { x: ap.renderX, y: ap.renderY };
          let dirTo: { x: number; y: number };
          if (isEagleFlight) {
            dirFrom = { x: ap.flightFromX, y: ap.flightFromY };
            const destBase =
              pawn.pos < 0
                ? this.getBasePawnPos(pIdx, iIdx)
                : this.getSpaceOrHomeCoords(path[Math.min(path.length - 1, pawn.pos)], pIdx, iIdx);
            dirTo = { x: destBase.x + stackX, y: destBase.y + stackY };
          } else if (isReturning) {
            dirTo = { x: target.x + stackX, y: target.y + stackY };
          } else if (ap.displayPos < 0) {
            dirFrom = this.getBasePawnPos(pIdx, iIdx);
            dirTo = this.getSpaceCoords(path[0].arm, path[0].c, path[0].r);
          } else if (ap.displayPos >= path.length - 1) {
            dirFrom = this.getSpaceOrHomeCoords(path[path.length - 2], pIdx, iIdx);
            dirTo = this.getCenterOfWinHome(pIdx);
          } else {
            const curIdx = Math.max(0, Math.min(path.length - 2, Math.floor(ap.displayPos + 0.001)));
            const nxtIdx = curIdx + 1;
            dirFrom = this.getSpaceOrHomeCoords(path[curIdx], pIdx, iIdx);
            dirTo = this.getSpaceOrHomeCoords(path[nxtIdx], pIdx, iIdx);
          }
          const fromProj = this.projectLocal(dirFrom.x, dirFrom.y, 0);
          const toProj = this.projectLocal(dirTo.x, dirTo.y, 0);
          const sDx = toProj.x - fromProj.x;
          const sDy = toProj.y - fromProj.y;
          const sLen = Math.hypot(sDx, sDy);
          if (sLen > 0.5) {
            ap.dirX = sDx / sLen;
            ap.dirY = sDy / sLen;
            if (Math.abs(sDx) > 0.25) {
              ap.facing = sDx >= 0 ? 1 : -1;
            }
          }
        }

        // Emit Classic burnout / turbo skid / light slide smoke particles behind travel direction
        if (isSkid) {
          if (isRevving) {
            ap.smokeTimer -= delta;
            if (ap.smokeTimer <= 0) {
              ap.smokeTimer = 0.65;
              const perpX = -ap.dirY;
              const perpY = ap.dirX;
              for (let k = 0; k < 2; k++) {
                const spread = (Math.random() - 0.5) * 1.1;
                const backSpd = (1.1 + revProgress * 1.4 + Math.random() * 0.6) * bodyScale;
                const smokeColors = [0xf8fafc, 0xe2e8f0, 0xcbd5e1, 0x94a3b8];
                const tint = smokeColors[Math.floor(Math.random() * smokeColors.length)];
                this.spawnSmokeParticle(
                  proj.x - ap.dirX * 8 * bodyScale + perpX * spread * 5 * bodyScale,
                  proj.y - ap.dirY * 5 * bodyScale + perpY * spread * 3 * bodyScale,
                  (-ap.dirX * backSpd + perpX * spread * 0.9 * bodyScale),
                  (-ap.dirY * backSpd + perpY * spread * 0.6 * bodyScale) - 0.25 * bodyScale,
                  (4.2 + revProgress * 3.0) * bodyScale,
                  (0.28 + revProgress * 0.14) * bodyScale,
                  20 + Math.random() * 10,
                  0.52 + revProgress * 0.18,
                  tint,
                );
              }
              if (revProgress > 0.2) {
                for (let spk = 0; spk < 2; spk++) {
                  const sparkSpread = (Math.random() - 0.5) * 1.8;
                  this.spawnSmokeParticle(
                    proj.x - ap.dirX * 6 * bodyScale,
                    proj.y - ap.dirY * 4 * bodyScale,
                    (-ap.dirX * (2.0 + Math.random() * 0.8) + perpX * sparkSpread) * bodyScale,
                    (-ap.dirY * (1.5 + Math.random() * 0.6) + perpY * sparkSpread * 0.7) * bodyScale,
                    2.6 * bodyScale,
                    0.06 * bodyScale,
                    10 + Math.random() * 5,
                    0.92,
                    spk === 0 ? 0xfef08a : Math.random() > 0.4 ? 0xfbbf24 : 0xf97316,
                  );
                }
              }
            }
          } else if (isMovingNow && diff > 0.03) {
            ap.smokeTimer -= delta;
            const interval = ap.turboSkidActive ? 0.55 : 2.1;
            if (ap.smokeTimer <= 0) {
              ap.smokeTimer = interval;
              const perpX = -ap.dirY;
              const perpY = ap.dirX;
              const spread = (Math.random() - 0.5) * 0.8;
              const speedFactor = ap.turboSkidActive ? 1.4 : 0.55;
              this.spawnSmokeParticle(
                proj.x - ap.dirX * 7 * bodyScale,
                proj.y - ap.dirY * 4.5 * bodyScale,
                (-ap.dirX * speedFactor + perpX * spread * 0.6) * bodyScale,
                (-ap.dirY * speedFactor + perpY * spread * 0.4) * bodyScale - 0.15 * bodyScale,
                (ap.turboSkidActive ? 4.4 : 2.8) * bodyScale,
                (ap.turboSkidActive ? 0.24 : 0.14) * bodyScale,
                ap.turboSkidActive ? 18 : 13,
                ap.turboSkidActive ? 0.46 : 0.26,
                ap.turboSkidActive ? 0xe2e8f0 : 0xf1f5f9,
              );
            }
          }
        }

        const hopLiftScale = Math.max(0.45, 1 - activeAirLift * 0.012);
        ap.shadow.x = proj.x;
        ap.shadow.y = proj.y;
        ap.shadow.scale.set(bodyScale);
        ap.shadow.clear();
        if (isAnimal) {
          drawAnimalGroundAura(
            ap.shadow,
            colorHex,
            groundFlatten,
            hopLiftScale,
            ap.dirX,
            ap.dirY,
            isMovable && !isMovingNow,
            nowMs,
            pIdx,
            iIdx,
          );
        } else {
          if (isRevving) {
            const burnoutPulse = 0.5 + 0.5 * Math.sin(nowMs * 0.04);
            ap.shadow
              .ellipse(0, 0, (14.5 + revProgress * 5.5) * hopLiftScale, (14.5 + revProgress * 5.5) * hopLiftScale * groundFlatten)
              .fill({ color: 0xf97316, alpha: 0.2 + burnoutPulse * 0.22 })
              .stroke({ width: 2.2, color: 0xfbbf24, alpha: 0.55 + burnoutPulse * 0.35 });
          }
          ap.shadow
            .ellipse(0, 0, 11.5 * hopLiftScale, 11.5 * hopLiftScale * groundFlatten)
            .fill({ color: 0x000000, alpha: 0.3 });
        }

        ap.ring.x = proj.x;
        ap.ring.y = proj.y;
        ap.ring.scale.set(bodyScale, bodyScale * groundFlatten);
        ap.ring.clear();
        if (isMovable) {
          const basePulse = (ss * 0.58 + Math.sin(nowMs / 200) * 5) * 0.85;
          const pulseR = isAnimal ? Math.max(21.5, basePulse) : basePulse;
          ap.ring.ellipse(0, 0, pulseR, pulseR * 0.85).stroke({ width: 3.2, color: 0xffffff });
        }

        if (charId) {
          if (ap.sprite) ap.sprite.visible = false;
          ap.fallbackGfx.visible = false;
          ap.characterGfx.visible = true;

          const celebrateRemaining = ap.celebrateUntil - nowMs;
          const celebrateProgress =
            celebrateRemaining > 0 && ap.celebrateDuration > 0
              ? 1 - Math.min(1, celebrateRemaining / ap.celebrateDuration)
              : 0;
          if (celebrateRemaining <= 0) {
            ap.celebrateKind = null;
          }
          drawCharacterToken({
            gfx: ap.characterGfx,
            charId,
            gender: charGender,
            colorHex,
            nowMs,
            seatIdx: pIdx,
            pawnIdx: iIdx,
            facing: ap.facing,
            dirX: ap.dirX,
            dirY: ap.dirY,
            isMovable,
            isMoving: isMovingNow,
            stepFraction,
            travelPhase: ap.travelPhase,
            bounce: bounce * 0.65,
            flightLift,
            celebrateProgress,
            celebrateKind: ap.celebrateKind,
          });
        } else {
          ap.characterGfx.visible = false;
          const classicLift = bounce + moveJumpLift;
          const skidDirSign = Math.abs(ap.dirX) > 0.12 ? (ap.dirX >= 0 ? 1 : -1) : ap.facing;
          let skidScaleX = 1;
          let skidScaleY = 1;
          let skidLeanRad = 0;
          let skidShakeX = 0;
          let skidShakeY = 0;

          if (isRevving) {
            const vib = 1.1 + revProgress * 2.1;
            skidShakeX = Math.sin(nowMs * 0.095 + iIdx) * vib;
            skidShakeY = Math.cos(nowMs * 0.12) * vib * 0.45;
            skidScaleX = 1 + revProgress * 0.13;
            skidScaleY = 1 - revProgress * 0.11;
            // Coil back slightly before launching forward
            skidLeanRad = -skidDirSign * (0.09 + revProgress * 0.13);
          } else if (isMovingNow && diff > 0.02) {
            if (ap.turboSkidActive) {
              skidScaleX = 1.08;
              skidScaleY = 0.93;
              skidLeanRad = skidDirSign * 0.24;
              skidShakeY = Math.sin(ap.travelPhase * 1.8) * 0.6;
            } else {
              skidScaleX = 1.03;
              skidScaleY = 0.97;
              skidLeanRad = skidDirSign * 0.12;
            }
          }

          if (ap.sprite) {
            ap.sprite.visible = true;
            const tex = this.pawnTextures[pIdx];
            if (tex) {
              const targetW = ss * 0.88 * 0.8;
              const scale = targetW / tex.width;
              ap.sprite.scale.set(scale * skidScaleX, scale * skidScaleY);
              ap.sprite.x = skidShakeX;
              ap.sprite.y = -classicLift + skidShakeY;
              ap.sprite.rotation = skidLeanRad;
            }
          } else {
            ap.fallbackGfx.visible = true;
            ap.fallbackGfx.x = skidShakeX;
            ap.fallbackGfx.y = skidShakeY;
            ap.fallbackGfx.scale.set(skidScaleX, skidScaleY);
            ap.fallbackGfx.rotation = skidLeanRad;
            ap.fallbackGfx.clear();
            ap.fallbackGfx
              .poly([-8.8, 2 - classicLift, 8.8, 2 - classicLift, 5.6, -15.6 - classicLift, -5.6, -15.6 - classicLift])
              .fill(colorHex)
              .stroke({ width: 2, color: 0x0f172a })
              .circle(0, -19.6 - classicLift, 7.2)
              .fill(colorHex)
              .stroke({ width: 2, color: 0x0f172a });
          }
        }

        drawOrder.push({ pIdx, iIdx, pos: ap.displayPos, projY: proj.y, node: ap });
      }
    }

    this.updateAndDrawSmoke(delta);

    drawOrder.sort((a, b) => (a.projY !== b.projY ? a.projY - b.projY : b.pos - a.pos));
    drawOrder.forEach((item, idx) => {
      this.shadowLayer.setChildIndex(item.node.shadow, idx * 2);
      this.shadowLayer.setChildIndex(item.node.ring, idx * 2 + 1);
      this.pawnLayer.setChildIndex(item.node.container, idx);
    });

    for (let i = this.reactions.length - 1; i >= 0; i--) {
      const r = this.reactions[i];
      r.age += delta;
      r.node.x += r.vx * delta;
      r.node.y += r.vy * delta;
      r.vy += 0.03 * delta;
      r.node.alpha = Math.max(0, 1 - r.age / r.maxAge);
      if (r.age >= r.maxAge) {
        this.fxLayer.removeChild(r.node);
        r.node.destroy();
        this.reactions.splice(i, 1);
      }
    }

    this.speechBubbles.forEach((b, key) => {
      const base = this.getCenterOfBase(b.playerIdx);
      const center = this.worldToScreen(base.x, base.y);
      b.node.x = Math.max(132, Math.min(this.logicalW - 132, center.x));
      b.node.y = Math.max(115, Math.min(this.logicalH - 130, center.y - 54));
      b.age += delta;
      if (b.age > b.maxAge - 30) {
        b.node.alpha = Math.max(0, (b.maxAge - b.age) / 30);
      }
      if (b.age >= b.maxAge) {
        this.fxLayer.removeChild(b.node);
        b.node.destroy({ children: true });
        this.speechBubbles.delete(key);
      }
    });
  }

  public resize(logicalW?: number, logicalH?: number): void {
    if (!this.initialized || this.destroyed) return;
    const nextW = logicalW ?? this.logicalW;
    const nextH = logicalH ?? this.logicalH;
    if (
      nextW !== this.logicalW ||
      nextH !== this.logicalH ||
      this.app.screen.width !== nextW ||
      this.app.screen.height !== nextH
    ) {
      this.logicalW = nextW;
      this.logicalH = nextH;
      this.app.renderer.resize(nextW, nextH);
      const canvas = this.app.canvas as HTMLCanvasElement;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    }
    this.handleResize();
  }

  private spawnSmokeParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    size: number,
    grow: number,
    maxAge: number,
    alpha: number,
    color: number,
  ): void {
    if (this.smokeParticles.length >= 90) {
      this.smokeParticles.shift();
    }
    this.smokeParticles.push({ x, y, vx, vy, size, grow, age: 0, maxAge, alpha, color });
  }

  private updateAndDrawSmoke(delta: number): void {
    this.smokeGfx.clear();
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const sp = this.smokeParticles[i];
      sp.age += delta;
      if (sp.age >= sp.maxAge) {
        this.smokeParticles.splice(i, 1);
        continue;
      }
      sp.x += sp.vx * delta;
      sp.y += sp.vy * delta;
      const damp = Math.pow(0.92, delta);
      sp.vx *= damp;
      sp.vy *= damp;
      sp.size += sp.grow * delta;
      const life = sp.age / sp.maxAge;
      const fade = Math.sin(Math.min(1, life * 4) * (Math.PI / 2)) * (1 - life);
      const a = sp.alpha * fade;
      if (a > 0.01) {
        this.smokeGfx.circle(sp.x, sp.y, sp.size).fill({ color: sp.color, alpha: a });
      }
    }
  }

  public destroy(): void {
    this.destroyed = true;
    this.clearPendingTap();
    this.smokeParticles.length = 0;
    this.smokeGfx.clear();
    if (this.floorTexture) {
      this.floorTexture.destroy(true);
      this.floorTexture = null;
    }
    this.bgTextures.forEach((tex) => tex.destroy(true));
    this.bgTextures.clear();
    if (this.bgRenderTexture) {
      this.bgRenderTexture.destroy(true);
      this.bgRenderTexture = null;
    }
    this.bgOffscreenStage.destroy({ children: true });
    if (this.boardRenderTexture) {
      this.boardRenderTexture.destroy(true);
      this.boardRenderTexture = null;
    }
    this.boardOffscreenStage.destroy({ children: true });
    if (this.initialized) {
      this.app.destroy(true, { children: true });
    }
  }

  private emitNameplatePositionsIfChanged(rotRad: number): void {
    if (!this.callbacks.onNameplatesChange || this.plateMetas.length === 0) return;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);
    const cosPitch = Math.cos(this.getPitchRad());
    const next: NameplateScreenPos[] = this.plateMetas.map((meta) => {
      const bx = meta.baseCenter.x + meta.plateX * Math.cos(meta.totalRot);
      const by = meta.baseCenter.y + meta.plateX * Math.sin(meta.totalRot);
      const wx = bx * cosR - by * sinR;
      const wy = bx * sinR + by * cosR;
      const center = this.worldToScreen(wx, wy, 0);

      const alpha = meta.totalRot + rotRad + Math.PI / 2;
      const halfSpan = meta.plateW / 2;
      const tx = Math.cos(alpha) * halfSpan;
      const ty = Math.sin(alpha) * halfSpan;
      const leftPt = this.worldToScreen(wx - tx, wy - ty, 0);
      const rightPt = this.worldToScreen(wx + tx, wy + ty, 0);

      const dx = rightPt.x - leftPt.x;
      const dy = rightPt.y - leftPt.y;
      let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angleDeg > 90) angleDeg -= 180;
      if (angleDeg < -90) angleDeg += 180;

      const w = Math.hypot(dx, dy);
      const h = meta.plateH * this.boardAnchor.scale * center.persp * (0.85 + 0.15 * cosPitch);
      return {
        seatIdx: meta.seatIdx,
        x: Math.round(center.x * 10) / 10,
        y: Math.round(center.y * 10) / 10,
        w: Math.round(w * 10) / 10,
        h: Math.round(h * 10) / 10,
        angleDeg: Math.round(angleDeg * 10) / 10,
      };
    });

    const changed =
      this.lastEmittedPlates.length !== next.length ||
      next.some((p, idx) => {
        const prev = this.lastEmittedPlates[idx];
        return (
          !prev ||
          Math.abs(p.x - prev.x) >= 0.75 ||
          Math.abs(p.y - prev.y) >= 0.75 ||
          Math.abs(p.w - prev.w) >= 0.75 ||
          Math.abs(p.angleDeg - prev.angleDeg) >= 0.5
        );
      });

    if (changed) {
      this.lastEmittedPlates = next;
      this.callbacks.onNameplatesChange(next);
    }
  }
}
