import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { blankFormat, addCard, setLegality, validateDeck, deckCardStatuses, createLibrary, parseLibrary, formatText, parseFormatText, normalizeFormatLimits, deckPrice, changePrinting } from '../src/lib/model.ts';
import type { CardInfo, Deck } from '../src/lib/model.ts';
import { buildSearchQuery, emptyFilters, resolveCard } from '../src/lib/scryfall.ts';
import { backupText, parseBackupText, transferText, parseTransfer } from '../src/lib/transfer.ts';

const format = () => ({ ...blankFormat(), name: 'Release range', normalOnly: false, minCards: 1, releasedAfter: '2000-01-01', releasedBefore: '2015-12-31' });
const info = (releasedAt: string): CardInfo => ({ scryfallId: 'chosen', set: 'ori', collectorNumber: '1', typeLine: 'Instant', oracleText: '', colorIdentity: [], manaCost: '', releasedAt, priceUSD: 2 });
const empty = (): Deck => ({ id: 'release-deck', name: 'Release deck', formatId: 'kitchen-table', notes: '', cards: [], updatedAt: '2026-10-15T00:00:00Z' });
const card = (releasedAt: string) => addCard(empty(), 'Example', 1, 'main', info(releasedAt)).cards[0];

test('release dates are inclusive, permit open bounds and remain independent of the chosen printing', () => {
  const f = format();
  assert.equal(setLegality(card('2000-01-01'), f), 'legal'); assert.equal(setLegality(card('2015-12-31'), f), 'legal');
  assert.equal(setLegality(card('1999-12-31'), f), 'unknown');
  assert.equal(setLegality(card('2026-01-01'), { ...f, releasedBefore: undefined }), 'legal');
  assert.equal(setLegality(card('1993-01-01'), { ...f, releasedAfter: undefined }), 'legal');
  const reprinted = { ...card('2026-01-01'), info: { ...info('2026-01-01'), setsComplete: true, printReleases: [{ set: 'ori', date: '2015-07-17' }] } };
  assert.equal(setLegality(reprinted, f), 'legal');
  const d = { ...empty(), cards: [reprinted] };
  const changed = changePrinting(d, reprinted.id, { ...info('2025-01-01'), oracleId: 'shared', scryfallId: 'new' });
  // The actual selected printing date is retained; history can still prove an older printing legal.
  assert.equal(changed.cards[0].info!.releasedAt, '2025-01-01');
});

test('date and set eligibility must be satisfied by the same printing', () => {
  const f = { ...format(), allowedSets: ['ori'], eternal: false };
  const c = { ...card('2026-01-01'), info: { ...info('2026-01-01'), setsComplete: true, printSets: ['ori', 'm21'], printReleases: [{ set: 'ori', date: '2026-01-01' }, { set: 'm21', date: '2010-01-01' }] } };
  assert.equal(setLegality(c, f), 'illegal');
  c.info.printReleases.push({ set: 'ori', date: '2015-07-17' }); assert.equal(setLegality(c, f), 'legal');
  assert.equal(setLegality(c, { ...f, releasedAfter: '2016-01-01', releasedBefore: '2026-12-31' }), 'legal');
});

test('release bounds apply to legal lists and considering cards; incomplete history stays unverified', () => {
  const f = { ...format(), whitelistOnly: true, allowedCards: ['Example'] };
  let d = addCard(empty(), 'Example', 1, 'considering', { ...info('2026-01-01'), setsComplete: true, printReleases: [{ set: 'ori', date: '2026-01-01' }] });
  assert.ok(deckCardStatuses(d, f).get(d.cards[0].id)!.illegal.some(issue => issue.includes('release dates')));
  assert.ok(!validateDeck(d, f).some(issue => issue.startsWith('Example')));
  d = { ...d, cards: d.cards.map(card => ({ ...card, zone: 'main' as const })) };
  assert.ok(validateDeck(d, f).some(issue => issue.includes('outside the allowed release dates')));
  assert.equal(setLegality({ ...card('2026-01-01'), info: { ...info('2026-01-01'), setsComplete: true } }, f), 'unknown');
  assert.equal(setLegality(card('2015-01-01'), { ...f, allowedCards: ['Different card'] }), 'illegal');
});

test('release rules and printing histories survive format exports, transfers and full backups', () => {
  const f = format(); assert.deepEqual(parseFormatText(formatText(f)), [f]);
  const library = createLibrary(); library.formats.push(f);
  library.decks.push({ ...empty(), formatId: f.id, cards: [{ ...card('2026-01-01'), info: { ...info('2026-01-01'), setsComplete: true, printReleases: [{ set: 'ori', date: '2015-07-17' }] } }] });
  const restored = parseBackupText(backupText(library));
  assert.deepEqual(restored.decks[0].cards[0].info!.printReleases, library.decks[0].cards[0].info!.printReleases);
  const transfer = parseTransfer(transferText(library, 'both', [library.decks[0].id], [])); assert.equal(transfer.formats[0].releasedBefore, f.releasedBefore);
  for (const invalid of [{ releasedAfter: '2015-02-30' }, { releasedAfter: 'not-a-date' }, { releasedAfter: '2026-01-01', releasedBefore: '2000-01-01' }]) assert.throws(() => parseFormatText(formatText({ ...f, ...invalid })));
  library.decks[0].cards[0].info!.printReleases![0].date = 'bad-date'; assert.throws(() => parseLibrary(JSON.stringify(library)));
});

