'use strict';

const express = require('express');
const { bypass } = require('./src/bypass');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use((_, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ── Rate limit (memory-based, fine for Vercel) ─────────────────────────
const rateMap = new Map();
app.use('/hubcloud', (req, res, next) => {
  const ip  = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown';
  const now = Date.now();
  const rec = rateMap.get(ip) || { n: 0, t: now };
  if (now - rec.t > 60_000) { rateMap.set(ip, { n: 1, t: now }); return next(); }
  if (++rec.n > 30) return res.status(429).json({ success: false, error: 'Rate limit (30/min)' });
  rateMap.set(ip, rec);
  next();
});

// ── Main endpoint ───────────────────────────────────────────────────────
app.get('/hubcloud', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({
      success: false,
      error  : 'Missing ?url= parameter',
      example: '/hubcloud?url=https://hubcloud.pw/drive/hjbxwnwshhhqyu8',
    });
  }

  try {
    const result = await bypass(url);
    return res.json(result);
  } catch (err) {
    console.error('[/hubcloud] error:', err.message);
    const code = err.message.includes('not found') || err.message.includes('Invalid') ? 400 : 502;
    return res.status(code).json({ success: false, error: err.message, url });
  }
});

// ── Health check ────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'up', ts: Date.now() }));

// ── 404 ─────────────────────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ success: false, error: 'Route not found' }));

app.listen(PORT, () => console.log(`[hubcloud-bypass] :${PORT}`));
