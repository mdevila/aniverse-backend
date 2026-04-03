const axios = require('axios');

// Image proxy for manga pages that need a specific Referer header
module.exports = async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL parameter is required' });

  try {
    const origin = new URL(url).origin;
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': origin,
      },
      timeout: 15000,
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.send(Buffer.from(response.data));
  } catch (e) {
    console.error('Proxy error:', e.message);
    res.status(500).json({ error: 'Failed to proxy image' });
  }
};
