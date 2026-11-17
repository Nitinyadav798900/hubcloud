const cheerio = require('cheerio');

/**
 * Extract file ID from any HubCloud URL variant
 * Handles:
 *   hubcloud.pw/drive/ABC123
 *   hubcloud.cx/drive/ABC123
 *   hubcloud.mov/drive/ABC123
 */
function extractFileId(inputUrl) {
  try {
    const u = new URL(inputUrl);
    // path: /drive/{id}  or  /d/{id}
    const match = u.pathname.match(/\/(?:drive|d)\/([a-zA-Z0-9_-]+)/);
    if (!match) throw new Error('Could not extract file ID from URL');
    return { id: match[1], host: u.hostname };
  } catch (e) {
    throw new Error(`Invalid URL: ${e.message}`);
  }
}

/**
 * Parse Stage-1 page (hubcloud.mov/drive/{id})
 * Returns the gamerxyt token URL
 */
function parseStage1(html) {
  const $ = cheerio.load(html);

  // Primary: anchor with gamerxyt.com in href
  let tokenUrl = $('a[href*="gamerxyt.com"]').first().attr('href');

  // Fallback: JS variable url = '...'
  if (!tokenUrl) {
    const scriptContent = $('script')
      .map((_, el) => $(el).html())
      .get()
      .join('\n');

    const urlMatch = scriptContent.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/);
    if (urlMatch) tokenUrl = urlMatch[1];
  }

  // Extract file metadata
  const meta = {};
  meta.filename =
    $('div.card-header').first().text().trim() ||
    $('title').text().trim();

  $('li.list-group-item').each((_, el) => {
    const text = $(el).text().trim();
    if (text.includes('File Size'))
      meta.size = $(el).find('i').text().trim();
    if (text.includes('File Type'))
      meta.type = $(el).find('i').text().trim();
    if (text.includes('Share Date'))
      meta.date = $(el).find('i').text().trim();
  });

  if (!tokenUrl) throw new Error('Could not locate token URL in Stage-1 page');

  return { tokenUrl, meta };
}

/**
 * Parse Stage-2 page (final download page after gamerxyt redirect)
 * Returns array of { label, url, server } objects
 */
function parseStage2(html, finalUrl) {
  const $ = cheerio.load(html);
  const links = [];

  const push = (label, url, server) => {
    if (url && url.startsWith('http')) links.push({ label, url, server });
  };

  // FSLv2 Server  (id="s3")
  push('FSLv2 Server', $('a#s3').attr('href'), 'fslv2');

  // FSL Server (id="fsl")
  //  Note: the site patches this via inline JS; we grab the href attribute directly
  //  then also attempt to extract the patched version from script
  let fslUrl = $('a#fsl').attr('href') || '';
  const scripts = $('script').map((_, el) => $(el).html()).get().join('\n');
  const fslScriptMatch = scripts.match(/const\s+fsl\s*=\s*[^;]+;[\s\S]*?fsl\.href\s*=\s*([^;]+)/);
  // just use the raw href if present
  if (fslUrl && fslUrl.includes('r2.cloudflarestorage.com'))
    push('FSL Server', fslUrl, 'fsl');

  // 10Gbps Server (gpdl.hubcloud.mov)
  $('a[href*="gpdl.hubcloud"]').each((_, el) => {
    push('10Gbps Server', $(el).attr('href'), '10gbps');
  });

  // PixelDrain
  $('a[id^="pxl"]').each((_, el) => {
    push('PixelDrain Server', $(el).attr('href'), 'pixeldrain');
  });
  // also check script-patched pxl
  const pxlMatch = scripts.match(/var\s+pxl\s*=\s*["']([^"']+)["']/);
  if (pxlMatch) push('PixelDrain Server (patched)', pxlMatch[1], 'pixeldrain');

  // Buzz / FuckingFast
  $('a[href*="fuckingfast"]').each((_, el) => {
    push('Buzz Server', $(el).attr('href'), 'buzz');
  });

  // Telegram download
  $('a[href*="hubcloud.mov/tg"]').each((_, el) => {
    push('Telegram', $(el).attr('href'), 'telegram');
  });

  // Watch Online
  const watchUrl = $('a#tgbtn').attr('href');
  if (watchUrl) push('Watch Online (Stream)', watchUrl, 'stream');

  // Generic catch-all: any big download buttons we may have missed
  $('a.btn.btn-success, a.btn.btn-danger').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    if (
      href.startsWith('http') &&
      (href.includes('r2.cloudflarestorage') ||
        href.includes('gpdl') ||
        href.includes('pixeldrain') ||
        href.includes('fuckingfast')) &&
      !links.find((l) => l.url === href)
    ) {
      push(text || 'Unknown Server', href, 'other');
    }
  });

  // Deduplicate by URL
  const seen = new Set();
  return links.filter((l) => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });
}

module.exports = { extractFileId, parseStage1, parseStage2 };
