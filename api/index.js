// Single serverless function that handles all routes (Vercel Hobby: max 12 functions)
const animepahe = require('../lib/animepahe');
const mangakatana = require('../lib/mangakatana');
const music = require('../lib/music');
const axios = require('axios');

// video-extractor uses puppeteer (devDependency) — only available locally, not on Vercel
let videoExtractor = null;
if (process.env.LOCAL_DEV) {
  try { videoExtractor = require('../lib/video-extractor.local'); } catch {}
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url.split('?')[0].replace(/^\/api/, '');
  const q = req.query;

  try {
    // ---- Health ----
    if (url === '/health') {
      return res.json({ status: 'ok', timestamp: Date.now(), version: '1.0.0' });
    }

    // ---- Anime ----
    if (url === '/anime/search') {
      if (!q.q) return res.status(400).json({ error: '"q" required' });
      return res.json({ results: await animepahe.search(q.q) });
    }
    if (url === '/anime/episodes') {
      if (!q.session) return res.status(400).json({ error: '"session" required' });
      return res.json(await animepahe.getEpisodes(q.session, parseInt(q.page) || 1));
    }
    if (url === '/anime/watch') {
      if (!q.session || !q.episode) return res.status(400).json({ error: '"session" and "episode" required' });
      return res.json(await animepahe.getEpisodeSources(q.session, q.episode));
    }
    if (url === '/anime/stream') {
      if (!q.session || !q.episode) return res.status(400).json({ error: '"session" and "episode" required' });
      if (!videoExtractor) return res.status(501).json({ error: 'Puppeteer not available in this environment' });
      return res.json(await videoExtractor.extractVideoStream(q.session, q.episode));
    }

    // ---- Manga ----
    if (url === '/manga/search') {
      if (!q.q) return res.status(400).json({ error: '"q" required' });
      return res.json({ results: await mangakatana.search(q.q) });
    }
    if (url === '/manga/info') {
      if (!q.url) return res.status(400).json({ error: '"url" required' });
      return res.json(await mangakatana.getMangaInfo(q.url));
    }
    if (url === '/manga/chapter') {
      if (!q.url) return res.status(400).json({ error: '"url" required' });
      return res.json(await mangakatana.getChapterPages(q.url));
    }

    // ---- Music ----
    if (url === '/music/search') {
      if (!q.q) return res.status(400).json({ error: '"q" required' });
      return res.json({ results: await music.searchMusic(q.q, parseInt(q.limit) || 20) });
    }
    if (url === '/music/convert') {
      if (!q.id) return res.status(400).json({ error: '"id" required' });
      const job = await music.startConversion(q.id, q.format || 'mp3');
      if (!job) return res.status(500).json({ error: 'Conversion start failed' });
      return res.json(job);
    }
    if (url === '/music/progress') {
      if (!q.url) return res.status(400).json({ error: '"url" required' });
      return res.json(await music.checkProgress(q.url));
    }
    if (url === '/music/fast') {
      if (!q.id) return res.status(400).json({ error: '"id" required' });
      return res.json(await music.getConversionStatus(q.id));
    }
    if (url === '/music/download') {
      if (!q.id) return res.status(400).json({ error: '"id" required' });
      const downloadUrl = await music.fastConvert(q.id);
      if (!downloadUrl) return res.status(500).json({ error: 'Conversion failed' });
      return res.json({ downloadUrl });
    }

    // ---- Proxy ----
    if (url === '/proxy/image') {
      if (!q.url) return res.status(400).json({ error: '"url" required' });
      const origin = new URL(q.url).origin;
      const response = await axios.get(q.url, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': origin },
        timeout: 15000,
      });
      res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      return res.send(Buffer.from(response.data));
    }

    // ---- 404 ----
    return res.status(404).json({ error: 'Not found', path: url });
  } catch (e) {
    console.error(`Error [${url}]:`, e.message);
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
};
