const music = require('../../lib/music');

module.exports = async (req, res) => {
  const { q, limit } = req.query;
  if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });

  try {
    const results = await music.searchMusic(q, parseInt(limit) || 20);
    res.json({ results });
  } catch (e) {
    console.error('Music search error:', e.message);
    res.status(500).json({ error: 'Failed to search music', detail: e.message });
  }
};
