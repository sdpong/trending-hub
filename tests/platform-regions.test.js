import test from 'node:test';
import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import { withRegions, renderRegionCard } from '../scripts/platform-regions.js';

const platforms = () => ({ twitter: { name: 'X 趋势', icon: '𝕏', items: [{ rank: 1, title: 'Global', url: 'https://x.com/search?q=Global' }], status: 'ok', source: 'GetDayTrends' }, bilibili: { name: 'Bilibili', icon: '📺', items: [{ rank: 1, title: '中文视频', url: 'https://www.bilibili.com/video/test' }] }, instagram: { name: 'Instagram', icon: '📷', items: [] } });

test('region caches cannot replace Chinese posts with global trends', async () => {
  const failed = { status: 'error', items: [], source: '', errors: ['HTTP 429'] };
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
  const data = withRegions(platforms(), { status: 'error', items: [], errors: [] });
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
