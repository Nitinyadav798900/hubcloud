'use strict';

const { get, jar, sleep } = require('./http');
const { extractFileId, parseStage1, parseStage2 } = require('./parser');

const DRIVE_HOSTS = [
  'hubcloud.mov',
  'hubcloud.cx',
  'hubcloud.in',
  'hubcloud.pw',
  'hubcloud.fans',
  'hubcloud.club',
];

async function bypass(inputUrl) {
  const { id } = extractFileId(inputUrl);

  // ── Stage 1: Fetch drive page ──────────────────────────────────────────
  let stage1Html = null;
  let stage1Url  = null;

  for (const host of DRIVE_HOSTS) {
    const url = `https://${host}/drive/${id}`;
    try {
      const res = await get(url, { referer: 'https://www.google.com/' });
      if (res.status === 200 && res.body.length > 500) {
        stage1Html = res.body;
        stage1Url  = res.finalUrl;
        console.log(`[bypass] Stage1 OK from ${host}`);
        break;
      }
    } catch (e) {
      console.warn(`[bypass] Host ${host} failed: ${e.message}`);
    }
  }

  if (!stage1Html) throw new Error(`File not found (id: ${id})`);

  // ── Stage 2: Extract token URL ─────────────────────────────────────────
  const { tokenUrl, meta } = parseStage1(stage1Html);
  console.log(`[bypass] Token URL: ${tokenUrl}`);

  // ── CRITICAL: seed cookies exactly like browser does ──────────────────
  jar.set('xla', 's4t');
  jar.set('xyt', '1');

  // ── CRITICAL: wait 2.5s — gamerxyt has a 2s timer before allowing ──────
  // Without this delay, gamerxyt treats request as bot and bounces to ad
  await sleep(2500);

  // ── Stage 3: Hit gamerxyt ─────────────────────────────────────────────
  let finalHtml, finalUrl;
  try {
    const res = await get(tokenUrl, {
      referer: stage1Url,  // must be hubcloud page
    });
    finalHtml = res.body;
    finalUrl  = res.finalUrl;
    console.log(`[bypass] Final URL: ${finalUrl}`);
  } catch (e) {
    // gamerxyt bounced to ad — token expired or bot detected
    throw new Error(
      `gamerxyt rejected the request: ${e.message}. ` +
      `Use a fresh URL from HDHub4u.ms`
    );
  }

  // ── Stage 4: Parse download links ─────────────────────────────────────
  const servers = parseStage2(finalHtml);

  if (servers.length === 0) {
    console.error('[bypass] Final URL:', finalUrl);
    console.error('[bypass] HTML snippet:', finalHtml.slice(0, 3000));
    throw new Error(
      'No download links found. Token expired — get a fresh URL from HDHub4u.ms'
    );
  }

  console.log(`[bypass] Found ${servers.length} servers`);

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
