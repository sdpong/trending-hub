import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

export const LANBUZHU_URL = 'https://lanbuzhu.org/api/data/topics?d=live&cat=';
export const SOPILOT_URL = 'https://sopilot.net/zh/rank/topic';

export function parseLanbuzhu(body) {
  if (body.d !== 'live' || !Array.isArray(body.list)) throw new Error('Invalid topic response');
  const seen = new Set();
  return body.list.flatMap(topic => {
    if (typeof topic.title !== 'string' || !topic.title.trim() || typeof topic.key !== 'string' || !topic.key || seen.has(topic.key)) return [];
    seen.add(topic.key);
    const metrics = [];
    if (Number.isFinite(topic.views)) metrics.push(`${topic.views.toLocaleString('zh-CN')} 曝光`);
    if (Number.isFinite(topic.posts)) metrics.push(`${topic.posts} 帖`);
    return [{ rank: seen.size, title: topic.title.trim(), url: `https://lanbuzhu.org/data/topics/live/${encodeURIComponent(topic.key)}`,
      hot: metrics.join(' · '), platform: 'twitter' }];
  }).slice(0, 30);
}

export function parseSoPilot(html) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const items = [];
  $('a[href^="/zh/rank/topic/"]').each((_, el) => {
    const anchor = $(el);
    const href = anchor.attr('href');
    const title = anchor.text().trim();
    // Ignore footer/detail shortcuts; only topic headings carry this title style.
    if (!anchor.hasClass('font-bold') || !title || !/^\/zh\/rank\/topic\/[^/?#]+$/.test(href) || seen.has(href)) return;
    seen.add(href);
    const text = anchor.parent().parent().text();
    const views = text.match(/([\d.,]+(?:万|亿|K|M)?)\s*曝光/);
    const posts = text.match(/(\d+)\s*帖/);
    items.push({ rank: items.length + 1, title, url: `https://sopilot.net${href}`,
      hot: [views ? `${views[1]}曝光` : '', posts ? `${posts[1]} 帖` : ''].filter(Boolean).join(' · '), platform: 'twitter' });
  });
  return items.slice(0, 30);
}

export async function fetchChineseTopics({ fetchImpl = fetch, timeoutMs = 15000, now = new Date(), warn = console.warn } = {}) {
  const sources = [
    { name: '蓝不住', url: LANBUZHU_URL, type: 'application/json', parse: parseLanbuzhu },
    { name: 'SoPilot', url: SOPILOT_URL, type: 'text/html', parse: parseSoPilot }
  ];
  const errors = [];
  for (const source of sources) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(source.url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: source.type }, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!(res.headers.get('content-type') || '').includes(source.type)) throw new Error(`Expected ${source.type}`);
      const body = source.type === 'application/json' ? await res.json() : await res.text();
      const items = source.parse(body);
      if (!items.length) throw new Error('No topics in response');
      let sourceUpdatedAt = null;
      if (source.name === '蓝不住') {
        const timestamp = Date.parse(body.at);
        if (!Number.isFinite(timestamp) || now.getTime() - timestamp > 86400000 || timestamp - now.getTime() > 300000) throw new Error('Missing or outdated source timestamp');
        sourceUpdatedAt = new Date(timestamp).toISOString();
      }
      return { source: source.name, items, errors, status: 'ok', lastSuccessAt: now.toISOString(), sourceUpdatedAt,
        note: '中文社区话题榜，按来源原有排名展示；不代表 X 全站热榜。',
        actionUrl: source.name === '蓝不住' ? 'https://lanbuzhu.org/data/topics' : SOPILOT_URL,
        actionLabel: `查看${source.name}完整榜单` };
    } catch (error) {
      const message = `${source.name}: ${error.name === 'AbortError' ? 'Request timed out' : error.message}`;
      errors.push(message);
      warn(`Chinese topics failed: ${message}`);
    } finally { clearTimeout(timer); }
  }
  return { source: '', items: [], errors, status: 'error', note: '中文话题源暂不可用，请稍后重试。' };
}
