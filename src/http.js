const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const jar = new CookieJar();

const client = wrapper(
  axios.create({
    jar,
    withCredentials: true,
    timeout: 20000,
    maxRedirects: 10,
    validateStatus: (s) => s < 500,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,' +
        'image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  })
);

/**
 * GET with Referer spoofing + optional extra headers
 * @param {string} url
 * @param {object} [extraHeaders]
 * @returns {Promise<{data: string, finalUrl: string, status: number}>}
 */
async function get(url, extraHeaders = {}) {
  const resp = await client.get(url, {
    headers: {
      Referer: 'https://www.google.com/',
      ...extraHeaders,
    },
    responseType: 'text',
  });

  return {
    data: resp.data,
    finalUrl: resp.request?.res?.responseUrl || url,
    status: resp.status,
  };
}

module.exports = { get };
