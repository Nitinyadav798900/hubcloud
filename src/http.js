'use strict';

const https = require('https');
const http  = require('http');
const zlib  = require('zlib');

const UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SEC_UA   = '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"';

class Jar {
  constructor() { this._m = new Map(); }
  ingest(arr = []) {
    for (const h of arr) {
      const pair = h.split(';')[0].trim();
      const eq   = pair.indexOf('=');
      if (eq < 1) continue;
      this._m.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  set(k, v) { this._m.set(k, v); }
  header()  { return [...this._m.entries()].map(([k,v]) => `${k}=${v}`).join('; '); }
}

const jar = new Jar();
jar.set('xla', 's4t');
jar.set('xyt', '1');

/**
 * Pure HTTP GET — follows ONLY HTTP 3xx redirects.
 * NO JS redirect following. Ever. Those are ad-traps.
 */
function rawGet(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const { referer = 'https://www.google.com/', maxRedirects = 15 } = opts;
    let hopsLeft = maxRedirects;

    function doReq(cur) {
      let parsed;
      try { parsed = new URL(cur); } catch(e) { return reject(new Error(`Bad URL: ${cur}`)); }

      const isHttps = parsed.protocol === 'https:';
      const lib     = isHttps ? https : http;

      // ── Block ad/redirect domains we should never follow ──────────────
      const blocked = ['bonuscaf.com','bonusca.com','winexch.com','acscdn.com',
                       'cleverwebserver.com','cloudfront.net/aydfd'];
      if (blocked.some(d => cur.includes(d))) {
        return reject(new Error(`Blocked redirect to ad domain: ${cur}`));
      }

      const reqOpts = {
        hostname: parsed.hostname,
        port    : parsed.port || (isHttps ? 443 : 80),
        path    : parsed.pathname + parsed.search,
        method  : 'GET',
        timeout : 25000,
        headers : {
          'User-Agent'               : UA,
          'Accept'                   : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language'          : 'en-US,en;q=0.9',
          'Accept-Encoding'          : 'gzip, deflate, br',
          'Connection'               : 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-CH-UA'                : SEC_UA,
          'Sec-CH-UA-Mobile'         : '?0',
          'Sec-CH-UA-Platform'       : '"Windows"',
          'Sec-Fetch-Dest'           : 'document',
          'Sec-Fetch-Mode'           : 'navigate',
          'Sec-Fetch-Site'           : referer && new URL(referer).hostname === parsed.hostname
                                         ? 'same-origin' : 'cross-site',
          'Sec-Fetch-User'           : '?1',
          'Cache-Control'            : 'max-age=0',
          'Referer'                  : referer || '',
          'Cookie'                   : jar.header(),
        },
      };

      const req = lib.request(reqOpts, (res) => {
        // Ingest set-cookie
        const sc = res.headers['set-cookie'];
        if (sc) jar.ingest(Array.isArray(sc) ? sc : [sc]);

        // HTTP 3xx
        const loc = res.headers['location'];
        if ([301,302,303,307,308].includes(res.statusCode) && loc) {
          if (hopsLeft-- <= 0) return reject(new Error('Too many redirects'));
          const next = loc.startsWith('http') ? loc : new URL(loc, cur).href;

          // Block ad redirects even from HTTP 302
          if (blocked.some(d => next.includes(d))) {
            return reject(new Error(`gamerxyt blocked request (ad redirect): ${next}`));
          }
          return doReq(next);
        }

        // Collect + decompress
        const chunks = [];
        let stream   = res;
        const enc    = res.headers['content-encoding'];
        if (enc === 'gzip')    stream = res.pipe(zlib.createGunzip());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());

        stream.on('data',  c => chunks.push(c));
        stream.on('error', reject);
        stream.on('end',   () => resolve({
          body    : Buffer.concat(chunks).toString('utf8'),
          finalUrl: cur,
          status  : res.statusCode,
        }));
      });

      req.on('error',   reject);
      req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${cur}`)); });
      req.end();
    }

    doReq(url);
  });
}

/** Simple delay */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** GET — HTTP redirects only, NO JS redirect following */
async function get(url, opts = {}) {
  if (opts.delay) await sleep(opts.delay);
  return rawGet(url, opts);
}

module.exports = { get, jar, sleep };
