const { get } = require('./http');
const { extractFileId, parseStage1, parseStage2 } = require('./parser');

/**
 * Full HubCloud bypass pipeline
 * @param {string} inputUrl - Any hubcloud drive URL
 * @returns {Promise<object>} Structured result with all download links
 */
async function bypass(inputUrl) {
  // ── Stage 0: Normalize URL ──────────────────────────────────────────────
  const { id } = extractFileId(inputUrl);
  const driveUrl = `https://hubcloud.mov/drive/${id}`;

  // ── Stage 1: Fetch drive page ───────────────────────────────────────────
  const stage1 = await get(driveUrl, { Referer: 'https://hubcloud.mov/' });

  if (stage1.status === 404) throw new Error(`File not found: ${id}`);
  if (!stage1.data) throw new Error('Empty response from drive page');

  const { tokenUrl, meta } = parseStage1(stage1.data);

  // ── Stage 2: Hit gamerxyt token endpoint ────────────────────────────────
  //   This endpoint redirects (301/302) to the final download page
  const stage2 = await get(tokenUrl, {
    Referer: driveUrl,
    'Sec-Fetch-Site': 'cross-site',
  });

  // The final URL after redirect is the actual download page
  // If still on gamerxyt, follow manually
  let finalHtml = stage2.data;
  let finalUrl = stage2.finalUrl;

  // Some variants redirect to hubcloud.mov/drive2/{token} style pages
  if (finalUrl.includes('gamerxyt.com') && stage2.status === 200) {
    // Extract meta-refresh or window.location from gamerxyt response
    const redirMatch = finalHtml.match(
      /(?:window\.location(?:\.href)?\s*=\s*|url=|content=["'][0-9]+;\s*url=)["']?(https?:\/\/[^"'\s>]+)/i
    );
    if (redirMatch) {
      const hop = await get(redirMatch[1], { Referer: tokenUrl });
      finalHtml = hop.data;
      finalUrl = hop.finalUrl;
    }
  }

  // ── Stage 3: Parse download links ───────────────────────────────────────
  const servers = parseStage2(finalHtml, finalUrl);

  if (servers.length === 0) {
    throw new Error(
      'No download links found — token may have expired. Re-request the original URL.'
    );
  }

  return {
    success: true,
    file_id: id,
    metadata: meta,
    servers,
    token_url: tokenUrl,
    final_page: finalUrl,
    extracted_at: new Date().toISOString(),
  };
}

module.exports = { bypass };
