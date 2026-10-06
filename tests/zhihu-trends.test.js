import test from 'node:test';
import assert from 'node:assert/strict';
import { parseZhihuHot, fetchZhihuTrends } from '../scripts/zhihu-trends.js';
import { mergeTwitterSnapshot } from '../scripts/x-trends.js';
const row = (url = 'https://www.zhihu.com/question/123') => ({ target: { title_area: { text: '热门问题' }, link: { url }, metrics_area: { text: '421 万热度' } } });
test('web response preserves titles, question links and heat; rejects invalid links and duplicates', () => {
  const items = parseZhihuHot({ data: [row(), row(), row('https://evil.test/question/2'), row('https://www.zhihu.com/question/456')] });
  assert.equal(items.length, 2);
  assert.equal(items[0].hot, '421 万热度');
  assert.equal(items[1].rank, 2);
  assert.throws(() => parseZhihuHot({ error: {} }));
  assert.throws(() => parseZhihuHot({ data: [] }));
});
test('anonymous web API succeeds; failure retains prior snapshot and success timestamp', async () => {
  const ok = await fetchZhihuTrends({ fetchImpl: async (url, opts) => {
    assert.ok(url.includes('hot-list-web'));
    assert.equal(opts.headers.Cookie, undefined);
    return { ok: true, json: async () => ({ data: [row()] }) };
  } });
  assert.equal(ok.status, 'ok');
  const failed = await fetchZhihuTrends({ fetchImpl: async () => ({ ok: false, status: 403 }) });
  const cached = mergeTwitterSnapshot(failed, ok);
  assert.equal(cached.status, 'stale');
  assert.deepEqual(cached.items, ok.items);
  assert.equal(cached.lastSuccessAt, ok.lastSuccessAt);
});
