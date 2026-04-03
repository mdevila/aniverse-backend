// Test script for all API endpoints
const BASE = process.argv[2] || 'http://localhost:3690';

async function test(name, url) {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${BASE}${url}`, { signal: controller.signal });
    clearTimeout(timeout);
    const elapsed = Date.now() - start;
    const text = await res.text();
    const ok = res.ok;
    const preview = text.slice(0, 150);
    console.log(`${ok ? 'PASS' : 'FAIL'} [${elapsed}ms] ${name}`);
    console.log(`  ${res.status} ${preview}...\n`);
    return { name, ok, elapsed };
  } catch (e) {
    clearTimeout(timeout);
    const elapsed = Date.now() - start;
    console.log(`FAIL [${elapsed}ms] ${name}`);
    console.log(`  Error: ${e.message}\n`);
    return { name, ok: false, elapsed };
  }
}

async function run() {
  console.log(`\nTesting Aniverse Backend: ${BASE}\n${'='.repeat(50)}\n`);

  const results = [];

  // Health
  results.push(await test('Health check', '/api/health'));

  // Manga (no DDoS protection — most reliable)
  results.push(await test('Manga search', '/api/manga/search?q=solo+leveling'));
  results.push(await test('Manga info', '/api/manga/info?url=https://mangakatana.com/manga/solo-leveling.21708'));
  results.push(await test('Manga chapter', '/api/manga/chapter?url=https://mangakatana.com/manga/solo-leveling.21708/c1'));

  // Music
  results.push(await test('Music search', '/api/music/search?q=never+gonna+give+you+up&limit=3'));
  results.push(await test('Music convert start', '/api/music/convert?id=dQw4w9WgXcQ'));

  // Anime (may fail due to DDoS-Guard)
  results.push(await test('Anime search', '/api/anime/search?q=naruto'));

  // Summary
  console.log('='.repeat(50));
  const passed = results.filter(r => r.ok).length;
  console.log(`\nResults: ${passed}/${results.length} passed`);
  results.filter(r => !r.ok).forEach(r => console.log(`  FAILED: ${r.name}`));
  console.log('');
}

run();
