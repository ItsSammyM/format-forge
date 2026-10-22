import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScryfallClient, CACHE_TTL } from '../src/lib/scryfall-client.ts';
import type { CachedResponse } from '../src/lib/scryfall-client.ts';

const url = (name: string) => `https://api.scryfall.com/cards/named?exact=${name}`;
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers });
function fixture(respond: (url: string) => Promise<Response> = async () => json({ name: 'Card' })) {
  let now = Date.parse('2026-10-15T00:00:00Z');
  let state = {};
  let lockTail: Promise<unknown> = Promise.resolve();
  const persistent = new Map<string, CachedResponse>(), calls: { url: string; at: number }[] = [];
  const runtime: ConstructorParameters<typeof ScryfallClient>[0] = {
    now: () => now,
    fetch: async input => { calls.push({ url: String(input), at: now }); return respond(String(input)); },
    wait: async (ms, signal) => { signal?.throwIfAborted(); now += ms; },
    readState: () => state,
    writeState: next => state = { ...next },
    readCache: async key => persistent.get(key),
    writeCache: async (key, value) => { persistent.set(key, value); },
    lock: (work, signal) => {
      const job = lockTail.catch(() => {}).then(() => { signal?.throwIfAborted(); return work(); }); lockTail = job; return job;
    },
  };
  return { client: new ScryfallClient(runtime), reload: () => new ScryfallClient(runtime), runtime, calls, persistent, advance: (ms: number) => now += ms, now: () => now };
}

test('non-JSON 429 stops queued requests and remembers the cooldown across reloads', async () => {
  const f = fixture(async () => new Response('Too many requests', { status: 429 }));
  const results = await Promise.allSettled(['a', 'b', 'c'].map(name => f.client.request(url(name))));
  assert.ok(results.every(result => result.status === 'rejected' && /paused until/.test(result.reason.message)));
  assert.equal(f.calls.length, 1);
  assert.equal(f.client.cooldownUntil, f.now() + 60000);
  await assert.rejects(f.reload().request(url('after-reload')), /paused until/);
  f.advance(30000);
  await assert.rejects(f.client.request(url('after-30-seconds')), /paused until/);
  assert.equal(f.calls.length, 1);
});

test('opaque browser fetch failures pause retries to cover CORS-hidden rate limits', async () => {
  const f = fixture(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(f.client.request(url('opaque-failure')), /Could not reach Scryfall/);
  await assert.rejects(f.client.request(url('immediate-retry')), /paused until/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.client.cooldownUntil - f.now(), 30000);
});

test('Retry-After seconds and HTTP dates extend the pause, and repeated overages back off', async () => {
  let header = '180';
  const f = fixture(async () => json({}, 429, { 'Retry-After': header }));
  await assert.rejects(f.client.request(url('one')), /paused until/);
  assert.equal(f.client.cooldownUntil - f.now(), 180000);
  f.advance(180000); header = '1';
  await assert.rejects(f.reload().request(url('two')), /paused until/);
  assert.equal(f.client.cooldownUntil - f.now(), 120000);
  f.advance(120000); header = new Date(f.now() + 600000).toUTCString();
  await assert.rejects(f.client.request(url('three')), /paused until/);
  assert.equal(f.client.cooldownUntil - f.now(), 600000);
  assert.equal(f.calls.length, 3);
});

test('cached data stays usable during cooldown, and there is no automatic retry after it ends', async () => {
  const f = fixture(async key => key === url('known') ? json({ name: 'Known' }) : json({}, 429));
  await f.client.request(url('known'));
  await assert.rejects(f.client.request(url('new')), /paused until/);
  assert.deepEqual(await f.reload().request(url('known')), { name: 'Known' });
  const count = f.calls.length; f.advance(60000);
  assert.equal(f.client.cooldownUntil, 0); assert.equal(f.calls.length, count);
});

test('24-hour cache survives client recreation and expires without losing selected printing IDs', async () => {
  const f = fixture();
  await f.client.request(url('cached')); f.advance(CACHE_TTL - 1);
  await f.reload().request(url('cached')); assert.equal(f.calls.length, 1);
  f.advance(1); await f.reload().request(url('cached')); assert.equal(f.calls.length, 2);
});

test('simultaneous metadata lookups coalesce and abortable queued lookups recheck the cache', async () => {
  const f = fixture();
  await Promise.all([f.client.request(url('same')), f.client.request(url('same')), f.client.request(url('same'), new AbortController().signal)]);
  assert.equal(f.calls.length, 1);
});

test('tabs share network pacing and repeated requests through the persistent cache', async () => {
  const f = fixture(), other = f.reload();
  await Promise.all([f.client.request(url('first')), other.request(url('second')), f.client.request(url('third'))]);
  assert.equal(f.calls.length, 3);
  for (let i = 1; i < f.calls.length; i++) assert.ok(f.calls[i].at - f.calls[i - 1].at >= 500);
  await other.request(url('first')); assert.equal(f.calls.length, 3);
});

test('search responses populate card ID caches so adding a result avoids a second lookup', async () => {
  const card = { id: 'chosen-print', name: 'Chosen', collector_number: '12', set: 'dmu' };
  const f = fixture(async () => json({ data: [card] }));
  await f.client.request('https://api.scryfall.com/cards/search?q=chosen');
  assert.deepEqual(await f.reload().request('https://api.scryfall.com/cards/chosen-print'), card);
  assert.equal(f.calls.length, 1);
});

test('large batches across tabs cannot exceed 60 uncached requests in a rolling minute', async () => {
  const f = fixture(), other = f.reload();
  await Promise.all(Array.from({ length: 125 }, (_, i) => (i % 2 ? f.client : other).request(url(`budget-${i}`))));
  assert.equal(f.calls.length, 125);
  for (const call of f.calls) assert.ok(f.calls.filter(candidate => candidate.at > call.at - 60000 && candidate.at <= call.at).length <= 60);
  for (let i = 1; i < f.calls.length; i++) assert.ok(f.calls[i].at - f.calls[i - 1].at >= 500);
});

test('404s are cached, while transient failures are retryable only on a new request', async () => {
  const f = fixture(async key => json({ details: 'Not found' }, key === url('missing') ? 404 : 500));
  await assert.rejects(f.client.request(url('missing')), /Not found/);
  await assert.rejects(f.reload().request(url('missing')), /Not found/); assert.equal(f.calls.length, 1);
  await assert.rejects(f.client.request(url('failure')));
  await assert.rejects(f.client.request(url('failure'))); assert.equal(f.calls.length, 3);
});

test('aborted and external requests never fetch, and missing storage still allows memory caching', async () => {
  const f = fixture(); f.runtime.readCache = async () => { throw new Error('Storage blocked'); }; f.runtime.writeCache = async () => { throw new Error('Quota exceeded'); };
  const signal = new AbortController(); signal.abort();
  await assert.rejects(f.client.request(url('abort'), signal.signal));
  await assert.rejects(f.client.request('https://example.com/cards'), /Invalid Scryfall endpoint/);
  assert.equal(f.calls.length, 0);
  await f.client.request(url('memory')); await f.client.request(url('memory')); assert.equal(f.calls.length, 1);
});
