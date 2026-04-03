const animepahe = require('../../lib/animepahe');

module.exports = async (req, res) => {
  const { session, page } = req.query;
  if (!session) return res.status(400).json({ error: 'Query parameter "session" is required' });

  try {
    const data = await animepahe.getEpisodes(session, parseInt(page) || 1);
    res.json(data);
  } catch (e) {
    console.error('Episodes error:', e.message);
    res.status(500).json({ error: 'Failed to get episodes', detail: e.message });
  }
};
