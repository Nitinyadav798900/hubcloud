'use strict';

const express = require('express');
const { bypass } = require('./src/bypass');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'hubcloud-bypass');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// ── Rate limit (simple in-memory, swap for redis in prod) ──────────────────
const rateMap = new Map();
app.use((req, res, next) => {
  if (req.path !== '/hubcloud') return next();
  const ip = req.ip;
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > 60_000) {
    rateMap.set(ip, { count: 1, start: now });
    return next();
  }
  entry.count++;
  if (entry.count > 30) {
    return res.status(429).json({ success: false, error: 'Rate limit exceeded (30 req/min)' });
  }
  rateMap.set(ip, entry);
  next();
});

// ── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /hubcloud?url={hubcloud_drive_url}
 *
 * Response:
 * {
 *   success: true,
 *   file_id: "hjbxwnwshhhqyu8",
 *   metadata: { filename, size, type, date },
 *   servers: [
 *     { label: "FSLv2 Server", url: "https://...", server: "fslv2" },
 *     { label: "FSL Server",   url: "https://...", server: "fsl"   },
 *     ...
 *   ],
 *   extracted_at: "2026-11-17T06:00:00.000Z"
 * }
 */
app.get('/hubcloud', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'Missing ?url= parameter',
      example: '/hubcloud?url=https://hubcloud.pw/drive/hjbxwnwshhhqyu8',
    });
  }

  try {
    const result = await bypass(url);
    return res.json(result);
  } catch (err) {
    const isUserError =
      err.message.includes('Invalid URL') ||
      err.message.includes('not found') ||
      err.message.includes('expired');

    return res.status(isUserError ? 400 : 502).json({
      success: false,
      error: err.message,
      url,
    });
  }
});

// Health check
app.get('/health', (_, res) => res.json({ status: 'up', ts: Date.now() }));

// 404
app.use((_, res) =>
  res.status(404).json({ success: false, error: 'Route not found' })
);

app.listen(PORT, () => {
  console.log(`[hubcloud-bypass] listening on :${PORT}`);
});
