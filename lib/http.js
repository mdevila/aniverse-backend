// Shared HTTP client with cookie handling and retry logic
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Per-domain cookie jars for session persistence
const jars = {};

function getJar(domain) {
  if (!jars[domain]) jars[domain] = new CookieJar();
  return jars[domain];
}

function createClient(baseURL) {
  const domain = new URL(baseURL).hostname;
  const jar = getJar(domain);
  const client = wrapper(axios.create({
    baseURL,
    jar,
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
    },
    timeout: 15000,
    maxRedirects: 5,
    withCredentials: true,
  }));
  return client;
}

// Retry wrapper with exponential backoff
async function fetchWithRetry(fn, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
}

// Simple GET with cookie support
async function get(url, opts = {}) {
  const domain = new URL(url).hostname;
  const jar = getJar(domain);
  const client = wrapper(axios.create({ jar, withCredentials: true }));
  return fetchWithRetry(() => client.get(url, {
    headers: { 'User-Agent': UA, ...opts.headers },
    timeout: opts.timeout || 15000,
    ...opts,
  }));
}

module.exports = { createClient, fetchWithRetry, get, UA };
