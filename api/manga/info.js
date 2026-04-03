const mangakatana = require('../../lib/mangakatana');

module.exports = async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Query parameter "url" is required' });

  try {
    const info = await mangakatana.getMangaInfo(url);
    res.json(info);
  } catch (e) {
    console.error('Manga info error:', e.message);
    res.status(500).json({ error: 'Failed to get manga info', detail: e.message });
  }
};
