const axios = require('axios');

const YT_API_KEY = 'AIzaSyAjzsZgHbxwvHNWt6QfEzswH56iUNV46GY';
const LOADER_API = 'https://loader.to/ajax/download.php';
const PROGRESS_API = 'https://p.savenow.to/api/progress';

// Server-side URL cache: videoId → downloadUrl
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

// Get conversion status (for frontend progress polling)
// Starts conversion if not cached, returns current state
const progressState = new Map(); // videoId → {progress, downloadUrl, progressUrls}

async function getConversionStatus(videoId) {
  // Already done?
  const cached = cache.get(videoId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { status: 'done', progress: 1, downloadUrl: cached.url };
  }

  const state = progressState.get(videoId);

  // Not started? Start it
  if (!state) {
    const jobs = await Promise.allSettled([
      startConversion(videoId, 'mp3'),
      startConversion(videoId, '128'),
    ]);
    const valid = jobs.filter(j => j.status === 'fulfilled' && j.value).map(j => j.value);
    if (!valid.length) return { status: 'error', progress: 0, downloadUrl: null };

    progressState.set(videoId, {
      progress: 0,
      downloadUrl: null,
      progressUrls: valid.map(j => j.progressUrl),
      startedAt: Date.now(),
    });

    // Start background polling
    pollInBackground(videoId);

    return { status: 'converting', progress: 0, downloadUrl: null };
  }

  // In progress
  if (state.downloadUrl) {
    return { status: 'done', progress: 1, downloadUrl: state.downloadUrl };
  }

  return { status: 'converting', progress: state.progress, downloadUrl: null };
}

async function pollInBackground(videoId) {
  const state = progressState.get(videoId);
  if (!state) return;

  const intervals = [300, 300, 500, 500, 800, 1000, 1500, 2000];
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, intervals[Math.min(i, intervals.length - 1)]));

    for (const url of state.progressUrls) {
      try {
        const s = await checkProgress(url);
        state.progress = Math.max(state.progress, s.progress);

        if (s.success && s.downloadUrl) {
          state.downloadUrl = s.downloadUrl;
          state.progress = 1;
          cache.set(videoId, { url: s.downloadUrl, ts: Date.now() });
          return;
        }
      } catch {}
    }
  }

  // Timeout — clean up
  progressState.delete(videoId);
}

module.exports = { searchMusic, startConversion, checkProgress, fastConvert, getConversionStatus };
