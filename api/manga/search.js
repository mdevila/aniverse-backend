const mangakatana = require('../../lib/mangakatana');

module.exports = async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });

  try {
    const results = await mangakatana.search(q);
    res.json({ results });
  } catch (e) {
    console.error('Manga search error:', e.message);
    res.status(500).json({ error: 'Failed to search manga', detail: e.message });
  }
};
