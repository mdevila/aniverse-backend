const cheerio = require('cheerio');
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

const BASE = 'https://animepahe.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Persistent cookie jar and client
const jar = new CookieJar();
const client = wrapper(axios.create({
  jar,
  withCredentials: true,
  timeout: 15000,
  headers: { 'User-Agent': UA, 'Referer': BASE + '/' },
}));

let sessionReady = false;
let sessionPromise = null;

// Solve DDoS-Guard JS challenge
async function solveDDoSGuard() {
  // Step 1: Hit main page to get initial cookies
  await client.get(BASE, { validateStatus: () => true });

  // Step 2: Fetch check.js to get the challenge ID
  const checkRes = await client.get('https://check.ddos-guard.net/check.js', {
    headers: { 'User-Agent': UA, 'Referer': BASE + '/' },
  });
  const id = checkRes.data.match(/id\/([A-Za-z0-9]+)/)?.[1];
  if (!id) throw new Error('Could not extract DDoS-Guard challenge ID');

  // Step 3: Hit both verification endpoints (simulates what the browser JS does)
  await Promise.all([
    client.get(`${BASE}/.well-known/ddos-guard/id/${id}`, { validateStatus: () => true }),
    client.get(`https://check.ddos-guard.net/set/id/${id}`, { validateStatus: () => true }),
  ]);

  // Step 4: Verify we can access the real page
  const verifyRes = await client.get(BASE, { validateStatus: () => true });
  if (verifyRes.status !== 200 || verifyRes.data.includes('DDoS-Guard')) {
    throw new Error('DDoS-Guard bypass failed');
  }
}

async function ensureSession() {
  if (sessionReady) return;
  // Deduplicate concurrent session init calls
  if (!sessionPromise) {
    sessionPromise = (async () => {
      try {
        await solveDDoSGuard();
        sessionReady = true;
      } catch (e) {
        console.warn('DDoS-Guard bypass failed, retrying...', e.message);
        // Retry once
        await solveDDoSGuard();
        sessionReady = true;
      } finally {
        sessionPromise = null;
      }
    })();
  }
  await sessionPromise;
}

// Reset session (call if requests start failing with 403)
function resetSession() {
  sessionReady = false;
}

async function search(query) {
  await ensureSession();
  try {
    const { data } = await client.get(`${BASE}/api`, { params: { m: 'search', q: query } });
    if (!data || !data.data) return [];
    return data.data.map(item => ({
      id: item.id,
      session: item.session,
      title: item.title,
      type: item.type,
      episodes: item.episodes,
      status: item.status,
      season: item.season,
      year: item.year,
      poster: item.poster,
    }));
  } catch (e) {
    if (e.response?.status === 403) {
      // Session expired, retry
      resetSession();
      await ensureSession();
      const { data } = await client.get(`${BASE}/api`, { params: { m: 'search', q: query } });
      if (!data || !data.data) return [];
      return data.data.map(item => ({
        id: item.id, session: item.session, title: item.title,
        type: item.type, episodes: item.episodes, status: item.status,
        season: item.season, year: item.year, poster: item.poster,
      }));
    }
    throw e;
  }
}

async function getEpisodes(session, page = 1) {
  await ensureSession();
  const { data } = await client.get(`${BASE}/api`, {
    params: { m: 'release', id: session, sort: 'episode_asc', page },
  });
  if (!data || !data.data) return { episodes: [], totalPages: 1, total: 0 };
  return {
    episodes: data.data.map(ep => ({
      id: ep.id, session: ep.session, episode: ep.episode,
      title: ep.title || `Episode ${ep.episode}`,
      snapshot: ep.snapshot, duration: ep.duration, createdAt: ep.created_at,
    })),
    totalPages: data.last_page || 1,
    currentPage: data.current_page || 1,
    total: data.total || 0,
  };
}

async function getEpisodeSources(animeSession, episodeSession) {
  await ensureSession();
  const url = `/play/${animeSession}/${episodeSession}`;
  const { data: html } = await client.get(`${BASE}${url}`);
  const $ = cheerio.load(html);
  const sources = [];

  $('#resolutionMenu button').each((_, el) => {
    const quality = $(el).text().trim();
    const kwikUrl = $(el).attr('data-src');
    if (kwikUrl) sources.push({ quality, url: kwikUrl });
  });

  if (!sources.length) {
    $('#pickDownload a').each((_, el) => {
      const href = $(el).attr('href');
      const quality = $(el).text().trim();
      if (href) sources.push({ quality: quality || 'default', url: href });
    });
  }

  if (!sources.length) {
    $('script').each((_, el) => {
      const content = $(el).html() || '';
      const matches = content.match(/https?:\/\/kwik\.[a-z]+\/[^\s"']+/g);
      if (matches) matches.forEach(u => sources.push({ quality: 'default', url: u }));
    });
  }

  return { sources, embedUrl: `${BASE}${url}` };
}

module.exports = { search, getEpisodes, getEpisodeSources };
