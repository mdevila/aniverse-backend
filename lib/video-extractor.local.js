const puppeteer = require('puppeteer');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

let browser = null;

async function getBrowser() {
  if (browser && browser.connected) return browser;
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
  });
  return browser;
}

// Method 1: HTTP-based extraction (no Puppeteer needed)
// Fetches the kwik page HTML and extracts video URL from scripts
async function extractVideoHttp(kwikUrl) {
  try {
    const { data: html } = await axios.get(kwikUrl, {
      headers: { 'User-Agent': UA, 'Referer': 'https://animepahe.com/' },
      timeout: 15000,
      maxRedirects: 5,
    });

    // Look for m3u8 URLs
    const m3u8Match = html.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/);
    if (m3u8Match) return m3u8Match[0];

    // Look for mp4 URLs
    const mp4Match = html.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/);
    if (mp4Match) return mp4Match[0];

    // Look for uwu CDN URLs
    const uwuMatch = html.match(/https?:\/\/[^\s"']*uwu[^\s"']*/);
    if (uwuMatch) return uwuMatch[0];

    // Try to find eval/packed script and extract URL
    const evalMatch = html.match(/eval\(function\(p,a,c,k,e,d\)\{.*?\}\('(.*?)',(\d+),(\d+),'(.*?)'\.split/s);
    if (evalMatch) {
      const unpacked = unpackScript(evalMatch[0]);
      const videoUrl = unpacked.match(/https?:\/\/[^\s"']+\.(m3u8|mp4)[^\s"']*/);
      if (videoUrl) return videoUrl[0];
    }

    return null;
  } catch (e) {
    console.warn('HTTP extraction failed:', e.message);
    return null;
  }
}

// Method 2: Puppeteer-based extraction
async function extractVideoPuppeteer(kwikUrl) {
  const b = await getBrowser();
  if (!b) return null;

  const page = await b.newPage();
  let videoUrl = null;

  try {
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ Referer: 'https://animepahe.com' });

    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = req.url();
      if (/doubleclick|googlesyndication|popads|adsterra|exoclick/.test(url)) {
        req.abort();
        return;
      }
      if (/\.(m3u8|mp4|ts)(\?|$)/.test(url) || url.includes('uwu.m3u8')) {
        if (!videoUrl) videoUrl = url;
      }
      req.continue();
    });

    await page.goto(kwikUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

    const isDdg = await page.evaluate(() => document.title.includes('DDoS-Guard'));
    if (isDdg) {
      await page.waitForFunction(() => !document.title.includes('DDoS-Guard'), { timeout: 15000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
    }

    await page.waitForSelector('video, source, .plyr', { timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    if (!videoUrl) {
      videoUrl = await page.evaluate(() => {
        const source = document.querySelector('video source');
        if (source?.src) return source.src;
        const video = document.querySelector('video');
        if (video?.src && video.src.startsWith('http')) return video.src;
        const html = document.documentElement.innerHTML;
        const m3u8 = html.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/);
        if (m3u8) return m3u8[0];
        return null;
      });
    }
  } catch (e) {
    console.warn('Puppeteer extraction error:', e.message);
  } finally {
    await page.close();
  }

  return videoUrl;
}

function unpackScript(packed) {
  try {
    const argsMatch = packed.match(/\}\('(.+)',(\d+),(\d+),'(.+)'\.split/s);
    if (!argsMatch) return '';
    let [, p, a, c, keywords] = argsMatch;
    a = parseInt(a);
    c = parseInt(c);
    const kw = keywords.split('|');
    while (c--) {
      if (kw[c]) {
        const regex = new RegExp('\\b' + c.toString(a) + '\\b', 'g');
        p = p.replace(regex, kw[c]);
      }
    }
    return p;
  } catch { return ''; }
}

// Full flow: get kwik sources, extract video via Puppeteer
async function extractVideoStream(animeSession, episodeSession) {
  const animepahe = require('./animepahe');
  const { sources, embedUrl } = await animepahe.getEpisodeSources(animeSession, episodeSession);

  if (!sources.length) {
    return { videoUrl: null, sources: [], embedUrl };
  }

  for (const source of sources) {
    try {
      const videoUrl = await extractVideoPuppeteer(source.url);
      if (videoUrl) {
        return { videoUrl, quality: source.quality, sources, embedUrl };
      }
    } catch (e) {
      console.warn('Extraction failed for', source.quality, ':', e.message);
    }
  }

  return { videoUrl: null, sources, embedUrl };
}

process.on('exit', () => browser?.close().catch(() => {}));

module.exports = { extractVideoHttp, extractVideoPuppeteer, extractVideoStream };
