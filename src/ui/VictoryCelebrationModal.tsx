import React, { useEffect, useRef, useState } from 'react';
import { getPlayerColor, stripSeatTag } from '../game/rules';
import { multiplayerClient } from '../network/multiplayerClient';
import { useGameStore } from '../state/store';

interface FireworksCanvasProps {
  accentHex: string;
  onSpawnCount?: (count: number) => void;
}

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY: number;
  color: string;
  secondaryColor: string;
  pattern: 'chrysanthemum' | 'ring' | 'willow' | 'starburst';
  trail: Array<{ x: number; y: number }>;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  prevX: number;
  prevY: number;
  color: string;
  size: number;
  alpha: number;
  decay: number;
  gravity: number;
  drag: number;
  twinkle: boolean;
  glitter: boolean;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
}

const CELEBRATION_PALETTE = [
  '#f1c40f', // Royal Gold
  '#ff4757', // Crimson Burst
  '#00d4ff', // Electric Cyan
  '#2ecc71', // Emerald Spark
  '#ff9f43', // Solar Amber
  '#c084fc', // Imperial Violet
  '#ffffff', // Diamond White
];

const FireworksCanvas: React.FC<FireworksCanvasProps> = ({ accentHex }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spawnBurstAtRef = useRef<((x: number, y: number) => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let logicalW = canvas.parentElement?.clientWidth || 720;
    let logicalH = canvas.parentElement?.clientHeight || 1280;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const parent = canvas.parentElement;
      logicalW = Math.max(320, parent?.clientWidth || 720);
      logicalH = Math.max(320, parent?.clientHeight || 1280);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(logicalW * dpr);
      canvas.height = Math.round(logicalH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      ro = new ResizeObserver(resize);
      ro.observe(canvas.parentElement);
    }

    const palette = [accentHex || '#f1c40f', '#f1c40f', ...CELEBRATION_PALETTE];
    const rockets: Rocket[] = [];
    const sparks: Spark[] = [];
    const shockwaves: Shockwave[] = [];

    const pickColor = (preferAccent = false): string => {
      if (preferAccent && Math.random() < 0.45) return accentHex || '#f1c40f';
      return palette[Math.floor(Math.random() * palette.length)];
    };

    const detonate = (
      x: number,
      y: number,
      primary: string,
      secondary: string,
      pattern: Rocket['pattern'],
      scale = 1,
    ) => {
      shockwaves.push({
        x,
        y,
        radius: 6,
        maxRadius: (pattern === 'ring' ? 95 : 70) * scale,
        color: primary,
        alpha: 0.72,
      });

      if (pattern === 'ring') {
        const outerCount = Math.round(44 * scale);
        const innerCount = Math.round(24 * scale);
        for (let i = 0; i < outerCount; i++) {
          const angle = (Math.PI * 2 * i) / outerCount + (Math.random() - 0.5) * 0.04;
          const speed = (225 + Math.random() * 25) * scale;
          sparks.push({
            x,
            y,
            prevX: x,
            prevY: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: i % 2 === 0 ? primary : '#ffffff',
            size: 2.5,
            alpha: 1,
            decay: 0.68 + Math.random() * 0.25,
            gravity: 95,
            drag: 0.96,
            twinkle: true,
            glitter: false,
          });
        }
        for (let i = 0; i < innerCount; i++) {
          const angle = (Math.PI * 2 * i) / innerCount;
          const speed = (120 + Math.random() * 20) * scale;
          sparks.push({
            x,
            y,
            prevX: x,
            prevY: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: secondary,
            size: 2.2,
            alpha: 1,
            decay: 0.8 + Math.random() * 0.25,
            gravity: 80,
            drag: 0.955,
            twinkle: false,
            glitter: true,
          });
        }
        return;
      }

      if (pattern === 'willow') {
        const count = Math.round(62 * scale);
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (80 + Math.random() * 210) * scale;
          sparks.push({
            x,
            y,
            prevX: x,
            prevY: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 20,
            color: i % 3 === 0 ? primary : '#ffd866',
            size: 2.2,
            alpha: 1,
            decay: 0.42 + Math.random() * 0.22,
            gravity: 165,
            drag: 0.945,
            twinkle: true,
            glitter: true,
          });
        }
        return;
      }

      const count = Math.round((pattern === 'starburst' ? 76 : 58) * scale);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (75 + Math.random() * 245) * scale;
        sparks.push({
          x,
          y,
          prevX: x,
          prevY: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: Math.random() < 0.68 ? primary : secondary,
          size: 1.8 + Math.random() * 1.9,
          alpha: 1,
          decay: 0.58 + Math.random() * 0.38,
          gravity: 120,
          drag: 0.952,
          twinkle: Math.random() < 0.55,
          glitter: Math.random() < 0.35,
        });
      }
    };

    const launchRocket = (targetX?: number, targetY?: number) => {
      const startX =
        targetX !== undefined
          ? Math.max(40, Math.min(logicalW - 40, targetX + (Math.random() - 0.5) * 30))
          : logicalW * (0.12 + Math.random() * 0.76);
      const destY =
        targetY !== undefined
          ? Math.max(logicalH * 0.08, Math.min(logicalH * 0.72, targetY))
          : logicalH * (0.12 + Math.random() * 0.36);

      const patterns: Rocket['pattern'][] = ['chrysanthemum', 'ring', 'willow', 'starburst'];
      const pattern = patterns[Math.floor(Math.random() * patterns.length)];
      const dy = Math.max(140, logicalH - destY);
      const flightSec = 0.55 + Math.random() * 0.25;
      const vx = ((targetX ?? startX) - startX) / flightSec + (Math.random() - 0.5) * 45;
      const vy = -(dy / flightSec) - 120;

      rockets.push({
        x: startX,
        y: logicalH + 8,
        vx,
        vy,
        targetY: destY,
        color: pickColor(true),
        secondaryColor: pickColor(false),
        pattern,
        trail: [],
      });
    };

    spawnBurstAtRef.current = (x: number, y: number) => {
      const patterns: Rocket['pattern'][] = ['ring', 'starburst', 'chrysanthemum', 'willow'];
      const p = patterns[Math.floor(Math.random() * patterns.length)];
      detonate(x, y, pickColor(true), pickColor(false), p, 1.15);
    };

    // Grand opening celebratory salvo
    const openingTimers: number[] = [];
    [0, 140, 290, 480, 720, 960].forEach((delay, idx) => {
      const id = window.setTimeout(() => {
        const laneX = logicalW * (0.16 + ((idx * 0.14) % 0.68));
        const apexY = logicalH * (0.14 + (idx % 3) * 0.09);
        launchRocket(laneX, apexY);
      }, delay);
      openingTimers.push(id);
    });

    let launchCooldown = 0.65;
    let lastTs = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.045, Math.max(0.004, (now - lastTs) / 1000));
      lastTs = now;

      // Soft transparent trail fade so board & royal backdrop remain visible underneath
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, logicalW, logicalH);

      ctx.globalCompositeOperation = 'lighter';

      launchCooldown -= dt;
      if (launchCooldown <= 0) {
        launchRocket();
        if (Math.random() < 0.35) launchRocket();
        launchCooldown = 0.45 + Math.random() * 0.5;
      }

      // Update & render rising rockets
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > 8) r.trail.shift();

        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.vy += 260 * dt;

        // Draw rocket tail
        if (r.trail.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(r.trail[0].x, r.trail[0].y);
          for (let t = 1; t < r.trail.length; t++) {
            ctx.lineTo(r.trail[t].x, r.trail[t].y);
          }
          ctx.lineTo(r.x, r.y);
          ctx.strokeStyle = r.color;
          ctx.lineWidth = 2.4;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(r.x, r.y, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        if (r.y <= r.targetY || r.vy >= -30) {
          detonate(r.x, r.y, r.color, r.secondaryColor, r.pattern, 1);
          rockets.splice(i, 1);
        }
      }

      // Update & render burst shockwaves
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.radius += (sw.maxRadius - sw.radius) * Math.min(1, dt * 8.5);
        sw.alpha -= dt * 1.9;
        if (sw.alpha <= 0.02) {
          shockwaves.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = Math.max(0, sw.alpha * 0.45);
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // Update & render burst sparks
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.prevX = s.x;
        s.prevY = s.y;

        const dragFactor = Math.pow(s.drag, dt * 60);
        s.vx *= dragFactor;
        s.vy = s.vy * dragFactor + s.gravity * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.alpha -= s.decay * dt;

        if (s.alpha <= 0.02) {
          sparks.splice(i, 1);
          continue;
        }

        const flicker = s.twinkle ? 0.55 + 0.45 * Math.sin(now * 0.03 + i) : 1;
        const drawAlpha = Math.max(0, Math.min(1, s.alpha * flicker));

        ctx.save();
        ctx.globalAlpha = drawAlpha;
        ctx.beginPath();
        ctx.moveTo(s.prevX, s.prevY);
        ctx.lineTo(s.x, s.y);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.size;
        ctx.lineCap = 'round';
        ctx.stroke();

        if (s.glitter && Math.random() < 0.35) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size * 0.9, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
        ctx.restore();
      }

      // Cap extreme burst spam safely
      if (sparks.length > 900) {
        sparks.splice(0, sparks.length - 900);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      openingTimers.forEach((id) => clearTimeout(id));
      ro?.disconnect();
    };
  }, [accentHex]);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !spawnBurstAtRef.current) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const logicalW = canvas.parentElement?.clientWidth || rect.width;
    const logicalH = canvas.parentElement?.clientHeight || rect.height;
    const x = ((e.clientX - rect.left) / rect.width) * logicalW;
    const y = ((e.clientY - rect.top) / rect.height) * logicalH;
    spawnBurstAtRef.current(x, y);
  };

  return (
    <canvas
      id="victory-fireworks-canvas"
      ref={canvasRef}
      onPointerDown={handleCanvasPointerDown}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
        zIndex: 1,
      }}
    />
  );
};