test('search dates intersect format dates, and Modern pools do not retain stale manual set filters', () => {
  const query = buildSearchQuery('', { ...emptyFilters(), releasedAfter: '2005-01-01' }, format());
  assert.ok(query.includes('date>=2005-01-01')); assert.ok(query.includes('date>=2000-01-01')); assert.ok(query.includes('date<=2015-12-31'));
  const modern = buildSearchQuery('', emptyFilters(), { ...format(), officialFormat: 'modern', allowedSets: ['ori'] });
  assert.ok(modern.includes('legal:modern')); assert.ok(!modern.includes('set:ori'));
});

test('clearing every optional numeric limit removes its rules after saving and reloading', () => {
  const original = { ...format(), releasedAfter: undefined, releasedBefore: undefined, minCards: 1, maxCards: 1, maxSideboard: 0, maxPoints: 1, minCardPrice: 10, maxCardPrice: 20, minDeckPrice: 100, maxDeckPrice: 200, pointed: [{ name: 'Example', points: 2 }] };
  const d = addCard(empty(), 'Example', 2, 'main', info('2015-01-01'));
  assert.ok(validateDeck(d, original).length >= 4);
  const saved = { ...original, ...normalizeFormatLimits({ maxCards: null, maxSideboard: null, maxPoints: null, minCardPrice: null, maxCardPrice: null, minDeckPrice: null, maxDeckPrice: null }) };
  const restored = parseFormatText(formatText(saved))[0];
  assert.equal(restored.maxCards, null); assert.equal(restored.maxSideboard, null);
  for (const key of ['maxPoints', 'minCardPrice', 'maxCardPrice', 'minDeckPrice', 'maxDeckPrice'] as const) assert.equal(restored[key], undefined);
  assert.deepEqual(validateDeck(d, restored), []);
  const zeros = normalizeFormatLimits({ maxPoints: 0, minCardPrice: 0, maxCardPrice: 0, minDeckPrice: 0, maxDeckPrice: 0, maxSideboard: 0 });
  assert.equal(zeros.maxPoints, 0); assert.equal(zeros.maxCardPrice, 0); assert.equal(zeros.maxSideboard, 0);
  assert.throws(() => parseFormatText(formatText({ ...restored, ...normalizeFormatLimits({ maxCardPrice: -1 }) })));
});

test('stats price totals include every active zone by quantity and report unpriced copies', () => {
  let d = addCard(empty(), 'Main', 2, 'main', info('2015-01-01'));
  for (const zone of ['side', 'commander', 'companion', 'conspiracy'] as const) d = addCard(d, zone, 1, zone, { ...info('2015-01-01'), priceUSD: 3 });
  d = addCard(d, 'Considering', 10, 'considering', { ...info('2015-01-01'), priceUSD: 100 });
  d = addCard(d, 'Unpriced', 3, 'main', { ...info('2015-01-01'), priceUSD: null });
  assert.deepEqual(deckPrice(d), { total: 16, missing: 3 }); assert.deepEqual(deckPrice(empty()), { total: 0, missing: 0 });
});

test('release-date resolution reuses paginated printing lookups; qualifying selected printings skip extra queries', async () => {
  const raw = { id: 'date-fixture', oracle_id: 'date-oracle', name: 'Date Fixture', set: 'ori', collector_number: '1', released_at: '2026-01-01', type_line: 'Instant', color_identity: [] };
  let calls = 0;
  const fetch = mock.method(globalThis, 'fetch', async input => {
    calls++; const url = new URL(String(input));
    const data = url.pathname === '/cards/named' ? raw : { data: [{ ...raw, id: 'older-date-fixture', released_at: '2015-07-17' }], has_more: !url.searchParams.has('page'), next_page: 'https://api.scryfall.com/cards/search?q=oracleid:date-oracle&page=2' };
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  });
  try {
    const entry = { id: 'date-entry', name: 'Date Fixture', quantity: 1, zone: 'main' as const };
    const complete = await resolveCard(entry, true, undefined, format());
    assert.deepEqual(complete.printReleases, [{ set: 'ori', date: '2015-07-17' }]); assert.equal(calls, 3);
    assert.equal(setLegality({ ...entry, info: complete }, format()), 'legal');
    await resolveCard(entry, true, undefined, { ...format(), releasedBefore: '2026-12-31' }); assert.equal(calls, 3);
  } finally { fetch.mock.restore(); }
});
