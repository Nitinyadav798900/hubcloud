'use strict';

/**
 * Extract file ID from any HubCloud URL variant
 */
function extractFileId(inputUrl) {
  try {
    const u     = new URL(inputUrl);
    const match = u.pathname.match(/\/(?:drive|d)\/([a-zA-Z0-9_-]+)/);
    if (!match) throw new Error('Could not extract file ID');
    return { id: match[1], host: u.hostname };
  } catch (e) {
    throw new Error(`Invalid URL: ${e.message}`);
  }
}

/**
 * Stage-1 parse: get gamerxyt token URL + file metadata
 * Works on HTML from hubcloud.mov/drive/{id}
 */
function parseStage1(html) {
  const meta = {};

  // Filename from card-header
  const hdrMatch = html.match(/<div[^>]*card-header[^>]*>\s*([^<\n]{3,200?}?)\s*<\/div>/i);
  if (hdrMatch) meta.filename = hdrMatch[1].trim();

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (!meta.filename && titleMatch) meta.filename = titleMatch[1].trim();

  // File size / type / date
  const sizeMatch = html.match(/File Size[\s\S]{1,80}?<i[^>]*>([\d.\s]+[KMGT]B)<\/i>/i);
  if (sizeMatch) meta.size = sizeMatch[1].trim();

  const typeMatch = html.match(/File Type[\s\S]{1,80}?<i[^>]*>([^<]+)<\/i>/i);
  if (typeMatch) meta.type = typeMatch[1].trim();

  const dateMatch = html.match(/Share Date[\s\S]{1,80}?<i[^>]*>([^<]+)<\/i>/i);
  if (dateMatch) meta.date = dateMatch[1].trim();

  // ── Token URL extraction (try 4 patterns) ──────────────────────────────

  // 1. Anchor href with gamerxyt
  let tokenUrl = null;
  const anchorMatch = html.match(/href=["'](https:\/\/gamerxyt\.com[^"']+)["']/i);
  if (anchorMatch) tokenUrl = anchorMatch[1];

  // 2. var url = '...'  (the JS auto-redirect variable)
  if (!tokenUrl) {
    const jsVarMatch = html.match(/var\s+url\s*=\s*["'](https?:\/\/[^"']+)["']/);
    if (jsVarMatch) tokenUrl = jsVarMatch[1];
  }

  // 3. window.location.href = '...' pointing to gamerxyt
  if (!tokenUrl) {
    const jsLocMatch = html.match(/window\.location(?:\.href)?\s*=\s*["'](https?:\/\/gamerxyt[^"']+)["']/);
    if (jsLocMatch) tokenUrl = jsLocMatch[1];
  }

  // 4. Any URL containing gamerxyt
  if (!tokenUrl) {
    const anyMatch = html.match(/(https:\/\/gamerxyt\.com\/[^\s"'<>]+)/i);
    if (anyMatch) tokenUrl = anyMatch[1];
  }

  if (!tokenUrl) throw new Error('Token URL not found in Stage-1 HTML');

  return { tokenUrl, meta };
}

/**
 * Stage-2 parse: extract all download links from final page
 */
function parseStage2(html) {
  const links = [];
  const seen  = new Set();

  function push(label, url, server) {
    if (!url || !url.startsWith('http') || seen.has(url)) return;
    seen.add(url);
    links.push({ label, url, server });
  }

  // ── 1. FSLv2 (id="s3") ──────────────────────────────────────────────
  const s3Match = html.match(/id=["']s3["'][^>]*href=["']([^"']+)["']|href=["']([^"']+)["'][^>]*id=["']s3["']/i);
  if (s3Match) push('FSLv2 Server', s3Match[1] || s3Match[2], 'fslv2');

  // ── 2. FSL Server (id="fsl") ─────────────────────────────────────────
  const fslMatch = html.match(/id=["']fsl["'][^>]*href=["']([^"']+)["']|href=["']([^"']+)["'][^>]*id=["']fsl["']/i);
  if (fslMatch) push('FSL Server', fslMatch[1] || fslMatch[2], 'fsl');

  // ── 3. R2 / S3 signed URLs anywhere ─────────────────────────────────
  const r2Re = /href=["'](https:\/\/[a-z0-9]+\.r2\.cloudflarestorage\.com\/[^"']+)["']/gi;
  let m;
  while ((m = r2Re.exec(html)) !== null) {
    push('Direct Server', m[1], 'r2');
  }

  // ── 4. GPDL 10Gbps ───────────────────────────────────────────────────
  const gpdlRe = /href=["'](https:\/\/gpdl\.hubcloud[^"']+)["']/gi;
  while ((m = gpdlRe.exec(html)) !== null) {
    push('10Gbps Server', m[1], '10gbps');
  }

  // ── 5. PixelDrain — static href ──────────────────────────────────────
  const pxlHrefRe = /href=["'](https:\/\/pixeldrain[^"']+)["']/gi;
  while ((m = pxlHrefRe.exec(html)) !== null) {
    push('PixelDrain Server', m[1], 'pixeldrain');
  }
  // PixelDrain — JS patched: var pxl = "..."
  const pxlJs = html.match(/var\s+pxl\s*=\s*["'](https?:\/\/[^"']+)["']/);
  if (pxlJs) push('PixelDrain Server', pxlJs[1], 'pixeldrain');

  // ── 6. FuckingFast / Buzz ────────────────────────────────────────────
  const ffRe = /href=["'](https:\/\/fuckingfast\.net\/[^"']+)["']/gi;
  while ((m = ffRe.exec(html)) !== null) {
    push('Buzz Server', m[1], 'buzz');
  }

  // ── 7. Telegram download ─────────────────────────────────────────────
  const tgRe = /href=["'](https:\/\/hubcloud\.[a-z]+\/tg\/go[^"']+)["']/gi;
  while ((m = tgRe.exec(html)) !== null) {
    push('Telegram Download', m[1], 'telegram');
  }

  // ── 8. HBPlay watch-online ───────────────────────────────────────────
  const hbRe = /href=["'](https:\/\/hbplay[^"']+)["']/gi;
  while ((m = hbRe.exec(html)) !== null) {
    push('Watch Online', m[1], 'stream');
  }

  // ── 9. Generic btn-success / btn-danger fallback ──────────────────────
  const btnRe = /class=["'][^"']*btn(?:-success|-danger)[^"']*["'][^>]*href=["']([^"']+)["']|href=["']([^"']+)["'][^>]*class=["'][^"']*btn(?:-success|-danger)[^"']*["']/gi;
  while ((m = btnRe.exec(html)) !== null) {
    const u = m[1] || m[2];
    if (u && u.startsWith('http')) push('Server', u, 'other');
  }

  return links;
}

module.exports = { extractFileId, parseStage1, parseStage2 };