function formatOrdinalPosition(rank: number): string {
  if (rank === 1) return '1st Place';
  if (rank === 2) return '2nd Place';
  if (rank === 3) return '3rd Place';
  return `${rank}th Place`;
}

export const VictoryCelebrationModal: React.FC = () => {
  const {
    winner,
    rankings,
    players,
    winStats,
    isTournament,
    isOnline,
    mySeat,
    startLocalMatch,
    exitMatchToMenu,
  } = useGameStore();

  const [fireworksOnly, setFireworksOnly] = useState(false);

  const winnerColor = winner !== null ? getPlayerColor(winner, isTournament) : '#f1c40f';
  const winnerName =
    winner !== null
      ? stripSeatTag(players[winner]?.name || rankings[0]?.name || 'Player')
      : stripSeatTag(rankings[0]?.name || 'Player');

  const soloHumanSeat = !isOnline
    ? (() => {
        const humans = players.map((p, i) => ({ p, i })).filter((x) => !x.p.isAI);
        return humans.length === 1 ? humans[0].i : null;
      })()
    : null;
  const focusSeat = isOnline ? mySeat : soloHumanSeat;
  const myRanking =
    focusSeat !== null ? rankings.find((r) => r.seat === focusSeat) || null : null;

  const podiumFirst = rankings.find((r) => r.rank === 1) || rankings[0] || null;
  const podiumSecond = rankings.find((r) => r.rank === 2) || rankings[1] || null;
  const podiumThird = rankings.find((r) => r.rank === 3) || rankings[2] || null;

  const handleMainMenu = () => {
    if (isOnline) {
      multiplayerClient.disconnectAndReset();
    } else {
      exitMatchToMenu();
    }
  };

  return (
    <div
      id="victory-celebration-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 4000,
        display: 'flex',
        alignItems: fireworksOnly ? 'flex-end' : 'center',
        justifyContent: 'center',
        background: fireworksOnly ? 'rgba(4, 6, 14, 0.28)' : 'rgba(4, 6, 14, 0.62)',
        backdropFilter: fireworksOnly ? 'none' : 'blur(4px)',
        padding: '16px',
        transition: 'background 0.25s ease',
      }}
    >
      <FireworksCanvas accentHex={winnerColor} />

      <div
        className="pointer-events-none absolute top-3 right-3 z-[2] rounded-full border border-[#f1c40f]/40 bg-black/55 px-3 py-1 font-display text-[11px] font-bold text-[#f1c40f]"
      >
        🎆 Tap sky for extra fireworks
      </div>

      {fireworksOnly ? (
        <div
          className="relative z-[3] mb-3 flex w-full max-w-[560px] flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-[#f1c40f]/80 bg-black/80 px-4 py-3 shadow-2xl backdrop-blur-md"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🏆</span>
            <div>
              <div className="font-display text-sm font-bold text-[#f1c40f]">
                {winnerName} — #1 Champion
              </div>
              {myRanking && (
                <div className="text-[11px] font-semibold text-white/80">
                  Your Position: #{myRanking.rank} ({formatOrdinalPosition(myRanking.rank)} • {myRanking.percentage}%)
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFireworksOnly(false)}
              className="cursor-pointer rounded-xl border border-[#f1c40f]/60 bg-[#f1c40f]/20 px-3 py-2 font-display text-xs font-bold text-[#f1c40f] hover:bg-[#f1c40f]/30"
            >
              📊 Rankings
            </button>
            <button
              type="button"
              onClick={handleMainMenu}
              className="cursor-pointer rounded-xl border border-white/25 bg-white/10 px-3 py-2 font-display text-xs font-bold text-white"
            >
              MENU
            </button>
            {!isOnline && (
              <button
                type="button"
                onClick={() => startLocalMatch(isTournament)}
                className="cursor-pointer rounded-xl bg-[#27ae60] px-3 py-2 font-display text-xs font-bold text-white"
              >
                PLAY AGAIN
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          className="royal-modal-card modal-scroll relative z-[3] w-full max-w-[520px] max-h-[92%] space-y-3 overflow-y-auto"
          style={{
            background: 'rgba(8, 10, 18, 0.84)',
            boxShadow: `0 22px 60px rgba(0, 0, 0, 0.88), 0 0 36px ${winnerColor}44`,
          }}
        >
          {/* Champion Spotlight Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center rounded-full border-2 border-[#f1c40f]/75 bg-[#f1c40f]/15 px-3 py-1 text-3xl shadow-lg">
              👑 🏆 🎆
            </div>
            <h2 className="royal-modal-title mt-1.5 text-2xl leading-tight">
              {winner !== null ? `${winnerName} WINS!` : 'MATCH FINISHED!'}
            </h2>
            <p className="mt-0.5 text-xs text-white/75">
              1st Place Champion — Final Standings &amp; Positions
            </p>

            {myRanking && (
              <div
                className="mt-2 inline-flex items-center gap-2 rounded-full border px-3.5 py-1 font-display text-xs font-bold"
                style={{
                  borderColor: myRanking.rank === 1 ? '#f1c40f' : 'rgba(0, 212, 255, 0.6)',
                  background:
                    myRanking.rank === 1 ? 'rgba(241, 196, 15, 0.2)' : 'rgba(0, 212, 255, 0.14)',
                  color: myRanking.rank === 1 ? '#f1c40f' : '#9beeff',
                }}
              >
                <span>{myRanking.badge || `#${myRanking.rank}`}</span>
                <span>
                  Your Position: #{myRanking.rank} ({formatOrdinalPosition(myRanking.rank)} •{' '}
                  {myRanking.percentage}%)
                </span>
              </div>
            )}
          </div>

          {/* Top-3 Podium Strip */}
          {podiumFirst && podiumSecond && podiumThird && (
            <div className="grid grid-cols-3 items-end gap-2 pt-1">
              {/* 2nd Place */}
              <div className="rounded-xl border border-slate-300/35 bg-white/8 px-2 py-2 text-center">
                <div className="text-lg leading-none">🥈</div>
                <div className="mt-1 flex items-center justify-center gap-1">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: getPlayerColor(podiumSecond.seat, isTournament) }}
                  />
                  <span className="truncate font-display text-xs font-bold text-white">
                    {stripSeatTag(podiumSecond.name)}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] font-bold text-slate-200">
                  2nd • {podiumSecond.percentage}%
                </div>
              </div>

              {/* 1st Place Champion */}
              <div
                className="rounded-xl border-2 border-[#f1c40f] px-2 py-3 text-center shadow-lg"
                style={{
                  background: `linear-gradient(180deg, rgba(241, 196, 15, 0.22), rgba(241, 196, 15, 0.08))`,
                }}
              >
                <div className="text-2xl leading-none">🥇</div>
                <div className="mt-1 flex items-center justify-center gap-1">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full ring-1 ring-white/70"
                    style={{ backgroundColor: getPlayerColor(podiumFirst.seat, isTournament) }}
                  />
                  <span className="truncate font-display text-sm font-bold text-[#f1c40f]">
                    {stripSeatTag(podiumFirst.name)}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] font-extrabold text-white">
                  1st • {podiumFirst.percentage}%
                </div>
              </div>

              {/* 3rd Place */}
              <div className="rounded-xl border border-amber-600/45 bg-white/8 px-2 py-1.5 text-center">
                <div className="text-lg leading-none">🥉</div>
                <div className="mt-1 flex items-center justify-center gap-1">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: getPlayerColor(podiumThird.seat, isTournament) }}
                  />
                  <span className="truncate font-display text-xs font-bold text-white">
                    {stripSeatTag(podiumThird.name)}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] font-bold text-amber-300">
                  3rd • {podiumThird.percentage}%
                </div>
              </div>
            </div>
          )}

          {/* Complete 1st-5th Ranking & Position Table */}
          <div className="space-y-1.5">
            {rankings.map((r) => {
              const seatColor = getPlayerColor(r.seat, isTournament);
              const isChamp = r.rank === 1;
              const isMe = focusSeat !== null && focusSeat === r.seat;
              const isAiSeat = !!players[r.seat]?.isAI;

              return (
                <div
                  key={r.seat}
                  className="rounded-xl border px-3 py-2 text-xs transition-colors"
                  style={{
                    borderColor: isChamp
                      ? 'rgba(241, 196, 15, 0.85)'
                      : isMe
                        ? 'rgba(0, 212, 255, 0.7)'
                        : 'rgba(255, 255, 255, 0.14)',
                    background: isChamp
                      ? 'rgba(241, 196, 15, 0.14)'
                      : isMe
                        ? 'rgba(0, 212, 255, 0.1)'
                        : 'rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="inline-flex h-6 min-w-[38px] shrink-0 items-center justify-center rounded-lg px-1.5 font-display text-xs font-bold"
                        style={{
                          background: isChamp
                            ? 'rgba(241, 196, 15, 0.25)'
                            : 'rgba(255, 255, 255, 0.1)',
                          color: isChamp ? '#f1c40f' : '#ffffff',
                        }}
                      >
                        {r.badge ? `${r.badge} #${r.rank}` : `#${r.rank}`}
                      </span>
                      <span
                        className="h-3 w-3 shrink-0 rounded-full ring-1 ring-white/50"
                        style={{ backgroundColor: seatColor }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-display text-sm font-bold text-white">
                            {stripSeatTag(r.name)}
                          </span>
                          {isMe && (
                            <span className="rounded bg-[#00d4ff]/25 px-1.5 py-0.5 text-[10px] font-bold text-[#9beeff]">
                              YOU
                            </span>
                          )}
                          {isAiSeat && (
                            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/65">
                              AI
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-semibold text-white/60">
                          Position: {r.label}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2.5 text-white/85 tabular-nums">
                      <span title="Captures made">⚔️ {r.captures_made}</span>
                      <span title="Times captured">💀 {r.times_captured}</span>
                      <span title="Penalties">⚠️ {r.penalties}</span>
                      <span className="min-w-[34px] text-right font-extrabold text-[#f1c40f]">
                        {r.percentage}%
                      </span>
                      {isTournament && (
                        <span className="font-bold text-[#2ecc71]">
                          ${winStats.balances[r.name] ?? winStats.balances[stripSeatTag(r.name)] ?? 5}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Position Progress Bar */}
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(3, Math.min(100, r.percentage))}%`,
                        backgroundColor: seatColor,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => setFireworksOnly(true)}
              className="cursor-pointer rounded-xl border border-[#f1c40f]/55 bg-[#f1c40f]/15 px-3 py-2.5 font-display text-xs font-bold text-[#f1c40f] hover:bg-[#f1c40f]/25"
            >
              🎆 Watch Fireworks
            </button>
            <button
              type="button"
              onClick={handleMainMenu}
              className="flex-1 cursor-pointer rounded-xl border border-white/25 bg-white/10 py-2.5 font-display text-sm font-bold text-white hover:bg-white/20"
            >
              MAIN MENU
            </button>
            {!isOnline && (
              <button
                type="button"
                onClick={() => startLocalMatch(isTournament)}
                className="flex-1 cursor-pointer rounded-xl bg-[#27ae60] py-2.5 font-display text-sm font-bold text-white hover:bg-[#2ecc71]"
              >
                PLAY AGAIN
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
