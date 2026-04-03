const puppeteer = require('puppeteer-core');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

let browser = null;

function findChromePath() {
  // Try chromium npm package first
  try {
    const chromium = require('chromium');
    if (chromium.path) return chromium.path;
  } catch {}

  // Common Linux paths (Railway/Docker)
  const fs = require('fs');
  const paths = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    process.env.CHROME_PATH,
  ].filter(Boolean);

  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

async function getBrowser() {
  if (browser && browser.connected) return browser;

  const executablePath = findChromePath();
  if (!executablePath) throw new Error('No Chrome/Chromium binary found');

  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
  });
  return browser;
}

// Extract direct video URL from a kwik embed page
async function extractVideoFromKwik(kwikUrl, referer = 'https://animepahe.com') {
  const b = await getBrowser();
  const page = await b.newPage();
  let videoUrl = null;

  try {
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ Referer: referer });

    // Intercept network requests to catch the video stream URL
    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = req.url();
      // Block ads/trackers to speed up loading
      if (/doubleclick|googlesyndication|popads|adsterra|exoclick|trafficjunky/.test(url)) {
        req.abort();
        return;
      }
      // Capture video URLs
      if (/\.(m3u8|mp4|ts)(\?|$)/.test(url) || url.includes('uwu.m3u8') || url.includes('/hls/')) {
        if (!videoUrl) videoUrl = url;
      }
      req.continue();
    });

    // Navigate to kwik page
    await page.goto(kwikUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

    // Wait for DDoS-Guard if present
    const isDdg = await page.evaluate(() => document.title.includes('DDoS-Guard'));
    if (isDdg) {
      await page.waitForFunction(() => !document.title.includes('DDoS-Guard'), { timeout: 15000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
    }

    // Wait for video element or intercepted URL
    await page.waitForSelector('video, source, .plyr', { timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    // Try to extract from DOM if not intercepted
    if (!videoUrl) {
      videoUrl = await page.evaluate(() => {
        // Check source tags
        const source = document.querySelector('video source');
        if (source?.src) return source.src;

        // Check video element
        const video = document.querySelector('video');
        if (video?.src && video.src.startsWith('http')) return video.src;

        // Check page scripts for m3u8/mp4 URLs
        const html = document.documentElement.innerHTML;
        const m3u8 = html.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/);
        if (m3u8) return m3u8[0];
        const mp4 = html.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/);
        if (mp4) return mp4[0];

        return null;
      });
    }

    // Try clicking play button if video hasn't loaded
    if (!videoUrl) {
      await page.click('button.plyr__control--overlaid, .play-button, [data-plyr="play"]').catch(() => {});
      await new Promise(r => setTimeout(r, 3000));
      videoUrl = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.src || null;
      });
    }
  } catch (e) {
    console.error('Kwik extraction error:', e.message);
  } finally {
    await page.close();
  }

  return videoUrl;
}

// Full flow: get sources from AnimePahe play page, then extract video from kwik
async function extractVideoStream(animeSession, episodeSession) {
  const animepahe = require('./animepahe');
  const { sources, embedUrl } = await animepahe.getEpisodeSources(animeSession, episodeSession);

  if (!sources.length) {
    return { videoUrl: null, sources: [], embedUrl };
  }

  // Try each source to extract direct video URL
  for (const source of sources) {
    try {
      const videoUrl = await extractVideoFromKwik(source.url);
      if (videoUrl) {
        return {
          videoUrl,
          quality: source.quality,
          sources,
          embedUrl,
        };
      }
    } catch (e) {
      console.warn(`Failed to extract from ${source.quality}:`, e.message);
    }
  }

  // Return sources without direct URL as fallback
  return { videoUrl: null, sources, embedUrl };
}

// Cleanup
process.on('exit', () => browser?.close().catch(() => {}));
process.on('SIGINT', () => { browser?.close().catch(() => {}); process.exit(); });

module.exports = { extractVideoFromKwik, extractVideoStream };
