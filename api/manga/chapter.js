const mangakatana = require('../../lib/mangakatana');

module.exports = async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Query parameter "url" is required' });

  try {
    const chapter = await mangakatana.getChapterPages(url);
    res.json(chapter);
  } catch (e) {
    console.error('Chapter error:', e.message);
    res.status(500).json({ error: 'Failed to get chapter', detail: e.message });
  }
};
