import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import {
  BG_ASSET_URLS,
  BOARD_CONFIG,
  BOARD_THEMES,
  canMovePawn,
  DICE_STYLES,
  getPawnPath,
  getPlayerColor,
  isLoneTokenOnTrack,
  PAWN_ASSET_URLS,
  stripSeatTag,
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
  backgroundId: string;
  rotateBoard: boolean;
  cameraTilt: number;
  gameStarted: boolean;
  mySeat: number | null;
  isOnline: boolean;
}

interface AnimPawn {
  displayPos: number;
  renderX: number;
  renderY: number;
  initializedPos: boolean;
  container: Container;
  shadow: Graphics;
  ring: Graphics;
  sprite: Sprite | null;
  fallbackGfx: Graphics;
}

interface Dice3DAnim {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  vrx: number;
  vry: number;
  vrz: number;
  targetRX: number;
  targetRY: number;
  targetX: number;
  targetY: number;
  hoverOffset: number;
  hoverScale: number;
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

// Smoothly tessellated rounded polygon path for visibly curved 3D dice faces in WebGL
function drawRoundedPolygonPath(
  gfx: Graphics,
  points: Array<{ x: number; y: number }>,
  radius: number,
): void {
  if (points.length < 3) return;
  const steps = 6;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[(i + points.length - 1) % points.length];
    const p2 = points[i];
    const p3 = points[(i + 1) % points.length];

    const dx1 = p2.x - p1.x;
    const dy1 = p2.y - p1.y;
    const len1 = Math.hypot(dx1, dy1) || 1;

    const dx2 = p2.x - p3.x;
    const dy2 = p2.y - p3.y;
    const len2 = Math.hypot(dx2, dy2) || 1;

    const r = Math.min(radius, len1 * 0.4, len2 * 0.4);

    const x1 = p2.x - (dx1 / len1) * r;
    const y1 = p2.y - (dy1 / len1) * r;
    const x2 = p2.x - (dx2 / len2) * r;
    const y2 = p2.y - (dy2 / len2) * r;

    if (i === 0) gfx.moveTo(x1, y1);
    else gfx.lineTo(x1, y1);

    // Explicit quadratic Bezier sampling guarantees silky curved corners at every WebGL scale
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const omt = 1 - t;
      const qx = omt * omt * x1 + 2 * omt * t * p2.x + t * t * x2;
      const qy = omt * omt * y1 + 2 * omt * t * p2.y + t * t * y2;
      gfx.lineTo(qx, qy);
    }
  }
  gfx.closePath();
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

function createFloorGradientTexture(w: number, h: number, cx: number, cy: number): Texture {
  const cvs = document.createElement('canvas');
  cvs.width = Math.max(2, Math.round(w));
  cvs.height = Math.max(2, Math.round(h));
  const ctx = cvs.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h));
    grad.addColorStop(0, '#2c3e50');
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cvs.width, cvs.height);
  }
  return Texture.from(cvs);
}

export class LudoScene {
  private app: Application;
  private containerEl: HTMLElement;
  private callbacks: SceneCallbacks;
  private destroyed = false;
  private initialized = false;

  // Un-tilted base gradient + full-bleed theme backdrop behind everything
  private bgLayer = new Container();
  private floorSprite: Sprite | null = null;
  private floorTexture: Texture | null = null;
  private bgSprite: Sprite | null = null;
  private bgVeil: Graphics | null = null;

  // Tilted 3D Tabletop World (matches original ctx.scale(1, layout.tilt))
  private boardRoot = new Container();
  private boardSpinLayer = new Container();
  private boardStaticLayer = new Container();
  private homeLabelNode: Text | null = null;
  private pawnLayer = new Container();

  // Screen-space 3D Dice & Effects
  private diceLayer = new Container();
  private diceGfx = new Graphics();
  private fxLayer = new Container();

  private animPawns: AnimPawn[][] = [];
  private pawnTextures: Array<Texture | null> = [null, null, null, null, null];
  private bgTextures = new Map<string, Texture>();

  private snapshot: SceneSnapshot | null = null;
  private lastBoardKey = '';
  private lastBgKey = '';
  private rotationOffsetDeg = 0;
  private targetRotationDeg = 0;

