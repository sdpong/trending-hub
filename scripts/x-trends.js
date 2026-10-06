import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const searchUrl = title => `https://x.com/search?q=${encodeURIComponent(title)}&src=trend_click`;

function normalize(rows) {
  const seen = new Set();
  return rows.flatMap(row => {
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    if (!title || seen.has(title)) return [];
    seen.add(title);
    return [{ rank: seen.size, title, url: searchUrl(title), hot: row.hot || '', platform: 'twitter' }];
  }).slice(0, 30);
}

export function parseGetDayTrends(html) {
  const $ = cheerio.load(html);
  const rows = [];
  // Only the current ranking tables, including the collapsed ranks 16–50.
  // Exclude the separate 24-hour "Most Tweeted" and "Longest Trending" tables.
  $('table.trends tr').each((_, el) => {
    rows.push({ title: $(el).find('td.main a[href*="/trend/"]').first().text() });
  });
  return normalize(rows);
}

export function parseOfficialTrends(body) {
  if (!Array.isArray(body.data)) throw new Error('Invalid X API data');
  return normalize(body.data.map(row => ({
    title: row.trend_name,
    hot: Number.isFinite(row.tweet_count) ? `${row.tweet_count.toLocaleString('en-US')} posts` : ''
  })));
}

async function request(url, type, headers, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!(res.headers.get('content-type') || '').includes(type)) throw new Error(`Expected ${type}`);
    // Keep the timeout active while reading the body, too.
    return type === 'application/json' ? await res.json() : await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTwitterTrends({ env = process.env, fetchImpl = fetch, timeoutMs = 15000, warn = console.warn } = {}) {
  const sources = [];
  if (env.X_BEARER_TOKEN) {
    const woeid = env.X_WOEID || '1';
    sources.push({ name: 'X API', load: async () => {
      if (!/^\d+$/.test(woeid)) throw new Error('Invalid X_WOEID');
      const body = await request(`https://api.x.com/2/trends/by/woeid/${woeid}?max_trends=30&trend.fields=trend_name,tweet_count`,
        'application/json', { Authorization: `Bearer ${env.X_BEARER_TOKEN}` }, fetchImpl, timeoutMs);
      return parseOfficialTrends(body);
    } });
  }
  sources.push({ name: 'GetDayTrends', load: async () => {
    const region = env.X_GETDAYTRENDS_REGION || '';
    if (region && !/^[a-z]+(?:-[a-z]+)*$/.test(region)) throw new Error('Invalid X_GETDAYTRENDS_REGION');
    const html = await request(`https://getdaytrends.com/${region ? `${region}/` : ''}`,
      'text/html', { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }, fetchImpl, timeoutMs);
    return parseGetDayTrends(html);
  } });
  const errors = [];
  for (const source of sources) {
    try {
      const items = await source.load();
      if (!items.length) throw new Error('No trends in response');
      return { items, source: source.name, errors, status: 'ok', lastSuccessAt: new Date().toISOString() };
    } catch (error) {
      // Do not expose request headers, tokens, or upstream response bodies.
      const message = `${source.name}: ${error.name === 'AbortError' ? 'Request timed out' : error.message}`;
      errors.push(message);
      warn(`X trends failed: ${message}`);
    }
  }
  return { items: [], source: '', errors, status: 'error' };
}

export function mergeTwitterSnapshot(result, previous = {}, previousUpdatedAt) {
  if (result.status === 'ok') return result;
  const items = Array.isArray(previous.items) ? previous.items : [];
  return {
    ...result, items, source: previous.source || '',
    status: items.length ? 'stale' : 'error',
    lastSuccessAt: previous.lastSuccessAt || (items.length ? previousUpdatedAt : null)
  };
}
