import test from 'node:test';
import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import { Response } from 'node-fetch';
import { parseChinesePosts, fetchChinesePosts, withRegions, renderRegionCard } from '../scripts/platform-regions.js';

const platforms = () => ({ twitter: { name: 'X 趋势', icon: '𝕏', items: [{ rank: 1, title: 'Global', url: 'https://x.com/search?q=Global' }], status: 'ok', source: 'GetDayTrends' }, bilibili: { name: 'Bilibili', icon: '📺', items: [{ rank: 1, title: '中文视频', url: 'https://www.bilibili.com/video/test' }] }, instagram: { name: 'Instagram', icon: '📷', items: [] } });

test('Chinese search ranks only Chinese posts by engagement and links to posts', () => {
  const items = parseChinesePosts({ data: [{ id: '1', lang: 'zh', text: '简体', public_metrics: { like_count: 2 } }, { id: '2', lang: 'zh', text: '繁體', public_metrics: { like_count: 20 } }, { id: '3', lang: 'ja', text: '東京', public_metrics: { like_count: 200 } }, { id: '2', lang: 'zh', text: '重复' }] });
  assert.deepEqual(items.map(x => x.title), ['繁體', '简体']);
  assert.equal(items[0].url, 'https://x.com/i/status/2');
});

test('missing token never fetches and provides Chinese search action', async () => {
  const result = await fetchChinesePosts({ env: {}, fetchImpl() { throw new Error('should not fetch'); } });
  assert.equal(result.status, 'unconfigured');
  assert.match(new URL(result.actionUrl).searchParams.get('q'), /lang:zh/);
});

test('official query has Chinese filter, 24-hour window and requested metrics', async () => {
  const now = new Date('2026-10-06T00:00:00Z');
  const result = await fetchChinesePosts({ env: { X_BEARER_TOKEN: 'secret' }, now, fetchImpl: async (url, options) => {
    const params = new URL(url).searchParams;
    assert.match(params.get('query'), /lang:zh/);
    assert.equal(params.get('start_time'), '2026-10-05T00:00:00.000Z');
    assert.equal(options.headers.Authorization, 'Bearer secret');
    return new Response(JSON.stringify({ meta: { result_count: 0 } }), { headers: { 'content-type': 'application/json' } });
  } });
  assert.equal(result.status, 'empty');
});

test('region caches cannot replace Chinese posts with global trends', async () => {
  const failed = await fetchChinesePosts({ env: { X_BEARER_TOKEN: 'token' }, fetchImpl: async () => new Response('', { status: 429 }) });
  const previous = { twitter: { regions: { zh: { items: [{ title: '旧中文' }], lastSuccessAt: '2026-10-05T00:00:00Z' } } } };
  const data = withRegions(platforms(), failed, previous);
  assert.equal(data.twitter.regions.zh.status, 'stale');
  assert.equal(data.twitter.regions.zh.items[0].title, '旧中文');
  assert.equal(data.twitter.regions.global.items[0].title, 'Global');
  assert.equal(data.bilibili.regions.global.status, 'unsupported');
  assert.equal(data.instagram.regions.zh.status, 'curated');
  assert.ok(data.instagram.regions.zh.items.some(x => x.title === '#攝影'));
});

test('panels have independent counts, defaults, buttons and escaped content', async () => {
  const data = withRegions(platforms(), await fetchChinesePosts({ env: {} }));
  for (const key of ['twitter', 'bilibili', 'instagram']) {
    const $ = cheerio.load(renderRegionCard(key, data[key]));
    assert.equal($('.region-button').length, 2);
    assert.equal($('.region-panel').length, 2);
    assert.equal($('.region-panel:not([hidden])').attr('data-region'), data[key].defaultRegion);
    assert.equal($('.region-button[aria-pressed="true"]').attr('data-region'), data[key].defaultRegion);
  }
  data.twitter.regions.zh.items = [{ rank: 1, title: '<script>bad</script>', url: 'javascript:alert(1)' }];
  const $ = cheerio.load(renderRegionCard('twitter', data.twitter));
  assert.equal($('script').length, 0);
  assert.equal($('.region-panel[data-region="zh"] .trending-item').attr('href'), '#');
});
