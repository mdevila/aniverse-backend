const { extractVideoStream } = require('../../lib/video-extractor');

module.exports = async (req, res) => {
  const { session, episode } = req.query;
  if (!session || !episode) {
    return res.status(400).json({ error: 'Query parameters "session" and "episode" are required' });
  }

  try {
    const result = await extractVideoStream(session, episode);
    res.json(result);
  } catch (e) {
    console.error('Stream extraction error:', e.message);
    res.status(500).json({ error: 'Failed to extract video stream', detail: e.message });
  }
};
