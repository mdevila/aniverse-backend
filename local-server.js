// Local Express server that mirrors the Vercel API routes for development
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3690;

app.use(cors());
app.use(express.json());

// Map Vercel API routes to Express
const routes = {
  '/api/health': require('./api/health'),
  '/api/anime/search': require('./api/anime/search'),
  '/api/anime/episodes': require('./api/anime/episodes'),
  '/api/anime/watch': require('./api/anime/watch'),
  '/api/anime/stream': require('./api/anime/stream'),
  '/api/manga/search': require('./api/manga/search'),
  '/api/manga/info': require('./api/manga/info'),
  '/api/manga/chapter': require('./api/manga/chapter'),
  '/api/music/search': require('./api/music/search'),
  '/api/music/convert': require('./api/music/convert'),
  '/api/music/progress': require('./api/music/progress'),
  '/api/music/download': require('./api/music/download'),
  '/api/music/fast': require('./api/music/fast'),
  '/api/proxy/image': require('./api/proxy/image'),
};

Object.entries(routes).forEach(([path, handler]) => {
  app.all(path, handler);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nAniverse Backend running on http://localhost:${PORT}\n`);
  console.log('Endpoints:');
  Object.keys(routes).forEach(r => console.log(`  GET ${r}`));
  console.log('');
});
