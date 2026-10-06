import fetch from 'node-fetch';

export const ZHIHU_HOT_URL = 'https://www.zhihu.com/api/v3/feed/topstory/hot-list-web?limit=30&desktop=true';

export function parseZhihuHot(body) {
  if (!Array.isArray(body?.data)) throw new Error('Invalid hot-list response');
  const items = [];
  const seen = new Set();
  for (const row of body.data) {
    const target = row.target;
    const title = target?.title_area?.text?.trim();
    const url = target?.link?.url;
    if (!title || !/^https:\/\/www\.zhihu\.com\/question\/\d+$/.test(url || '') || seen.has(url)) continue;
    seen.add(url);
    items.push({ rank: items.length + 1, title, url, hot: target.metrics_area?.text || '', platform: 'zhihu' });
    if (items.length === 30) break;
  }
  if (!items.length) throw new Error('No valid questions in hot list');
  return items;
}

export async function fetchZhihuTrends({ fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(ZHIHU_HOT_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json', Referer: 'https://www.zhihu.com/hot' },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseZhihuHot(await res.json());
    return { items, source: '知乎网页热榜', status: 'ok', lastSuccessAt: new Date().toISOString() };
  } catch (error) {
    console.warn(`Zhihu hot list failed: ${error.message}`);
    return { items: [], source: '', status: 'error', errors: [error.name === 'AbortError' ? 'Request timed out' : error.message] };
  } finally {
    clearTimeout(timer);
  }
}
