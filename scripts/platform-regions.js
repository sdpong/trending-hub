import fetch from 'node-fetch';
import { mergeTwitterSnapshot } from './x-trends.js';

export const ZH_QUERY = '(的 OR 是 OR 了 OR 在 OR 有 OR 和 OR 不 OR 我) lang:zh -is:retweet';

export function parseChinesePosts(body) {
  if (!Array.isArray(body.data)) {
    if (body.meta?.result_count === 0) return [];
    throw new Error('Invalid search response');
  }
  const seen = new Set();
  return body.data.filter(post => {
    if (post.lang !== 'zh' || !/^\d+$/.test(post.id) || typeof post.text !== 'string' || seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  }).sort((a, b) => score(b) - score(a)).slice(0, 30).map((post, index) => ({
    rank: index + 1, title: post.text, url: `https://x.com/i/status/${post.id}`,
    hot: `${score(post).toLocaleString('en-US')} 次互动`, platform: 'twitter'
  }));
}

function score(post) {
  const m = post.public_metrics || {};
  return ['like_count', 'retweet_count', 'reply_count', 'quote_count'].reduce((sum, key) => sum + (Number.isFinite(m[key]) ? m[key] : 0), 0);
}

export async function fetchChinesePosts({ env = process.env, fetchImpl = fetch, timeoutMs = 15000, now = new Date() } = {}) {
  const base = {
    source: 'X 中文搜索', items: [], errors: [], status: 'unconfigured',
    note: '最近 24 小时中文搜索样本，按互动数排序；不是全站中文热榜。',
    actionUrl: `https://x.com/search?q=${encodeURIComponent(env.X_ZH_QUERY || ZH_QUERY)}`,
    actionLabel: '在 X 查看中文内容'
  };
  if (!env.X_BEARER_TOKEN) return { ...base, note: '中文内容暂未接入，先在 X 查看中文搜索。' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL('https://api.x.com/2/tweets/search/recent');
    url.search = new URLSearchParams({ query: env.X_ZH_QUERY || ZH_QUERY, max_results: '100',
      'tweet.fields': 'lang,public_metrics,created_at', sort_order: 'relevancy',
      start_time: new Date(now.getTime() - 86400000).toISOString() }).toString();
    const res = await fetchImpl(url.toString(), { headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!(res.headers.get('content-type') || '').includes('application/json')) throw new Error('Expected JSON');
    const items = parseChinesePosts(await res.json());
    return { ...base, items, status: items.length ? 'ok' : 'empty', lastSuccessAt: now.toISOString() };
  } catch (error) {
    return { ...base, status: 'error', errors: [error.name === 'AbortError' ? 'Request timed out' : error.message] };
  } finally { clearTimeout(timer); }
}

export function instagramRegions(globalItems) {
  const tags = ['摄影', '攝影', '旅行', '美食', '穿搭', '台灣', '台湾', '香港', '澳門', '澳门', '上海', '北京', '深圳', '广州', '廣州', '台北'];
  return {
    global: { items: globalItems, source: '标签导航', status: 'curated', note: '常用标签精选，不是实时热榜。' },
    zh: { items: tags.map((tag, i) => ({ rank: i + 1, title: `#${tag}`, url: `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`, platform: 'instagram', hot: '' })),
      source: '中文标签导航', status: 'curated', note: '大陆、港澳台相关标签精选，不是实时热榜。' }
  };
}

export function withRegions(platforms, chinese, previous = {}, previousUpdatedAt) {
  const x = platforms.twitter;
  const zh = ['ok', 'empty'].includes(chinese.status) ? chinese : {
    ...chinese, ...mergeTwitterSnapshot(chinese, previous.twitter?.regions?.zh, previousUpdatedAt),
    status: previous.twitter?.regions?.zh?.items?.length ? 'stale' : chinese.status
  };
  x.regions = { global: { ...x, note: '全球热搜话题，点击查看相关帖子。' }, zh };
  x.defaultRegion = 'global';
  const bili = platforms.bilibili;
  bili.regions = {
    zh: { items: bili.items, source: 'Bilibili 国内全站榜', status: bili.items.length ? 'ok' : 'error', note: '国内平台全站榜，不按作者所在地划分。' },
    global: { items: [], status: 'unsupported', note: '当前数据源没有独立全球榜，请切换中区查看国内全站榜。' }
  };
  bili.defaultRegion = 'zh';
  platforms.instagram.regions = instagramRegions(platforms.instagram.items);
  platforms.instagram.defaultRegion = 'global';
  return platforms;
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
const safeUrl = url => /^https:\/\//.test(url || '') ? esc(url) : '#';

export function renderRegionCard(key, platform) {
  const selected = platform.defaultRegion || 'global';
  const regions = platform.regions;
  const statuses = { ok: '抓取成功', empty: '暂无匹配内容', stale: '更新失败，显示上次榜单', error: '抓取失败', unconfigured: '暂未接入', unsupported: '暂不支持', curated: '精选导航' };
  return `<div class="platform-card" data-platform="${esc(key)}">
    <div class="platform-header ${esc(key)}"><span class="platform-icon">${esc(platform.icon)}</span><span class="platform-name">${esc(platform.name)}</span>
    <span class="platform-count">${regions[selected].items.length} 条</span></div>
    <div class="region-switch" role="group" aria-label="${esc(platform.name)}内容范围">
      ${[['zh', '中区 · 中文'], ['global', '全球']].map(([region, label]) => `<button type="button" class="region-button${region === selected ? ' active' : ''}" data-region="${region}" aria-pressed="${region === selected}">${label}</button>`).join('')}
    </div>
    ${Object.entries(regions).map(([region, snapshot]) => `<section class="region-panel" data-region="${region}" data-count="${snapshot.items.length}" ${region === selected ? '' : 'hidden'}>
      <p class="platform-status">${esc(snapshot.source || '')}${snapshot.source ? ' · ' : ''}${statuses[snapshot.status] || '暂无数据'}${snapshot.lastSuccessAt ? ` · 上次成功：${esc(new Date(snapshot.lastSuccessAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))}` : ''}</p>
      <p class="region-note">${esc(snapshot.note)}</p>
      <div class="trending-list">${snapshot.items.length ? snapshot.items.map(item => `<a href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer" class="trending-item"><span class="rank ${item.rank <= 3 ? 'top3' : ''}">${item.rank}</span><span class="trending-title">${esc(item.title)}${item.hot ? `<small class="item-hot">${esc(item.hot)}</small>` : ''}</span></a>`).join('') : '<div class="no-data">暂无数据</div>'}</div>
      ${snapshot.actionUrl ? `<a class="region-action" href="${safeUrl(snapshot.actionUrl)}" target="_blank" rel="noopener noreferrer">${esc(snapshot.actionLabel)}</a>` : ''}
    </section>`).join('')}
  </div>`;
}
