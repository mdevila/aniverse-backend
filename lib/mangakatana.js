const cheerio = require('cheerio');
const { get } = require('./http');

const BASE = 'https://mangakatana.com';

async function search(query) {
  const { data: html } = await get(`${BASE}/?search=${encodeURIComponent(query)}&search_by=book_name`);
  const $ = cheerio.load(html);
  const results = [];

  // Single result redirect
  const singleTitle = $('#single_book .info h1.heading').text().trim();
  if (singleTitle) {
    const canonical = $('link[rel="canonical"]').attr('href') || '';
    const poster = $('#single_book .cover img').attr('src') || '';
    const genres = [];
    $('#single_book .info .genres a').each((_, el) => genres.push($(el).text().trim()));
    return [{ title: singleTitle, url: canonical, poster, genres, status: '' }];
  }

  // Multiple results
  $('h3.title a, .item .title a').each((_, el) => {
    const $el = $(el);
    const title = $el.text().trim();
    const url = $el.attr('href') || '';
    if (title && url) results.push({ title, url, poster: '', genres: [], status: '' });
  });

  return results;
}

async function getMangaInfo(mangaUrl) {
  const { data: html } = await get(mangaUrl);
  const $ = cheerio.load(html);

  const title = $('h1.heading').text().trim();
  const poster = $('.cover img').attr('src') || '';
  const description = $('.summary p').text().trim() || $('.summary').text().trim();
  const statusMatch = html.match(/Status:<\/span>\s*<span[^>]*>([^<]+)/i);
  const status = statusMatch?.[1]?.trim() || '';

  const genres = [];
  $('.genres a').each((_, el) => genres.push($(el).text().trim()));

  const chapters = [];
  $('.chapters .chapter a, .chapters tr a').each((_, el) => {
    const chTitle = $(el).text().trim();
    const chUrl = $(el).attr('href') || '';
    if (chTitle && chUrl) chapters.push({ title: chTitle, url: chUrl });
  });

  return { title, poster, description, status, genres, chapters };
}

async function getChapterPages(chapterUrl) {
  const { data: html } = await get(chapterUrl);
  let pages = [];

  // Extract from var thzq=[...] (primary)
  const thzq = html.match(/var\s+thzq\s*=\s*\[([^\]]+)\]/);
  if (thzq) {
    const urls = thzq[1].match(/https?:\/\/[^'"]+/g);
    if (urls?.length) pages = urls;
  }

  // Fallback: var ytaw=[...]
  if (!pages.length) {
    const ytaw = html.match(/var\s+ytaw\s*=\s*\[([^\]]+)\]/);
    if (ytaw) {
      const urls = ytaw[1].match(/https?:\/\/[^'"]+/g);
      if (urls?.length) pages = urls;
    }
  }

  // Fallback: img tags with real src
  if (!pages.length) {
    const $ = cheerio.load(html);
    $('#imgs img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && src !== '#' && src.startsWith('http')) pages.push(src);
    });
  }

  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  const title = titleMatch?.[1]?.trim() || '';

  return { title, pages, totalPages: pages.length };
}

module.exports = { search, getMangaInfo, getChapterPages };
