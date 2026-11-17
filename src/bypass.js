'use strict';

const { get, jar } = require('./http');
const { extractFileId, parseStage1, parseStage2 } = require('./parser');

// All known HubCloud drive hosts (try in order)
const DRIVE_HOSTS = [
  'hubcloud.mov',
  'hubcloud.cx',
  'hubcloud.in',
  'hubcloud.pw',
  'hubcloud.fans',
  'hubcloud.club',
];

/**
 * Full HubCloud bypass pipeline
 */
async function bypass(inputUrl) {
  const { id } = extractFileId(inputUrl);

  // ── Stage 1: Fetch drive page (try hosts until one works) ─────────────
  let stage1Html  = null;
  let stage1Url   = null;

  for (const host of DRIVE_HOSTS) {
    const url = `https://${host}/drive/${id}`;
    try {
      const res = await get(url, { referer: 'https://www.google.com/' });
      if (res.status === 200 && res.body.length > 500) {
        stage1Html = res.body;
        stage1Url  = res.finalUrl;
        break;
      }
    } catch (_) {
      // try next host
    }
  }

  if (!stage1Html) throw new Error(`File not found or all hosts down (id: ${id})`);

  // ── Stage 2: Extract token URL ─────────────────────────────────────────
  const { tokenUrl, meta } = parseStage1(stage1Html);

  // Set referer to the page we just loaded
  jar.set('xla', 's4t');
  jar.set('xyt', '1');

  // ── Stage 3: Hit gamerxyt token endpoint ──────────────────────────────
  // This might 302 → hubcloud.mov/drive2/... OR return HTML with JS redirect
  const stage2 = await get(tokenUrl, {
    referer    : stage1Url,
    maxRedirects: 15,
  });

  let finalHtml = stage2.body;
  let finalUrl  = stage2.finalUrl;

  // If we ended up back on a drive page or gamerxyt itself, something is wrong
  if (finalUrl.includes('gamerxyt.com') && stage2.status !== 200) {
    throw new Error('gamerxyt token rejected — URL may have expired');
  }

  // ── Stage 4: Parse all download links ─────────────────────────────────
  const servers = parseStage2(finalHtml);

  if (servers.length === 0) {
    // Debug dump — will appear in Vercel function logs
    console.error('[bypass] Final URL:', finalUrl);
    console.error('[bypass] HTML snippet:', finalHtml.slice(0, 2000));
    throw new Error(
      'No download links found — token expired. Use a fresh HubCloud URL.'
    );
  }

  return {
    success     : true,
    file_id     : id,
    metadata    : meta,
    servers,
    token_url   : tokenUrl,
    final_page  : finalUrl,
    extracted_at: new Date().toISOString(),
  };
}

module.exports = { bypass };
