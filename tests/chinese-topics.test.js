import test from 'node:test';
import assert from 'node:assert/strict';
import { Response } from 'node-fetch';
import { parseLanbuzhu, parseSoPilot, fetchChineseTopics, LANBUZHU_URL, SOPILOT_URL } from '../scripts/chinese-topics.js';

const now = new Date('2026-10-06T02:00:00Z');
const body = { d: 'live', at: '2026-10-06T01:25:00Z', list: [{ title: '中文话题', key: '中文 / #', views: 1000, posts: 2 }] };
const html = `<a href="/zh/rank/topic">导航</a><div><div><a class="font-bold" href="/zh/rank/topic/mac-ai">Mac &amp; AI</a></div><div>12 帖 2.5万<span>曝光</span></div></div><a href="/zh/rank/topic/mac-ai">话题详情</a>`;
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const page = () => new Response(html, { headers: { 'content-type': 'text/html' } });
const quiet = { now, warn() {} };

test('JSON topics preserve source order, deduplicate and encode details URL', () => {
  const items = parseLanbuzhu({ ...body, list: [...body.list, ...body.list, { title: '' }] });
  assert.equal(items.length, 1);
  assert.equal(decodeURIComponent(new URL(items[0].url).pathname.split('/').at(-1)), '中文 / #');
  assert.equal(items[0].hot, '1,000 曝光 · 2 帖');
});

test('HTML fallback excludes navigation, duplicate detail links and challenge pages', () => {
  assert.deepEqual(parseSoPilot(html), [{ rank: 1, title: 'Mac & AI', url: 'https://sopilot.net/zh/rank/topic/mac-ai', hot: '2.5万曝光 · 12 帖', platform: 'twitter' }]);
  assert.deepEqual(parseSoPilot('<title>Just a moment...</title>'), []);
});

test('primary source never requests X, auth, or fallback on success', async () => {
  let calls = 0;
  const result = await fetchChineseTopics({ ...quiet, fetchImpl: async (url, options) => {
    calls++; assert.equal(url, LANBUZHU_URL); assert.equal(options.headers.Authorization, undefined); return json(body);
  } });
  assert.equal(calls, 1);
  assert.equal(result.source, '蓝不住');
  assert.equal(result.sourceUpdatedAt, body.at.replace('00Z', '00.000Z'));
});

test('HTTP failure, stale JSON, wrong type and empty data use fallback', async () => {
  for (const res of [new Response('', { status: 403 }), json({ ...body, at: '2026-10-01T00:00:00Z' }), page(), json({ ...body, list: [] })]) {
    const calls = [];
    const result = await fetchChineseTopics({ ...quiet, fetchImpl: async url => {
      calls.push(url); return calls.length === 1 ? res : page();
    } });
    assert.deepEqual(calls, [LANBUZHU_URL, SOPILOT_URL]);
    assert.equal(result.source, 'SoPilot');
    assert.equal(result.errors.length, 1);
  }
});

test('both sources fail, returning an error for regional cache handling', async () => {
  const result = await fetchChineseTopics({ ...quiet, fetchImpl: async () => new Response('', { status: 429 }) });
  assert.equal(result.status, 'error'); assert.equal(result.errors.length, 2); assert.deepEqual(result.items, []);
});

test('timeout covers body read and fallback remains available', async () => {
  let calls = 0;
  const result = await fetchChineseTopics({ ...quiet, timeoutMs: 5, fetchImpl: async (_, { signal }) => {
    if (++calls === 2) return page();
    return { ok: true, headers: new Map([['content-type', 'application/json']]), json: () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) };
  } });
  assert.equal(result.source, 'SoPilot'); assert.match(result.errors[0], /timed out/);
});
