const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3690;

app.use(cors());
app.use(express.json());

const handler = require('./api/index');

// Route all /api/* through the single handler
app.all('/api/*', (req, res) => {
  // Vercel passes req.query automatically; Express does too
  handler(req, res);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nAniverse Backend running on http://localhost:${PORT}\n`);
  console.log('All routes handled by /api/index.js');
  console.log('Endpoints: /api/health, /api/anime/*, /api/manga/*, /api/music/*, /api/proxy/*\n');
});
