import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInternational, fetchInternational } from '../scripts/bilibili-international.js';
import { withRegions } from '../scripts/platform-regions.js';
const row = { aid: '4787598123734528', title: '国际版视频', view_cnt: 6202, like_cnt: 97 };
const body = { code: 0, data: { video_rank: { ranking_videos: [row, row, { ...row, aid: '../bad' }] } } };
test('international ranking validates ids, deduplicates and retains metrics', () => {
  const items = parseInternational(body);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://www.bilibili.tv/en/video/4787598123734528');
  assert.equal(items[0].hot, '6,202 播放 · 97 赞');
  assert.throws(() => parseInternational({ code: 10003003 }));
  assert.throws(() => parseInternational({ code: 0, data: {} }));
});
test('region denial retains only international cache and preserves domestic ranking', async () => {
  const snapshot = await fetchInternational({ fetchImpl: async () => ({ ok: true, json: async () => body }) });
  const failed = await fetchInternational({ fetchImpl: async () => ({ ok: true, json: async () => ({ code: 10003003 }) }) });
  const domestic = [{ title: '国内', url: 'https://www.bilibili.com/video/BV1' }];
  const p = withRegions({ twitter: { items: [] }, bilibili: { items: domestic }, instagram: { items: [] } }, { status: 'ok', items: [] }, { bilibili: { regions: { global: snapshot } } }, undefined, failed);
  assert.equal(p.bilibili.regions.global.status, 'stale');
  assert.deepEqual(p.bilibili.regions.global.items, snapshot.items);
  assert.deepEqual(p.bilibili.regions.zh.items, domestic);
  assert.equal(p.bilibili.regions.global.lastSuccessAt, snapshot.lastSuccessAt);
});
