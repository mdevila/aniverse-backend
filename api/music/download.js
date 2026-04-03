const music = require('../../lib/music');

// Full convert + wait: returns download URL when ready
// WARNING: This can take 15-30s. Use /convert + /progress for better UX.
module.exports = async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Query parameter "id" (videoId) is required' });

  try {
    const downloadUrl = await music.convert(id);
    if (!downloadUrl) return res.status(500).json({ error: 'Conversion failed' });
    res.json({ downloadUrl });
  } catch (e) {
    console.error('Download error:', e.message);
    res.status(500).json({ error: 'Failed to download', detail: e.message });
  }
};
