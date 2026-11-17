'use strict';

const https = require('https');
const http  = require('http');
const zlib  = require('zlib');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Minimal cookie jar — just key=value, no expiry logic needed
 */
class Jar {
  constructor() { this._map = new Map(); }
  
  ingest(setCookieHeaders = []) {
    for (const h of setCookieHeaders) {
      const pair = h.split(';')[0].trim();
      const eq   = pair.indexOf('=');
      if (eq < 1) continue;
      this._map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header() {
    return [...this._map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  set(k, v) { this._map.set(k, v); }
}

const jar = new Jar();
// Pre-seed the cookie gamerxyt checks
jar.set('xla', 's4t');
jar.set('xyt', '1');

/**
 * Raw promise-based GET — follows redirects manually so we can track
 * meta-refresh / JS window.location redirects too.
 *
 * @param {string} url
 * @param {object} opts
 * @param {string} [opts.referer]
 * @param {number} [opts.maxRedirects]
 * @returns {Promise<{body:string, finalUrl:string, status:number}>}
 */
function rawGet(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const { referer = 'https://www.google.com/', maxRedirects = 12 } = opts;
    let redirectsLeft = maxRedirects;

    function doRequest(currentUrl) {
      const parsed  = new URL(currentUrl);
      const isHttps = parsed.protocol === 'https:';
      const lib     = isHttps ? https : http;

      const reqOpts = {
        hostname: parsed.hostname,
        port    : parsed.port || (isHttps ? 443 : 80),
        path    : parsed.pathname + parsed.search,
        method  : 'GET',
        headers : {
          'User-Agent'               : UA,
          'Accept'                   : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language'          : 'en-US,en;q=0.9',
          'Accept-Encoding'          : 'gzip, deflate, br',
          'Connection'               : 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest'           : 'document',
          'Sec-Fetch-Mode'           : 'navigate',
          'Sec-Fetch-Site'           : referer.includes(parsed.hostname) ? 'same-origin' : 'cross-site',
          'Referer'                  : referer,
          'Cookie'                   : jar.header(),
        },
        timeout: 20000,
      };

      const req = lib.request(reqOpts, (res) => {
        // Ingest cookies
        const sc = res.headers['set-cookie'];
        if (sc) jar.ingest(Array.isArray(sc) ? sc : [sc]);

        // HTTP redirects (301/302/303/307/308)
        const loc = res.headers['location'];
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && loc) {
          if (redirectsLeft-- <= 0) return reject(new Error('Too many redirects'));
          const next = loc.startsWith('http') ? loc : new URL(loc, currentUrl).href;
          return doRequest(next);
        }

        // Collect body
        const chunks = [];
        let stream   = res;

        const enc = res.headers['content-encoding'];
        if (enc === 'gzip')    stream = res.pipe(zlib.createGunzip());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());

        stream.on('data',  (c) => chunks.push(c));
        stream.on('error', reject);
        stream.on('end',   () => {
          resolve({
            body    : Buffer.concat(chunks).toString('utf8'),
            finalUrl: currentUrl,
            status  : res.statusCode,
          });
        });
      });

      req.on('error',   reject);
      req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${currentUrl}`)); });
      req.end();
    }

    doRequest(url);
  });
}

/**
 * GET with JS-redirect follow:
 * After HTTP redirects, scan the HTML body for:
 *   window.location[.href] = "..."
 *   <meta http-equiv="refresh" content="N; url=...">
 * and follow those too.
 */
async function get(url, opts = {}) {
  let { body, finalUrl, status } = await rawGet(url, opts);

  // Follow JS / meta-refresh redirects (up to 5 hops)
  for (let i = 0; i < 5; i++) {
    const jsRedir = extractJsRedirect(body);
    if (!jsRedir) break;
    const next = jsRedir.startsWith('http') ? jsRedir : new URL(jsRedir, finalUrl).href;
    if (next === finalUrl) break; // same page, stop
    ({ body, finalUrl, status } = await rawGet(next, { ...opts, referer: finalUrl }));
  }

  return { body, finalUrl, status };
}

function extractJsRedirect(html) {
  // window.location.href = "..."  or  window.location = "..."
  const jsMatch = html.match(
    /window\.location(?:\.href)?\s*=\s*["'](?!#)(https?:\/\/[^"']+)["']/
  );
  if (jsMatch) return jsMatch[1];

  // <meta http-equiv="refresh" content="N; url=...">
  const metaMatch = html.match(
    /content=["'][0-9]+\s*;\s*url=(https?:\/\/[^"'>]+)/i
  );
  if (metaMatch) return metaMatch[1];

  return null;
}

module.exports = { get, jar };
