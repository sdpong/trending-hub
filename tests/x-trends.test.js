import test from 'node:test';
import assert from 'node:assert/strict';
import { Response } from 'node-fetch';
import { parseGetDayTrends, parseOfficialTrends, fetchTwitterTrends, mergeTwitterSnapshot } from '../scripts/x-trends.js';

const html = `<table class="trends"><tr><td class="main"><a href="/trend/test/">#AI &amp; Mac</a></td></tr></table>
<table class="trends collapse"><tr><td class="main"><a href="/trend/test2/">中文</a></td></tr></table>
<table class="top"><tr><td class="main"><a href="/trend/old/">Yesterday</a></td></tr></table>`;
const page = () => new Response(html, { headers: { 'content-type': 'text/html' } });
const quiet = { warn() {} };

test('only current ranking, including collapsed table and encoded search URLs', () => {
  const items = parseGetDayTrends(html);
  assert.deepEqual(items.map(x => x.title), ['#AI & Mac', '中文']);
  assert.equal(new URL(items[0].url).searchParams.get('q'), '#AI & Mac');
  assert.equal(items[1].rank, 2);
  assert.deepEqual(parseGetDayTrends('<title>Just a moment...</title>'), []);
});

test('official data deduplicates and keeps zero counts', () => {
  const items = parseOfficialTrends({ data: [{ trend_name: '#AI', tweet_count: 0 }, { trend_name: '#AI' }, {}] });
  assert.equal(items.length, 1);
  assert.equal(items[0].hot, '0 posts');
});

test('official API uses auth, then falls back on 401 without leaking token', async () => {
  const calls = [];
  const result = await fetchTwitterTrends({ ...quiet, env: { X_BEARER_TOKEN: 'secret', X_WOEID: '23424977', X_GETDAYTRENDS_REGION: 'united-states' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1 ? new Response('', { status: 401 }) : page();
    } });
  assert.equal(result.source, 'GetDayTrends');
  assert.match(calls[0].url, /woeid\/23424977/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret');
  assert.equal(calls[1].url, 'https://getdaytrends.com/united-states/');
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('official success skips public source', async () => {
  let calls = 0;
  const result = await fetchTwitterTrends({ ...quiet, env: { X_BEARER_TOKEN: 'token' }, fetchImpl: async () => {
    calls++;
    return new Response(JSON.stringify({ data: [{ trend_name: 'Mac' }] }), { headers: { 'content-type': 'application/json' } });
  } });
  assert.equal(calls, 1);
  assert.equal(result.status, 'ok');
  assert.equal(result.source, 'X API');
});

test('HTTP errors, challenge pages, wrong content types retain old snapshot', async () => {
  for (const response of [new Response('', { status: 403 }), new Response('<title>Just a moment...</title>', { headers: { 'content-type': 'text/html' } }), new Response('{}', { headers: { 'content-type': 'application/json' } })]) {
    const result = await fetchTwitterTrends({ ...quiet, env: {}, fetchImpl: async () => response });
    const old = { items: [{ title: 'Previous' }], source: 'GetDayTrends', lastSuccessAt: '2026-10-05T00:00:00Z' };
    const merged = mergeTwitterSnapshot(result, old);
    assert.equal(merged.status, 'stale');
    assert.deepEqual(merged.items, old.items);
    assert.equal(merged.lastSuccessAt, old.lastSuccessAt);
    assert.equal(mergeTwitterSnapshot(result).status, 'error');
  }
});

test('timeout remains active during body read', async () => {
  const result = await fetchTwitterTrends({ ...quiet, env: {}, timeoutMs: 5, fetchImpl: async (_, { signal }) => ({
    ok: true, headers: new Map([['content-type', 'text/html']]),
    text: () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
  }) });
  assert.equal(result.status, 'error');
  assert.match(result.errors[0], /timed out/);
});
