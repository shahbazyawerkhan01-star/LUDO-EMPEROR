import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { RoomManager } from './roomManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = 3000;

const TTS_MAX_TEXT_LENGTH = 200;
const TTS_RATE_LIMIT_MAX = 90;
const TTS_RATE_LIMIT_WINDOW_MS = 60_000;

export function createTtsLimiter(maxRequests = TTS_RATE_LIMIT_MAX, windowMs = TTS_RATE_LIMIT_WINDOW_MS) {
  const ipBuckets = new Map();

  const cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, hits] of ipBuckets.entries()) {
      const recent = hits.filter((ts) => ts >= cutoff);
      if (recent.length === 0) ipBuckets.delete(ip);
      else ipBuckets.set(ip, recent);
    }
  }, 60_000);
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

  return function checkTtsRateLimit(ip) {
    const now = Date.now();
    const cutoff = now - windowMs;
    const recent = (ipBuckets.get(ip) || []).filter((ts) => ts >= cutoff);
    if (recent.length >= maxRequests) {
      ipBuckets.set(ip, recent);
      const oldest = recent[0] || now;
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      };
    }
    recent.push(now);
    ipBuckets.set(ip, recent);
    return { allowed: true };
  };
}

export function createLudoCoreServer(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR;
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' },
    pingInterval: 10000,
    pingTimeout: 5000,
    maxHttpBufferSize: 1e6,
  });

  app.use(express.json());
  app.use(express.static(path.join(rootDir, 'public'), { index: false }));

  const roomManager = new RoomManager(io, rootDir, options.roomOptions || {});
  const checkTtsLimit = createTtsLimiter(options.ttsMaxPerMin ?? TTS_RATE_LIMIT_MAX);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'Ludo Dethroned 5-Way Server-Authoritative Engine' });
  });

  app.get('/api/rooms/:code', (req, res) => {
    const summary = roomManager.getRoomSummary(req.params.code);
    if (!summary) return res.status(404).json({ error: 'Room not found' });
    return res.json(summary);
  });

  // High-fidelity native language TTS endpoint with cache-first delivery + per-IP rate limiting on misses
  const ttsAudioCache = new Map();

  app.get('/api/tts', async (req, res) => {
    try {
      const fwd = req.headers['x-forwarded-for'];
      const clientIp = typeof fwd === 'string' ? fwd.split(',')[0].trim() : req.socket.remoteAddress || '127.0.0.1';
      const limitCheck = checkTtsLimit(clientIp);
      if (!limitCheck.allowed) {
        if (limitCheck.retryAfterSec) res.setHeader('Retry-After', String(limitCheck.retryAfterSec));
        return res.status(429).json({ error: 'TTS rate limit exceeded. Try again shortly.' });
      }

      const rawText = String(req.query.text || '').trim();
      const lang = String(req.query.lang || 'ur').trim().toLowerCase().slice(0, 12);
      if (!rawText) return res.status(400).send('No text');
      if (rawText.length > TTS_MAX_TEXT_LENGTH) {
        return res.status(400).send(`Text too long (max ${TTS_MAX_TEXT_LENGTH} characters)`);
      }

      const cleanText = rawText
        .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu, '')
        .trim();
      if (!cleanText) return res.status(400).send('Empty text');

      const langMap = { zh: 'zh-CN', fa: 'ar' };
      const targetLang = langMap[lang] || lang;
      const cacheKey = `${targetLang}:${cleanText}`;

      if (ttsAudioCache.has(cacheKey)) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(ttsAudioCache.get(cacheKey));
      }

      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=${encodeURIComponent(targetLang)}&client=tw-ob`;
      const ttsRes = await fetch(ttsUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!ttsRes.ok) return res.status(502).send('TTS unavailable');
      const buffer = Buffer.from(await ttsRes.arrayBuffer());

      if (ttsAudioCache.size > 600) {
        const oldest = ttsAudioCache.keys().next().value;
        if (oldest) ttsAudioCache.delete(oldest);
      }
      ttsAudioCache.set(cacheKey, buffer);

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    } catch {
      return res.status(500).send('TTS error');
    }
  });

  io.on('connection', (socket) => {
    roomManager.attachSocketHandlers(socket);
  });

  return { app, server, io, roomManager };
}

async function bootstrap() {
  const { app, server } = createLudoCoreServer();

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.join(ROOT_DIR, 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: ROOT_DIR,
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.get(['/', '/web', '/web.html', '/mobile', '/mobile.html', '*'], async (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/audio/')) return next();
      try {
        const url = req.originalUrl;
        const rawHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
        const transformed = await vite.transformIndexHtml(url, rawHtml);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
      } catch (e) {
        next(e);
      }
    });
  } else {
    app.use(express.static(distDir, { index: false }));
    app.get(['/', '/web', '/web.html', '/mobile', '/mobile.html', '*'], (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/audio/')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[LudoServer] Listening on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'vite-dev'})`);
  });
}

const isEntryScript =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isEntryScript) {
  bootstrap().catch((err) => {
    console.error('[LudoServer] Failed to start:', err);
    process.exit(1);
  });
}
