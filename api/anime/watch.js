const animepahe = require('../../lib/animepahe');

module.exports = async (req, res) => {
  const { session, episode } = req.query;
  if (!session || !episode) {
    return res.status(400).json({ error: 'Query parameters "session" and "episode" are required' });
  }

  try {
    const data = await animepahe.getEpisodeSources(session, episode);
    res.json(data);
  } catch (e) {
    console.error('Watch error:', e.message);
    res.status(500).json({ error: 'Failed to get sources', detail: e.message });
  }
};
