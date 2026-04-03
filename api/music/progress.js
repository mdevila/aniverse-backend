const music = require('../../lib/music');

module.exports = async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Query parameter "url" (progressUrl) is required' });

  try {
    const status = await music.checkProgress(url);
    res.json(status);
  } catch (e) {
    console.error('Progress error:', e.message);
    res.status(500).json({ error: 'Failed to check progress', detail: e.message });
  }
};
