const music = require('../../lib/music');

module.exports = async (req, res) => {
  const { id, format } = req.query;
  if (!id) return res.status(400).json({ error: 'Query parameter "id" (videoId) is required' });

  try {
    // Start conversion job(s)
    const job = await music.startConversion(id, format || 'mp3');
    if (!job) return res.status(500).json({ error: 'Failed to start conversion' });
    res.json(job);
  } catch (e) {
    console.error('Convert error:', e.message);
    res.status(500).json({ error: 'Failed to convert', detail: e.message });
  }
};
