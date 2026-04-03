const axios = require('axios');
const ytdl = require('@distube/ytdl-core');

const YT_API_KEY = 'AIzaSyAjzsZgHbxwvHNWt6QfEzswH56iUNV46GY';
const LOADER_API = 'https://loader.to/ajax/download.php';
const PROGRESS_API = 'https://p.savenow.to/api/progress';

// Server-side URL cache: videoId → {url, expiresAt}
const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000;

// Active jobs: videoId → Promise<downloadUrl>
const activeJobs = new Map();

async function searchMusic(query, maxResults = 20) {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    q: query,
    maxResults: String(maxResults),
    key: YT_API_KEY,
  });
  const { data } = await axios.get(`https://www.googleapis.com/youtube/v3/search?${params}`);
  return (data.items || []).map(item => ({
    videoId: item.id.videoId,
    title: (item.snippet.title || '')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
    channelTitle: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
  }));
}

async function startConversion(videoId, format = 'mp3') {
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const { data } = await axios.get(LOADER_API, {
    params: { format, url: ytUrl },
    timeout: 10000,
  });
  if (!data.success || !data.id) return null;
  return {
    id: data.id,
    progressUrl: data.progress_url || `${PROGRESS_API}?id=${data.id}`,
    title: data.title || '',
  };
}

async function checkProgress(progressUrl) {
  const { data } = await axios.get(progressUrl, { timeout: 10000 });
  return {
    success: data.success === 1,
    failed: data.success === -1 || data.text === 'Error',
    progress: Math.min((data.progress || 0) / 1000, 1),
    downloadUrl: data.download_url || null,
    text: data.text || '',
  };
}

// Poll a single job until done
async function pollJob(progressUrl) {
  const intervals = [300, 300, 500, 500, 800, 1000, 1500, 2000];
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, intervals[Math.min(i, intervals.length - 1)]));
    try {
      const status = await checkProgress(progressUrl);
      if (status.success && status.downloadUrl) return status.downloadUrl;
      if (status.failed) return null;
    } catch { continue; }
  }
  return null;
}

// Fast convert: cache check → race multiple formats → poll server-side → return URL
// Deduplicates concurrent requests for the same videoId
async function fastConvert(videoId) {
  // Check cache
  const cached = cache.get(videoId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.url;

  // Deduplicate: if already converting this video, wait for it
  if (activeJobs.has(videoId)) return activeJobs.get(videoId);

  const job = (async () => {
    try {
      // Start 3 conversion jobs in parallel (race for speed)
      const starts = await Promise.allSettled([
        startConversion(videoId, 'mp3'),
        startConversion(videoId, '128'),
        startConversion(videoId, 'mp3'),  // duplicate for redundancy
      ]);

      const jobs = starts
        .filter(s => s.status === 'fulfilled' && s.value)
        .map(s => s.value);

      if (!jobs.length) return null;

      // Race all polls — first URL wins
      const url = await Promise.any(
        jobs.map(j => pollJob(j.progressUrl).then(u => {
          if (!u) throw new Error('failed');
          return u;
        }))
      ).catch(() => null);

      if (url) cache.set(videoId, { url, ts: Date.now() });
      return url;
    } finally {
      activeJobs.delete(videoId);
    }
  })();

  activeJobs.set(videoId, job);
  return job;
}

// ============ FAST EXTRACTION (ytdl-core) ============
// Extracts YouTube's raw audio stream URL directly — no conversion needed (~2-3s)

async function extractAudioUrl(videoId) {
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const info = await ytdl.getInfo(ytUrl);

  // Get audio-only formats, sorted by bitrate (highest first)
  const audioFormats = info.formats
    .filter(f => f.hasAudio && !f.hasVideo)
    .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));

  if (audioFormats.length > 0) {
    return {
      url: audioFormats[0].url,
      mimeType: audioFormats[0].mimeType || 'audio/mp4',
      bitrate: audioFormats[0].audioBitrate || 128,
      contentLength: audioFormats[0].contentLength || null,
      duration: info.videoDetails.lengthSeconds,
    };
  }

  // Fallback: any format with audio
  const anyAudio = info.formats
    .filter(f => f.hasAudio)
    .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));

  if (anyAudio.length > 0) {
    return {
      url: anyAudio[0].url,
      mimeType: anyAudio[0].mimeType || 'audio/mp4',
      bitrate: anyAudio[0].audioBitrate || 128,
      contentLength: anyAudio[0].contentLength || null,
      duration: info.videoDetails.lengthSeconds,
    };
  }

  return null;
}

// ============ UNIFIED STATUS ENDPOINT ============
// Tries ytdl-core first (instant), falls back to loader.to (slow)
// Stateless — works on Vercel serverless (no shared memory between requests)

async function getConversionStatus(videoId) {
  // Check cache
  const cached = cache.get(videoId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { status: 'done', progress: 1, downloadUrl: cached.url };
  }

  // Try ytdl-core (fast path — ~2-3 seconds, blocking but fast)
  try {
    const audio = await extractAudioUrl(videoId);
    if (audio?.url) {
      cache.set(videoId, { url: audio.url, ts: Date.now() });
      return { status: 'done', progress: 1, downloadUrl: audio.url };
    }
  } catch (e) {
    console.warn('ytdl-core failed:', e.message);
  }

  // Fallback: start loader.to and return converting status
  // Frontend will poll this endpoint again; on next call, loader.to job
  // won't have a cached result yet, so it'll start/check again
  try {
    const job = await startConversion(videoId, 'mp3');
    if (job) {
      // Poll inline a few times (up to 10s) to see if it finishes fast
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const s = await checkProgress(job.progressUrl);
        if (s.success && s.downloadUrl) {
          cache.set(videoId, { url: s.downloadUrl, ts: Date.now() });
          return { status: 'done', progress: 1, downloadUrl: s.downloadUrl };
        }
        if (s.failed) break;
      }
      return { status: 'converting', progress: 0.3, downloadUrl: null };
    }
  } catch {}

  return { status: 'error', progress: 0, downloadUrl: null };
}

module.exports = { searchMusic, startConversion, checkProgress, fastConvert, getConversionStatus, extractAudioUrl };