  private logicalW = 1280;
  private logicalH = 720;
  private diceScale = 0.78;
  private diceAnchor = { x: 830, y: 608 };
  private boardAnchor = { x: 455, y: 366, scale: 1.09, tilt: 0.75 };

  private diceAnims: [Dice3DAnim, Dice3DAnim] = [
    this.makeDiceAnim(1, -43),
    this.makeDiceAnim(6, 43),
  ];
  private rollFramesLeft = 0;

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

  private makeDiceAnim(val: number, offsetX: number): Dice3DAnim {
    return {
      active: false,
      x: offsetX,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      vrx: 0,
      vry: 0,
      vrz: 0,
      targetRX: 0,
      targetRY: 0,
      targetX: offsetX,
      targetY: 0,
      hoverOffset: 0,
      hoverScale: 1,
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

    this.app.stage.addChild(this.bgLayer);
    this.app.stage.addChild(this.boardRoot);
    this.boardRoot.addChild(this.boardSpinLayer);
    this.boardSpinLayer.addChild(this.boardStaticLayer);
    this.boardRoot.addChild(this.pawnLayer);

    // Dice & FX live in screen space above the tilted board
    this.app.stage.addChild(this.diceLayer);
    this.diceLayer.addChild(this.diceGfx);
    this.diceLayer.eventMode = 'static';
    this.diceLayer.cursor = 'pointer';
    this.diceLayer.on('pointertap', () => this.callbacks.onDiceTap());

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
              ap.sprite.anchor.set(0.5, 0.85);
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

    Object.entries(BG_ASSET_URLS).forEach(async ([id, url]) => {
      try {
        const tex = await Assets.load<Texture>(url);
        if (!this.destroyed) {
          this.bgTextures.set(id, tex);
          this.lastBgKey = '';
        }
      } catch {}
    });
  }

  private createPawnNodes(): void {
    this.pawnLayer.removeChildren();
    this.animPawns = Array.from({ length: 5 }, (_, pIdx) =>
      Array.from({ length: 4 }, (_, iIdx) => {
        const container = new Container();
        container.eventMode = 'static';
        container.cursor = 'pointer';
        container.on('pointertap', (e) => {
          e.stopPropagation();
          this.callbacks.onPawnTap(pIdx, iIdx);
        });

        const ring = new Graphics();
        const shadow = new Graphics();
        shadow.ellipse(0, 4, 12, 6.4).fill({ color: 0x000000, alpha: 0.3 });
        const fallbackGfx = new Graphics();
        container.hitArea = {
          contains: (x: number, y: number) => x >= -20 && x <= 20 && y >= -36 && y <= 14,
        };

        container.addChild(ring);
        container.addChild(shadow);
        container.addChild(fallbackGfx);

        this.pawnLayer.addChild(container);
        return {
          displayPos: -1,
          renderX: 0,
          renderY: 0,
          initializedPos: false,
          container,
          shadow,
          ring,
          sprite: null,
          fallbackGfx,
        };
      }),
    );
  }

  public syncState(next: SceneSnapshot): void {
    const prevRolling = this.snapshot?.isRolling ?? false;
    this.snapshot = next;

    if (next.isRolling && !prevRolling) {
      this.startDiceRollAnim(next.dice);
    } else if (!next.isRolling) {
      const boardSpacing = 46 * this.diceScale;
      this.diceAnims.forEach((d, idx) => {
        const val = next.dice[idx] || 1;
        d.value = val;
        const targets = this.getDiceTargetAngles(val);
        d.targetRX = targets.rx;
        d.targetRY = targets.ry;
        d.targetX = this.boardAnchor.x + (idx === 0 ? -boardSpacing : boardSpacing);
        d.targetY = this.boardAnchor.y + (idx === 0 ? -boardSpacing / 2 : boardSpacing / 2);

        if (next.hasRolled) {
          // Keep rolled dice on the board until the turn passes (hasRolled becomes false)
          if (!d.active && this.rollFramesLeft <= 0) {
            d.x = d.targetX;
            d.y = d.targetY;
            d.z = 0;
          }
          d.active = true;
          if (this.rollFramesLeft <= 0) {
            d.rx = targets.rx;
            d.ry = targets.ry;
            d.rz = 0;
          }
        } else if (this.rollFramesLeft <= 0) {
          // Turn passed (or ready for bonus roll): return dice to resting anchor
          d.active = false;
        }
      });
    }

    if (next.rotateBoard) {
      // Bring active player's triangular base & upright nameplate cleanly to bottom center (+90°)
      this.targetRotationDeg = 144 - next.currentPlayer * 72;
    } else {
      this.targetRotationDeg = 0;
    }

    this.applyBoardTransform();
  }

  private worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: this.boardAnchor.x + wx * this.boardAnchor.scale,
      y: this.boardAnchor.y + wy * this.boardAnchor.scale * this.boardAnchor.tilt,
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

  private startDiceRollAnim(dice: [number, number]): void {
    // Launch from sides/bottom cleanly across the center of the board in both orientations (~0.2x slower)
    this.rollFramesLeft = 56;
    const isLandscape = this.logicalW > this.logicalH;
    const spacing = 46 * this.diceScale;
    const spreadX = isLandscape ? 200 : 140;
    const launchY = isLandscape ? 310 : 290;
    this.diceAnims.forEach((d, idx) => {
      const val = dice[idx] || 1;
      const targets = this.getDiceTargetAngles(val);
      d.active = true;
      d.value = val;
      d.x = this.boardAnchor.x + (idx === 0 ? -spreadX : spreadX);
      d.y = this.boardAnchor.y + launchY;
      d.z = 100;
      d.targetX = this.boardAnchor.x + (idx === 0 ? -spacing : spacing);
      d.targetY = this.boardAnchor.y + (idx === 0 ? -spacing / 2 : spacing / 2);
      d.vx = (d.targetX - d.x) / 56;
      d.vy = (d.targetY - d.y) / 56;
      d.vz = 4.2;
      d.rx = Math.random() * Math.PI * 2;
      d.ry = Math.random() * Math.PI * 2;
      d.rz = Math.random() * Math.PI * 2;
      d.vrx = (Math.random() - 0.5) * 0.4;
      d.vry = (Math.random() - 0.5) * 0.4;
      d.vrz = (Math.random() - 0.5) * 0.4;
      d.targetRX = targets.rx;
      d.targetRY = targets.ry;
    });
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
    const tilt = Math.max(0.35, Math.min(1.2, this.snapshot?.cameraTilt ?? 0.75));

    if (isLandscape) {
      // Exact non-clipping landscape layout (1280x720): board x=41..868, y=66..658
      this.boardAnchor = {
        x: w * (455 / 1280),
        y: h * (366 / 720),
        scale: Math.min(w / 1280, h / 720) * 1.09,
        tilt,
      };
      this.diceAnchor = {
        x: w * (830 / 1280),
        y: h * (608 / 720),
      };
      this.diceScale = 0.78;
    } else {
      // Portrait layout (720x1280) scaled 1.15x larger (0.91 * 1.15 = 1.0465) centered cleanly between title & ad-banner
      this.boardAnchor = {
        x: w * 0.5,
        y: h * (636 / 1280),
        scale: Math.min(w / 720, h / 1280) * 1.0465,
        tilt,
      };
      this.diceAnchor = {
        x: w * 0.5,
        y: h * (1212 / 1280),
      };
      this.diceScale = 0.78;
    }

    this.boardRoot.x = this.boardAnchor.x;
    this.boardRoot.y = this.boardAnchor.y;
    this.boardRoot.scale.set(this.boardAnchor.scale, this.boardAnchor.scale * this.boardAnchor.tilt);
  }

  private handleResize(): void {
    if (!this.initialized || this.destroyed) return;
    this.applyBoardTransform();
    const spacing = 46 * this.diceScale;
    this.diceAnims.forEach((d, idx) => {
      if (d.active) {
        d.targetX = this.boardAnchor.x + (idx === 0 ? -spacing : spacing);
        d.targetY = this.boardAnchor.y + (idx === 0 ? -spacing / 2 : spacing / 2);
      }
    });
    this.lastBgKey = '';
    this.lastEmittedPlates = [];
    this.renderBackground(this.logicalW, this.logicalH);
  }

  private renderBackground(w: number, h: number): void {
    if (!this.snapshot) return;
    const themeId = this.snapshot.isTournament
      ? this.snapshot.tournamentBoardThemeId
      : this.snapshot.boardThemeId;
    const theme = BOARD_THEMES[themeId] || BOARD_THEMES.classic;
    const bgId = this.snapshot.backgroundId !== 'none' ? this.snapshot.backgroundId : theme.bgId;
    const bgKey = `${bgId}:${w}:${h}:${this.snapshot.isTournament}:${Math.round(this.boardAnchor.x)}`;

    if (bgKey !== this.lastBgKey) {
      this.lastBgKey = bgKey;

      if (this.floorTexture) {
        this.floorTexture.destroy(true);
      }
      this.floorTexture = createFloorGradientTexture(w, h, this.boardAnchor.x, this.boardAnchor.y);
      if (!this.floorSprite) {
        this.floorSprite = new Sprite(this.floorTexture);
        this.bgLayer.addChildAt(this.floorSprite, 0);
      } else {
        this.floorSprite.texture = this.floorTexture;
      }
      this.floorSprite.width = w;
      this.floorSprite.height = h;

      const tex = bgId && bgId !== 'none' ? this.bgTextures.get(bgId) : null;
      if (tex) {
        if (!this.bgSprite) {
          this.bgSprite = new Sprite(tex);
          this.bgSprite.anchor.set(0.5);
          this.bgLayer.addChild(this.bgSprite);
        } else {
          this.bgSprite.texture = tex;
        }
        const scale = Math.max(w / tex.width, h / tex.height);
        this.bgSprite.scale.set(scale);
        this.bgSprite.x = w / 2;
        this.bgSprite.y = h / 2;
        this.bgSprite.alpha = 1.0;
        this.bgSprite.visible = true;

        if (!this.bgVeil) {
          this.bgVeil = new Graphics();
          this.bgLayer.addChild(this.bgVeil);
        }
        this.bgVeil.clear();
        this.bgVeil.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.2 });
        this.bgVeil.visible = true;
      } else {
        if (this.bgSprite) this.bgSprite.visible = false;
        if (this.bgVeil) this.bgVeil.visible = false;
      }
    }
  }

  private rebuildBoardGeometryIfNeeded(): void {
    if (!this.snapshot) return;
    const themeId = this.snapshot.isTournament
      ? this.snapshot.tournamentBoardThemeId || 'classic'
      : this.snapshot.boardThemeId || 'classic';
    const key = [
      themeId,
      this.snapshot.isTournament,
      this.snapshot.isOnline ? '1' : '0',
      this.snapshot.mySeat ?? 'none',
      this.snapshot.players.map((p) => `${p.name}:${p.isAI ? 1 : 0}`).join('|'),
    ].join('::');

    if (key === this.lastBoardKey) return;
    this.lastBoardKey = key;

    this.homeLabelNode = null;
    this.plateMetas = [];
    this.lastEmittedPlates = [];
    this.boardStaticLayer.removeChildren().forEach((c) => c.destroy({ children: true }));

    const theme = BOARD_THEMES[themeId] || BOARD_THEMES.classic;
    const trackColor = hexToNumber(theme.track);
    const safeColor = hexToNumber(theme.safe);
    const isNeonTournament = this.snapshot.isTournament && themeId !== 'classic';
    const borderColor = isNeonTournament ? 0xffffff : hexToNumber(theme.border);
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
          if (isNeonTournament) {
            tile.rect(-sw / 2 - 2, -sh / 2 - 2, sw + 4, sh + 4).stroke({
              width: 5,
              color: playerColorHex,
              alpha: 0.45,
              join: 'round',
            });
          }
          tile
            .rect(-sw / 2, -sh / 2, sw, sh)
            .fill(fillHex)
            .stroke({ width: 3, color: borderColor, join: 'round' });
          tile.x = pos.x;
          tile.y = pos.y;
          tile.rotation = armAngle;
          this.boardStaticLayer.addChild(tile);

          if (isSafe) {
            const star = new Text({
              text: '★',
              style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 36,
                fontWeight: '700',
                fill: '#000000',
                stroke: { color: '#ffffff', width: 4 },
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

      const baseCont = new Container();
      baseCont.x = baseCenter.x;
      baseCont.y = baseCenter.y;
      baseCont.rotation = totalRot;
      baseCont.eventMode = 'static';
      baseCont.cursor = 'pointer';
      baseCont.on('pointertap', () => this.callbacks.onBaseTap(i));

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

      const inset = 0.7;
      const innerTri = new Graphics();
      innerTri
        .poly([
          (baseHeight / 2) * inset,
          0,
          (-baseHeight / 2) * inset,
          (-baseWidth / 2) * inset,
          (-baseHeight / 2) * inset,
          (baseWidth / 2) * inset,
        ])
        .fill(this.snapshot.isTournament ? 0xffffff : trackColor)
        .stroke({ width: 3, color: borderColor, join: 'round' });
      baseCont.addChild(innerTri);

      const plateWidth = baseWidth * 0.95;
      const plateHeight = 40;
      const plateX = -baseHeight / 2 - plateHeight / 2 - 15;

      const plateWrap = new Container();
      plateWrap.x = plateX;
      plateWrap.y = 0;
      plateWrap.rotation = Math.PI / 2;
      plateWrap.eventMode = 'static';
      plateWrap.cursor = 'pointer';
      plateWrap.on('pointerdown', (e) => e.stopPropagation());
      plateWrap.on('pointertap', (e) => e.stopPropagation());

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
        .stroke({ width: 3, color: themeId === 'classic' ? 0x000000 : 0xffffff, join: 'round' });
      this.boardStaticLayer.addChild(wedge);
    }

    const homeLabel = new Text({
      text: 'HOME',
      style: {
        fontFamily: 'Fredoka, sans-serif',
        fontSize: 28,
        fontWeight: '700',
        fill: themeId === 'neon' ? '#ffffff' : theme.homeText,
        dropShadow: { color: '#000000', alpha: 0.75, blur: 5, distance: 1 },
      },
    });
    homeLabel.anchor.set(0.5);
    homeLabel.rotation = -(this.rotationOffsetDeg * Math.PI) / 180;
    this.homeLabelNode = homeLabel;
    this.boardStaticLayer.addChild(homeLabel);
  }

  private drawDice3D(): void {
    if (!this.snapshot) return;
    this.diceGfx.clear();

    const style = DICE_STYLES[this.snapshot.diceStyle] || DICE_STYLES.classic;
    const dotHex = hexToNumber(style.dot);
    const borderHex = hexToNumber(style.border);
    const glowHex = style.glow ? hexToNumber(style.glow) : null;
    const ds = this.diceScale;

    this.diceAnims.forEach((d, idx) => {
      const spacing = 60 * ds;
      const restX = this.diceAnchor.x + (idx === 0 ? -spacing : spacing);
      const restY = this.diceAnchor.y;

      const drawX = d.active ? d.x : restX;
      const drawY = d.active ? d.y : restY;
      const drawZ = d.active ? d.z : 0;
      const rx = d.active ? d.rx : this.snapshot!.hasRolled ? d.targetRX : 0;
      const ry = d.active ? d.ry : this.snapshot!.hasRolled ? d.targetRY : 0;
      const rz = d.active ? d.rz : 0;

      const hoverScale = d.hoverScale || 1;
      const hoverZ = d.hoverOffset || 0;

      // Ground shadow matching original drawDice()
      const shadowSize = 30 * ds * hoverScale * (1 + (drawZ + hoverZ) / (150 * ds));
      const shadowAlpha = Math.max(0.06, 0.3 - (drawZ + hoverZ) / (400 * ds));
      this.diceGfx.ellipse(drawX, drawY + 5, shadowSize, shadowSize * 0.6).fill({
        color: 0x000000,
        alpha: shadowAlpha,
      });

      const size = 30 * ds * hoverScale;
      const verts = CUBE_VERTICES.map((v) =>
        rotate3D({ x: v.x * size, y: v.y * size, z: v.z * size }, rx, ry, rz),
      );

      const facesWithDepth = CUBE_FACES.map((f) => {
        const v0 = verts[f.indices[0]];
        const v1 = verts[f.indices[1]];
        const v2 = verts[f.indices[2]];
        // Outward face normal Z component; positive means facing toward camera
        const nz = (v1.x - v0.x) * (v2.y - v0.y) - (v1.y - v0.y) * (v2.x - v0.x);
        const avgZ = f.indices.reduce((sum, i) => sum + verts[i].z, 0) / 4;
        return { ...f, avgZ, nz };
      })
        .filter((f) => f.nz > 1e-2)
        .sort((a, b) => a.avgZ - b.avgZ);

      const screenY = drawY - (drawZ + hoverZ);
      // Generous rounded corner radius (~28% of face width) for unmistakable smooth curved dice corners
      const cornerRadius = 11.5 * ds * hoverScale;

      // Subtle rounded backing body while tumbling multi-face angles so seams between curved faces stay solid
      if (facesWithDepth.length > 1) {
        const bodyHex = rgbToHexNumber(style.face[0] * 0.78, style.face[1] * 0.78, style.face[2] * 0.78);
        this.diceGfx.circle(drawX, screenY, size * 0.92).fill(bodyHex);
      }

      facesWithDepth.forEach((f) => {
        const pts = f.indices.map((vi) => ({
          x: drawX + verts[vi].x,
          y: screenY + verts[vi].y,
        }));

        // Bright face shading matching original (1.0 + avgZ / (size * 4))
        const shade = 1.0 + f.avgZ / (size * 4);
        const faceHex = rgbToHexNumber(
          style.face[0] * shade,
          style.face[1] * shade,
          style.face[2] * shade,
        );

        if (glowHex !== null && f.avgZ > 0) {
          drawRoundedPolygonPath(this.diceGfx, pts, cornerRadius);
          this.diceGfx.stroke({
            width: d.active && this.snapshot!.isRolling ? 6 : 4,
            color: glowHex,
            alpha: 0.35,
          });
        }

        drawRoundedPolygonPath(this.diceGfx, pts, cornerRadius);
        this.diceGfx.fill(faceHex).stroke({ width: 1.8, color: borderHex });

        if (f.avgZ > 0) {
          this.drawDiePips(f.value, verts, f.indices, drawX, screenY, dotHex, ds * hoverScale);
        }
      });
    });

    const readyToRoll = !this.snapshot.hasRolled && !this.snapshot.isRolling;
    this.diceLayer.eventMode = readyToRoll ? 'static' : 'none';
    this.diceLayer.cursor = readyToRoll ? 'pointer' : 'default';
    this.diceLayer.hitArea = {
      contains: (x: number, y: number) =>
        readyToRoll && Math.hypot(x - this.diceAnchor.x, y - this.diceAnchor.y) < 120,
    };
  }

  private drawDiePips(
    value: number,
    verts: Array<{ x: number; y: number }>,
    indices: number[],
    ox: number,
    oy: number,
    dotHex: number,
    scale: number,
  ): void {
    let cx = 0;
    let cy = 0;
    indices.forEach((i) => {
      cx += verts[i].x;
      cy += verts[i].y;
    });
    cx /= 4;
    cy /= 4;

    const v0 = verts[indices[0]];
    const v1 = verts[indices[1]];
    const v3 = verts[indices[3]];
    const ux = (v1.x - v0.x) / 2;
    const uy = (v1.y - v0.y) / 2;
    const vx = (v3.x - v0.x) / 2;
    const vy = (v3.y - v0.y) / 2;
    const dotRadius = 4.4 * scale;

    const dot = (px: number, py: number) => {
      const dx = ox + cx + px * ux + py * vx;
      const dy = oy + cy + px * uy + py * vy;
      this.diceGfx.circle(dx, dy, dotRadius).fill(dotHex);
      this.diceGfx
        .circle(dx - dotRadius * 0.28, dy - dotRadius * 0.28, dotRadius * 0.35)
        .fill({ color: 0xffffff, alpha: 0.16 });
    };

    if (value === 1) dot(0, 0);
    if (value === 2) {
      dot(-0.5, -0.5);
      dot(0.5, 0.5);
    }
    if (value === 3) {
      dot(-0.5, -0.5);
      dot(0, 0);
      dot(0.5, 0.5);
    }
    if (value === 4) {
      dot(-0.5, -0.5);
      dot(0.5, -0.5);
      dot(-0.5, 0.5);
      dot(0.5, 0.5);
    }
    if (value === 5) {
      dot(-0.5, -0.5);
      dot(0.5, -0.5);
      dot(-0.5, 0.5);
      dot(0.5, 0.5);
      dot(0, 0);
    }
    if (value === 6) {
      dot(-0.5, -0.5);
      dot(0.5, -0.5);
      dot(-0.5, 0.5);
      dot(0.5, 0.5);
      dot(-0.5, 0);
      dot(0.5, 0);
    }
  }

  private updateFrame(delta: number): void {
    if (!this.snapshot || this.destroyed) return;

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

    this.boardSpinLayer.rotation = rotRad;
    if (this.homeLabelNode) {
      this.homeLabelNode.rotation = -rotRad;
    }
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

    if (this.rollFramesLeft > 0) {
      this.rollFramesLeft--;
      this.diceAnims.forEach((d) => {
        d.x += d.vx * delta;
        d.y += d.vy * delta;
        d.z += d.vz * delta;
        d.vz -= 0.36 * delta;
        if (d.z < 0) {
          d.z = 0;
          d.vz = Math.abs(d.vz) * 0.45;
        }
        d.rx += d.vrx * delta;
        d.ry += d.vry * delta;
        d.rz += d.vrz * delta;
        if (this.rollFramesLeft < 24) {
          const t = 0.13;
          d.rx += (d.targetRX - d.rx) * t;
          d.ry += (d.targetRY - d.ry) * t;
          d.rz += (0 - d.rz) * t;
          d.x += (d.targetX - d.x) * t;
          d.y += (d.targetY - d.y) * t;
        }
      });
    } else {
      const keepOnBoard = this.snapshot.hasRolled || this.snapshot.isRolling;
      this.diceAnims.forEach((d, idx) => {
        if (d.active) {
          d.rx += (d.targetRX - d.rx) * 0.2;
          d.ry += (d.targetRY - d.ry) * 0.2;
          d.rz += (0 - d.rz) * 0.2;
          d.z *= 0.82;
          d.x += (d.targetX - d.x) * 0.2;
          d.y += (d.targetY - d.y) * 0.2;
          if (!keepOnBoard && Math.abs(d.z) < 0.3 && Math.abs(d.rx - d.targetRX) < 0.02) {
            d.active = false;
          }
        }
        const dieUnused = isSelectable && remainDiceFlags[idx];
        const activeIdx =
          this.snapshot!.movesAvailable.length === 1
            ? remainDiceFlags[0]
              ? 0
              : remainDiceFlags[1]
                ? 1
                : -1
            : this.snapshot!.selectedDieIndex;
        const isSelected = dieUnused && activeIdx === idx;
        const targetOff = isSelected ? 22 : dieUnused ? 10 : 0;
        const targetScale = isSelected ? 1.14 : dieUnused ? 1.06 : 1;
        d.hoverOffset += (targetOff - d.hoverOffset) * 0.14;
        d.hoverScale += (targetScale - d.hoverScale) * 0.14;
      });
    }
    this.drawDice3D();

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

    const drawOrder: Array<{ pIdx: number; iIdx: number; pos: number; node: AnimPawn }> = [];

    for (let pIdx = 0; pIdx < 5; pIdx++) {
      const path = getPawnPath(pIdx);
      const colorHex = this.getPlayerColorHex(pIdx);
      const isLone = isLoneTokenOnTrack(this.snapshot.pawns, pIdx);
      const combinedSteps = this.snapshot.movesAvailable.reduce((a, b) => a + Number(b), 0);

      for (let iIdx = 0; iIdx < 4; iIdx++) {
        const pawn = this.snapshot.pawns[pIdx][iIdx];
        const ap = this.animPawns[pIdx][iIdx];
        const diff = pawn.pos - ap.displayPos;
        if (Math.abs(diff) > 0.01) {
          ap.displayPos += diff > 0 ? Math.min(diff, 0.175 * delta) : Math.max(diff, -0.36 * delta);
        } else {
          ap.displayPos = pawn.pos;
        }

        let target: { x: number; y: number };
        if (ap.displayPos < 0) {
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

        if (!ap.initializedPos) {
          ap.renderX = target.x + stackX;
          ap.renderY = target.y + stackY;
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
          }
          const lerpAmt = Math.min(1, 0.2 * delta);
          ap.renderX += (target.x + stackX - ap.renderX) * lerpAmt;
          ap.renderY += (target.y + stackY - ap.renderY) * lerpAmt;
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

        const bounce = isMovable ? Math.abs(Math.sin(nowMs / 150)) * 22 : 0;

        ap.container.x = ap.renderX;
        ap.container.y = ap.renderY;

        ap.ring.clear();
        if (isMovable) {
          const pulseR = (ss * 0.58 + Math.sin(nowMs / 200) * 5) * 0.8;
          ap.ring.ellipse(0, 4, pulseR, pulseR * 0.6).stroke({ width: 3, color: 0xffffff });
        }

        if (ap.sprite) {
          const tex = this.pawnTextures[pIdx];
          if (tex) {
            // 0.8x token scale matching exact board proportions
            const targetW = ss * 0.88 * 0.8;
            const scale = targetW / tex.width;
            ap.sprite.scale.set(scale, scale);
            ap.sprite.y = 6.4 - bounce;
          }
        } else {
          ap.fallbackGfx.clear();
          ap.fallbackGfx
            .poly([-8.8, 6.4 - bounce, 8.8, 6.4 - bounce, 5.6, -11.2 - bounce, -5.6, -11.2 - bounce])
            .fill(colorHex)
            .stroke({ width: 2, color: 0x0f172a })
            .circle(0, -15.2 - bounce, 7.2)
            .fill(colorHex)
            .stroke({ width: 2, color: 0x0f172a });
        }

        drawOrder.push({ pIdx, iIdx, pos: ap.displayPos, node: ap });
      }
    }

    drawOrder.sort((a, b) => b.pos - a.pos);
    drawOrder.forEach((item, idx) => {
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

  public destroy(): void {
    this.destroyed = true;
    if (this.floorTexture) {
      this.floorTexture.destroy(true);
      this.floorTexture = null;
    }
    if (this.initialized) {
      this.app.destroy(true, { children: true });
    }
  }

  private emitNameplatePositionsIfChanged(rotRad: number): void {
    if (!this.callbacks.onNameplatesChange || this.plateMetas.length === 0) return;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);
    const next: NameplateScreenPos[] = this.plateMetas.map((meta) => {
      const bx = meta.baseCenter.x + meta.plateX * Math.cos(meta.totalRot);
      const by = meta.baseCenter.y + meta.plateX * Math.sin(meta.totalRot);
      const wx = bx * cosR - by * sinR;
      const wy = bx * sinR + by * cosR;
      const screen = this.worldToScreen(wx, wy);

      const alpha = meta.totalRot + rotRad + Math.PI / 2;
      const vx = Math.cos(alpha);
      const vy = Math.sin(alpha) * this.boardAnchor.tilt;
      let angleDeg = (Math.atan2(vy, vx) * 180) / Math.PI;
      if (angleDeg > 90) angleDeg -= 180;
      if (angleDeg < -90) angleDeg += 180;

      const w = meta.plateW * this.boardAnchor.scale * Math.hypot(vx, vy);
      const h = meta.plateH * this.boardAnchor.scale * (0.85 + 0.15 * this.boardAnchor.tilt);
      return {
        seatIdx: meta.seatIdx,
        x: Math.round(screen.x * 10) / 10,
        y: Math.round(screen.y * 10) / 10,
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
