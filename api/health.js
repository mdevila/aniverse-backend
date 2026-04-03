module.exports = (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), version: '1.0.0' });
};
