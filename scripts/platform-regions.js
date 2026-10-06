import { mergeTwitterSnapshot } from './x-trends.js';

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
    ...(previous.twitter?.regions?.zh?.items?.length ? { note: previous.twitter.regions.zh.note, sourceUpdatedAt: previous.twitter.regions.zh.sourceUpdatedAt, actionUrl: previous.twitter.regions.zh.actionUrl, actionLabel: previous.twitter.regions.zh.actionLabel } : {}),
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
      <p class="region-note">${esc(snapshot.note)}${snapshot.sourceUpdatedAt ? ` · 来源更新：${esc(new Date(snapshot.sourceUpdatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))}` : ''}</p>
      <div class="trending-list">${snapshot.items.length ? snapshot.items.map(item => `<a href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer" class="trending-item"><span class="rank ${item.rank <= 3 ? 'top3' : ''}">${item.rank}</span><span class="trending-title">${esc(item.title)}${item.hot ? `<small class="item-hot">${esc(item.hot)}</small>` : ''}</span></a>`).join('') : '<div class="no-data">暂无数据</div>'}</div>
      ${snapshot.actionUrl ? `<a class="region-action" href="${safeUrl(snapshot.actionUrl)}" target="_blank" rel="noopener noreferrer">${esc(snapshot.actionLabel)}</a>` : ''}
    </section>`).join('')}
  </div>`;
}
