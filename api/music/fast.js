const { getConversionStatus } = require('../../lib/music');

// Single endpoint for the frontend to poll.
// First call starts conversion, subsequent calls return progress.
// When done, returns downloadUrl.
module.exports = async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Query parameter "id" (videoId) is required' });

  try {
    const status = await getConversionStatus(id);
    res.json(status);
  } catch (e) {
    console.error('Fast convert error:', e.message);
    res.status(500).json({ error: 'Conversion failed', detail: e.message });
  }
};
