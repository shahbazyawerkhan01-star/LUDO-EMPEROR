import { Texture } from 'pixi.js';
import type { EnvironmentId } from './rules';

interface ClassicBgPalette {
  sky: [string, string, string];
  floor: [string, string, string];
  accent: string;
  subtle: string;
}

const CLASSIC_PALETTES: Record<EnvironmentId, ClassicBgPalette> = {
  none: {
    sky: ['#1f2430', '#11151d', '#06080c'],
    floor: ['#191e28', '#10141c', '#07090d'],
    accent: 'rgba(255, 255, 255, 0.08)',
    subtle: 'rgba(255, 255, 255, 0.04)',
  },
  bg_led_display: {
    sky: ['#152547', '#0a1226', '#04060e'],
    floor: ['#0e1a36', '#070d1d', '#03050b'],
    accent: 'rgba(56, 189, 248, 0.22)',
    subtle: 'rgba(56, 189, 248, 0.09)',
  },
  bg_wood_table: {
    sky: ['#3b2416', '#1f120b', '#0d0704'],
    floor: ['#4a2d1b', '#2b190f', '#120a06'],
    accent: 'rgba(245, 158, 11, 0.14)',
    subtle: 'rgba(0, 0, 0, 0.22)',
  },
  bg_royal_velvet: {
    sky: ['#3d1022', '#1d0710', '#0a0206'],
    floor: ['#4b1228', '#260814', '#0e0308'],
    accent: 'rgba(241, 196, 15, 0.18)',
    subtle: 'rgba(241, 196, 15, 0.06)',
  },
  bg_marble_hall: {
    sky: ['#2e3138', '#181a1f', '#0a0b0e'],
    floor: ['#363940', '#1d2026', '#0c0d10'],
    accent: 'rgba(226, 232, 240, 0.14)',
    subtle: 'rgba(255, 255, 255, 0.05)',
  },
  bg_neon_cyber: {
    sky: ['#261242', '#100824', '#05020d'],
    floor: ['#1b0c33', '#0c061c', '#04020a'],
    accent: 'rgba(232, 121, 249, 0.2)',
    subtle: 'rgba(34, 211, 238, 0.12)',
  },
  bg_golden_palace: {
    sky: ['#3b2c12', '#1d1507', '#0b0803'],
    floor: ['#463314', '#241a09', '#0d0903'],
    accent: 'rgba(250, 204, 21, 0.22)',
    subtle: 'rgba(250, 204, 21, 0.08)',
  },
};

export function createEnvironmentSkyTexture(
  envId: EnvironmentId,
  w: number,
  h: number,
  anchorX: number,
  anchorY: number,
): Texture {
  const cvs = document.createElement('canvas');
  cvs.width = Math.max(2, Math.floor(w));
  cvs.height = Math.max(2, Math.floor(h));
  const ctx = cvs.getContext('2d');
  if (!ctx) return Texture.from(cvs);

  const pal = CLASSIC_PALETTES[envId] || CLASSIC_PALETTES.none;
  const maxR = Math.max(w, h) * 0.92;
  const grad = ctx.createRadialGradient(anchorX, anchorY * 0.72, 28, anchorX, anchorY * 0.85, maxR);
  grad.addColorStop(0, pal.sky[0]);
  grad.addColorStop(0.55, pal.sky[1]);
  grad.addColorStop(1, pal.sky[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  return Texture.from(cvs);
}

export function createEnvironmentFloorTexture(envId: EnvironmentId, size = 1024): Texture {
  const half = size / 2;
  const cvs = document.createElement('canvas');
  cvs.width = size;
  cvs.height = size;
  const ctx = cvs.getContext('2d');
  if (!ctx) return Texture.from(cvs);

  const pal = CLASSIC_PALETTES[envId] || CLASSIC_PALETTES.none;
  const grad = ctx.createRadialGradient(half, half, 70, half, half, half * 1.02);
  grad.addColorStop(0, pal.floor[0]);
  grad.addColorStop(0.58, pal.floor[1]);
  grad.addColorStop(1, pal.floor[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  if (envId === 'bg_led_display') {
    ctx.strokeStyle = pal.subtle;
    ctx.lineWidth = 1.5;
    for (let p = 32; p < size; p += 48) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }
    for (let r = 210; r <= 430; r += 55) {
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(half, half, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (envId === 'bg_wood_table') {
    ctx.strokeStyle = pal.subtle;
    ctx.lineWidth = 2.2;
    for (let y = 12; y < size; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.35, y + Math.sin(y) * 6, size * 0.65, y - Math.cos(y) * 6, size, y);
      ctx.stroke();
    }
  } else if (envId === 'bg_neon_cyber') {
    ctx.strokeStyle = pal.subtle;
    ctx.lineWidth = 1.6;
    for (let p = 0; p < size; p += 64) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }
  } else if (envId === 'bg_marble_hall') {
    ctx.strokeStyle = pal.subtle;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 14; i++) {
      const y0 = i * 76;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.bezierCurveTo(size * 0.3, y0 + 28, size * 0.7, y0 - 24, size, y0 + 18);
      ctx.stroke();
    }
  } else if (envId === 'bg_royal_velvet' || envId === 'bg_golden_palace') {
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(half, half, 232, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(half, half, 246, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Soft center spotlight under board
  const halo = ctx.createRadialGradient(half, half, 90, half, half, 300);
  halo.addColorStop(0, 'rgba(255, 255, 255, 0.07)');
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(half, half, 300, 0, Math.PI * 2);
  ctx.fill();

  return Texture.from(cvs);
}
