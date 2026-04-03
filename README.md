# Aniverse Backend

Backend API for the Aniverse mobile app. Handles anime watching, manga reading, and music downloading via web scraping and third-party APIs.

Deployable to **Vercel** as serverless functions.

## API Endpoints

### Health
| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |

### Anime (AnimePahe)
| Endpoint | Params | Description |
|----------|--------|-------------|
| `GET /api/anime/search` | `q` | Search anime |
| `GET /api/anime/episodes` | `session`, `page` | Get episode list |
| `GET /api/anime/watch` | `session`, `episode` | Get video sources |

> **Note:** AnimePahe uses DDoS-Guard protection. Server-side requests may return 403. The mobile app uses a hidden WebView as fallback for anime scraping. These endpoints work when DDoS-Guard cookies are obtained.

### Manga (MangaKatana)
| Endpoint | Params | Description |
|----------|--------|-------------|
| `GET /api/manga/search` | `q` | Search manga |
| `GET /api/manga/info` | `url` | Get manga details + chapter list |
| `GET /api/manga/chapter` | `url` | Get chapter page images |

### Music (YouTube + loader.to)
| Endpoint | Params | Description |
|----------|--------|-------------|
| `GET /api/music/search` | `q`, `limit` | Search YouTube music videos |
| `GET /api/music/convert` | `id`, `format` | Start MP3 conversion (returns job ID) |
| `GET /api/music/progress` | `url` | Check conversion progress |
| `GET /api/music/download` | `id` | Full convert + wait (slow, use convert+progress instead) |

### Proxy
| Endpoint | Params | Description |
|----------|--------|-------------|
| `GET /api/proxy/image` | `url` | Proxy images with correct Referer header |

## Music Download Flow

```
1. POST /api/music/convert?id={videoId}
   → Returns: { id, progressUrl }

2. Poll GET /api/music/progress?url={progressUrl}
   → Returns: { success, progress (0-1), downloadUrl }

3. When success === true, downloadUrl contains the MP3 file
```

## Local Development

### Prerequisites
- Node.js 18+
- npm

### Setup
```bash
cd aniverse-backend
npm install
```

### Run locally
```bash
# Express server on port 3690
npm start

# Or with Vercel CLI
npm run dev
```

### Test
```bash
# Test against local server
npm test

# Test against deployed URL
node test-api.js https://your-app.vercel.app
```

## Deploy to Vercel

### Option 1: Vercel CLI

```bash
# Install Vercel CLI globally
npm i -g vercel

# Login to Vercel
vercel login

# Deploy from the project directory
cd aniverse-backend
vercel

# Deploy to production
vercel --prod
```

### Option 2: GitHub Integration

1. Push `aniverse-backend` to a GitHub repository
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import the repository
4. Set the root directory to `aniverse-backend` (if it's in a monorepo)
5. Click **Deploy**

### Option 3: Manual Deploy

```bash
# From the aniverse-backend directory
vercel deploy --prod
```

### Environment Variables (Optional)

Set these in the Vercel dashboard under **Settings > Environment Variables** if you want to customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `YT_API_KEY` | Built-in | YouTube Data API v3 key |

### Vercel Configuration

The `vercel.json` is pre-configured with:
- CORS headers for cross-origin requests
- API route rewrites
- 60s cache with stale-while-revalidate

### Post-Deploy

After deploying, update the `BACKEND_URL` in your Aniverse mobile app to point to your Vercel deployment:

```
https://your-app-name.vercel.app
```

## Project Structure

```
aniverse-backend/
├── api/                    # Vercel serverless functions
│   ├── health.js
│   ├── anime/
│   │   ├── search.js       # AnimePahe search
│   │   ├── episodes.js     # Episode list
│   │   └── watch.js        # Video sources
│   ├── manga/
│   │   ├── search.js       # MangaKatana search
│   │   ├── info.js         # Manga details + chapters
│   │   └── chapter.js      # Chapter page images
│   ├── music/
│   │   ├── search.js       # YouTube music search
│   │   ├── convert.js      # Start MP3 conversion
│   │   ├── progress.js     # Check conversion progress
│   │   └── download.js     # Full convert (blocking)
│   └── proxy/
│       └── image.js        # Image proxy with Referer
├── lib/                    # Shared scraping libraries
│   ├── http.js             # HTTP client with cookies + retry
│   ├── animepahe.js        # AnimePahe scraper
│   ├── mangakatana.js      # MangaKatana scraper
│   └── music.js            # YouTube search + loader.to
├── local-server.js         # Express dev server
├── test-api.js             # API test script
├── package.json
├── vercel.json             # Vercel deployment config
└── README.md
```

## Tech Stack

- **Runtime:** Node.js 18+ (Vercel Serverless Functions)
- **Scraping:** Cheerio + Axios with cookie jar support
- **HTTP:** Axios + tough-cookie for session persistence
- **Music:** YouTube Data API v3 + loader.to conversion
- **Proxy:** Axios for image proxying with Referer headers

## Test Results

```
PASS  Health check
PASS  Manga search
PASS  Manga info
PASS  Manga chapter pages
PASS  Music search (YouTube)
PASS  Music convert start
FAIL  Anime search (DDoS-Guard 403 — expected from server)
```

6/7 endpoints working. Anime requires frontend WebView fallback due to DDoS-Guard.
