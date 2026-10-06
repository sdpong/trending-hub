import fetch from 'node-fetch';
export const INTERNATIONAL_URL = 'https://api.bilibili.tv/intl/up/ranking/listV2';
const meta = {
  source: 'Bilibili 国际版 · 创作中心 Trending Videos',
  note: '官网默认地区榜单，包含多种语言；不是全球总榜，也不是纯英文榜。',
  actionUrl: 'https://studio.bilibili.tv/', actionLabel: '查看国际版创作中心'
};
export function parseInternational(body) {
  if (body?.code !== 0) throw new Error(`API code ${body?.code ?? 'missing'}`);
  const rows = body.data?.video_rank?.ranking_videos;
  if (!Array.isArray(rows)) throw new Error('Missing video ranking');
  const seen = new Set();
  const items = [];
  for (const row of rows) {
    const id = String(row.aid ?? '');
    if (!/^\d+$/.test(id) || typeof row.title !== 'string' || !row.title.trim() || seen.has(id)) continue;
    seen.add(id);
    const views = Number.isFinite(row.view_cnt) ? `${row.view_cnt.toLocaleString('en-US')} 播放` : '';
    const likes = Number.isFinite(row.like_cnt) ? `${row.like_cnt.toLocaleString('en-US')} 赞` : '';
    items.push({ rank: items.length + 1, title: row.title.trim(), url: `https://www.bilibili.tv/en/video/${id}`, hot: [views, likes].filter(Boolean).join(' · '), platform: 'bilibili' });
    if (items.length >= 30) break;
  }
  if (!items.length) throw new Error('Empty video ranking');
  return items;
}
export async function fetchInternational({ fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(INTERNATIONAL_URL, { headers: {
      'User-Agent': 'Mozilla/5.0', Referer: 'https://studio.bilibili.tv/', Origin: 'https://studio.bilibili.tv', Accept: 'application/json'
    }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ...meta, items: parseInternational(await res.json()), status: 'ok', lastSuccessAt: new Date().toISOString() };
  } catch (error) {
    console.warn(`Bilibili international failed: ${error.message}`);
    return { ...meta, items: [], status: 'error', errors: [error.name === 'AbortError' ? 'Request timed out' : error.message] };
  } finally { clearTimeout(timer); }
}
