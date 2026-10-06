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

export function directXUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'].includes(url.hostname)) return null;
    if (!/^\/(?:[A-Za-z0-9_]+|i\/web)\/status\/\d+\/?$/.test(url.pathname)) return null;
    return `https://x.com${url.pathname.replace(/\/$/, '')}`;
  } catch { return null; }
}

export function parseLanbuzhuExample(body) {
  if (!Array.isArray(body.top)) throw new Error('Missing examples');
  const post = body.top.filter(p => directXUrl(p.url)).sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0))[0];
  if (!post) throw new Error('No X example');
  return { url: directXUrl(post.url), hot: `爆款范本${post.account?.handle ? ` · @${post.account.handle}` : ''}${Number.isFinite(post.views) ? ` · ${post.views.toLocaleString('zh-CN')} 原帖曝光` : ''}` };
}

export function parseSoPilotExample(html) {
  const $ = cheerio.load(html);
  let example;
  $('a[href]').each((_, el) => {
    if (example) return;
    const anchor = $(el);
    const url = directXUrl(anchor.attr('href'));
    if (url && anchor.text().trim().length > 20 && !/[?]/.test(anchor.attr('href'))) example = { url, hot: '来源关联推文 · 直达 X 原帖' };
  });
  if (!example) throw new Error('No X example');
  return example;
}

async function read(url, type, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: type }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!(res.headers.get('content-type') || '').includes(type)) throw new Error(`Expected ${type}`);
    return type === 'application/json' ? await res.json() : await res.text();
  } finally { clearTimeout(timer); }
}

export async function fetchChineseTopics({ fetchImpl = fetch, timeoutMs = 15000, now = new Date(), warn = console.warn, previous = {} } = {}) {
  const sources = [
    { name: '蓝不住', url: LANBUZHU_URL, type: 'application/json', parse: parseLanbuzhu },
    { name: 'SoPilot', url: SOPILOT_URL, type: 'text/html', parse: parseSoPilot }
  ];
  const errors = [];
  for (const source of sources) {
    try {
      const body = await read(source.url, source.type, fetchImpl, timeoutMs);
      let items = source.parse(body);
      if (!items.length) throw new Error('No topics in response');
      let sourceUpdatedAt = null;
      if (source.name === '蓝不住') {
        const timestamp = Date.parse(body.at);
        if (!Number.isFinite(timestamp) || now.getTime() - timestamp > 86400000 || timestamp - now.getTime() > 300000) throw new Error('Missing or outdated source timestamp');
        sourceUpdatedAt = new Date(timestamp).toISOString();
      }
      const old = new Map(previous.source === source.name ? (previous.items || []).map(item => [item.topicUrl, item]) : []);
      const linked = new Array(items.length);
      let next = 0;
      // Three workers bound detail requests. Cache links independently from fetch success time.
      await Promise.all(Array.from({ length: Math.min(3, items.length) }, async () => {
        while (next < items.length) {
          const index = next++;
          const item = items[index];
          const cached = old.get(item.url);
          const age = now.getTime() - Date.parse(cached?.postFetchedAt);
          const reusable = cached && directXUrl(cached.url) && age >= 0 && age < 7200000 &&
            (source.name !== '蓝不住' || previous.sourceUpdatedAt === sourceUpdatedAt);
          if (reusable) {
            linked[index] = { ...item, topicUrl: item.url, url: cached.url, hot: cached.hot, postFetchedAt: cached.postFetchedAt };
            continue;
          }
          try {
            const detailUrl = source.name === '蓝不住' ? item.url.replace('/data/topics/', '/api/data/topics/') : item.url;
            const detail = await read(detailUrl, source.type, fetchImpl, Math.min(timeoutMs, 10000));
            const example = source.name === '蓝不住' ? parseLanbuzhuExample(detail) : parseSoPilotExample(detail);
            linked[index] = { ...item, ...example, topicUrl: item.url, postFetchedAt: now.toISOString() };
          } catch {
            if (cached && directXUrl(cached.url)) linked[index] = { ...item, topicUrl: item.url, url: cached.url, hot: `${cached.hot} · 链接沿用上次缓存`, postFetchedAt: cached.postFetchedAt };
          }
        }
      }));
      const missing = items.length - linked.filter(Boolean).length;
      if (missing) errors.push(`${source.name}: ${missing} topics missing X examples`);
      items = linked.filter(Boolean);
      if (!items.length) throw new Error('No direct X examples');
      return { source: source.name, items, errors, status: 'ok', lastSuccessAt: now.toISOString(), sourceUpdatedAt,
        note: source.name === '蓝不住' ? '话题按来源排名展示，点击直达该话题曝光最高的爆款范本；不代表 X 全站热榜。' : '话题按来源排名展示，点击直达来源关联的 X 推文；不代表 X 全站热榜。',
        actionUrl: source.name === '蓝不住' ? 'https://lanbuzhu.org/data/topics' : SOPILOT_URL,
        actionLabel: `查看${source.name}完整榜单` };
    } catch (error) {
      const message = `${source.name}: ${error.name === 'AbortError' ? 'Request timed out' : error.message}`;
      errors.push(message);
      warn(`Chinese topics failed: ${message}`);
    }
  }
  return { source: '', items: [], errors, status: 'error', note: '中文话题源暂不可用，请稍后重试。' };
}
