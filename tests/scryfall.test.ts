import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { blankFormat } from '../src/lib/model.ts';
import { buildSearchQuery, cardInfo, emptyFilters, loadSets, resolveCard, rulesTextTerms, searchCards, filterFormatCards } from '../src/lib/scryfall.ts';
import type { ScryfallCard } from '../src/lib/scryfall.ts';

const card: ScryfallCard = { id: 'fixture', oracle_id: 'oracle-fixture', name: 'Fixture Card', set: 'dmu', collector_number: '10', type_line: 'Legendary Creature', oracle_text: 'Partner', mana_cost: '{U}', color_identity: ['U'], image_uris: { normal: 'https://cards.scryfall.io/normal/front/example.jpg', small: 'https://cards.scryfall.io/small/front/example.jpg' } };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('advanced queries preserve Scryfall syntax and intersect the format pool', () => {
  const f = { ...blankFormat(), allowedSets: ['dmu', 'm21'], banned: ['Lightning Bolt'] };
  const query = buildSearchQuery('t:instant or t:sorcery', { ...emptyFilters(), oracle: 'draw', manaValue: '<=3', sets: 'MH3, BRO' }, f);
  assert.match(query, /^\(t:instant or t:sorcery\)/);
  assert.ok(query.includes('mv<=3'));
  assert.ok(query.includes('(set:mh3 or set:bro)'));
  assert.ok(query.includes('(set:dmu or set:m21)'));
  assert.ok(!query.includes('Lightning Bolt'));
  assert.throws(() => buildSearchQuery('', { ...emptyFilters(), manaValue: 'bad syntax' }));
});

test('empty searches exclude tokens by default and can include them', () => {
  assert.equal(buildSearchQuery('', emptyFilters()), '-t:token (legal:vintage or restricted:vintage)');
  assert.equal(buildSearchQuery('', { ...emptyFilters(), includeTokens: true }), '(legal:vintage or restricted:vintage or t:token)');
  assert.equal(buildSearchQuery('', { ...emptyFilters(), normalOnly: false, includeTokens: true }), 'name:/.*/');
  assert.equal(buildSearchQuery('  ', emptyFilters()), '-t:token (legal:vintage or restricted:vintage)');
  assert.equal(buildSearchQuery('', { ...emptyFilters(), oracle: 'draw' }), 'o:"draw" -t:token (legal:vintage or restricted:vintage)');
  assert.equal(buildSearchQuery('', emptyFilters(), { ...blankFormat(), allowedSets: ['dmu'] }), '-t:token (legal:vintage or restricted:vintage) (set:dmu)');
});

test('advanced filters express exact colors, identity, types, stats and print criteria', () => {
  const query = buildSearchQuery('', { ...emptyFilters(), name: 'Dragon', type: 'creature artifact', typeMode: 'any', excludeType: 'enchantment', colors: 'ur', colorMode: '=', identity: 'wub', identityMode: '<=', manaCost: '{U}{R}', power: '>=4', toughness: '<=6', loyalty: '3', legalFormat: 'modern', legality: 'banned', artist: 'Jane Doe', flavor: 'fire', game: 'arena', language: 'ja', border: 'borderless', price: '<=5', currency: 'eur', releasedAfter: '2020-01-01', releasedBefore: '2025-12-31' });
  for (const expected of ['name:"Dragon"', '(t:"creature" or t:"artifact")', '-t:"enchantment"', 'c=ur', 'ci<=wub', 'mana:"{U}{R}"', 'pow>=4', 'tou<=6', 'loy=3', 'banned:modern', 'artist:"Jane Doe"', 'flavor:"fire"', 'game:arena', 'lang:ja', 'border:borderless', 'eur<=5', 'date>=2020-01-01', 'date<=2025-12-31']) assert.ok(query.includes(expected), expected);
  assert.throws(() => buildSearchQuery('', { ...emptyFilters(), releasedAfter: '2025-02-30' }));
  assert.throws(() => buildSearchQuery('', { ...emptyFilters(), power: 'four' }));
});

test('API queries support all cards, result grouping and sort direction', async () => {
  let requested: URL | undefined;
  const fetch = mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => { requested = new URL(String(input)); return json({ data: [], total_cards: 0, has_more: false }); });
  try {
    await searchCards('', 'released', undefined, undefined, { unique: 'prints', direction: 'desc', extras: false });
    assert.equal(requested!.searchParams.get('q'), 'name:/.*/');
    assert.equal(requested!.searchParams.get('unique'), 'prints');
    assert.equal(requested!.searchParams.get('dir'), 'desc');
    assert.equal(requested!.searchParams.get('include_extras'), 'false');
  } finally { fetch.mock.restore(); }
});

test('double-faced images and text are retained', () => {
  const info = cardInfo({ ...card, image_uris: undefined, oracle_text: undefined, card_faces: [{ name: 'Front', oracle_text: 'Front text', image_uris: { normal: 'front', small: 'front' } }, { name: 'Back', oracle_text: 'Back text', image_uris: { normal: 'back', small: 'back' } }] });
  assert.equal(info.image, 'front'); assert.equal(info.backImage, 'back');
  assert.equal(info.oracleText, 'Front text\nBack text');
});

test('rules text matches every quoted phrase independently', () => {
  assert.deepEqual(rulesTextTerms('"whenever", "draw a card"'), ['whenever', 'draw a card']);
  assert.deepEqual(rulesTextTerms('"whenever" "draw a card"'), ['whenever', 'draw a card']);
  assert.deepEqual(rulesTextTerms('whenever, draw a card'), ['whenever', 'draw a card']);
  assert.deepEqual(rulesTextTerms('draw a card'), ['draw a card']);
  const query = buildSearchQuery('', { ...emptyFilters(), oracle: '"whenever", "draw a card"' });
  assert.equal(query, 'o:"whenever" o:"draw a card" -t:token (legal:vintage or restricted:vintage)');
  assert.throws(() => rulesTextTerms('"unfinished phrase'), /Close each/);
});

test('card metadata includes sorting data and handles unavailable prices', () => {
  const info = cardInfo({ ...card, cmc: 3, colors: ['U'], rarity: 'rare', prices: { usd: '2.50' } });
  assert.equal(info.manaValue, 3); assert.equal(info.priceUSD, 2.5);
  assert.deepEqual(info.colors, ['U']); assert.equal(info.rarity, 'rare');
  assert.equal(cardInfo({ ...card, prices: { usd: null } }).priceUSD, null);
  assert.equal(cardInfo({ ...card, prices: { usd: '0.00' } }).priceUSD, 0);
  assert.deepEqual(cardInfo({ ...card, card_faces: [{ name: 'Front', colors: ['U'] }, { name: 'Back', colors: ['R'] }] }).colors, ['U', 'R']);
});

test('search pagination, empty results, syntax errors, and cache use', async () => {
  const seen: URL[] = [];
  const fetch = mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input)); seen.push(url);
    if (url.searchParams.get('q') === 'no-fixture') return json({ details: 'No cards found' }, 404);
    if (url.searchParams.get('q') === 'syntax-fixture') return json({ details: 'Unknown search keyword' }, 400);
    return json({ data: [card], total_cards: 2, has_more: !url.searchParams.has('page'), next_page: 'https://api.scryfall.com/cards/search?q=pagination-fixture&page=2' });
  });
  try {
    const first = await searchCards('pagination-fixture');
    assert.equal(first.has_more, true);
    assert.equal(seen[0].searchParams.get('unique'), 'cards');
    assert.equal(seen[0].searchParams.get('include_extras'), 'true');
    const second = await searchCards('pagination-fixture', 'name', undefined, first.next_page);
    assert.equal(second.has_more, false);
    await searchCards('pagination-fixture');
    assert.equal(seen.length, 2);
    assert.equal((await searchCards('no-fixture')).total_cards, 0);
    await assert.rejects(searchCards('syntax-fixture'), /Unknown search keyword/);
  } finally { fetch.mock.restore(); }
});

test('set catalogue is cached and print-set resolution follows every page', async () => {
  const times: number[] = [], seen: string[] = [];
  const fetch = mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input)); times.push(Date.now()); seen.push(url.pathname);
    if (url.pathname === '/sets') return json({ data: [{ code: 'old', name: 'Old', released_at: '2000-01-01' }, { code: 'new', name: 'New', released_at: '2020-01-01' }] });
    if (url.pathname === '/cards/named') return json(card);
    if (url.searchParams.get('page') === '2') return json({ data: [{ ...card, set: 'm21', rarity: 'common' }], has_more: false });
    return json({ data: [{ ...card, rarity: 'rare' }], has_more: true, next_page: 'https://api.scryfall.com/cards/search?q=oracleid:oracle-fixture&unique=prints&page=2' });
  });
  try {
    assert.equal((await loadSets())[0].code, 'new');
    await loadSets(); assert.equal(seen.filter(p => p === '/sets').length, 1);
    const info = await resolveCard({ id: 'entry', name: card.name, zone: 'main', quantity: 1 }, true);
    assert.deepEqual(info.printRarities, ['rare', 'common']); assert.deepEqual(info.printSets, ['dmu', 'm21']); assert.equal(info.setsComplete, true);
    assert.ok(info.checkedAt);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 110, 'API calls are paced');
  } finally { fetch.mock.restore(); }
});

test('aborted requests and external pagination URLs cannot fetch', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network call'); });
  try {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(searchCards('cancel-fixture', 'name', controller.signal));
    await assert.rejects(searchCards('external-fixture', 'name', undefined, 'https://example.com/cards'), /Invalid Scryfall endpoint/);
    assert.equal(fetch.mock.calls.length, 0);
  } finally { fetch.mock.restore(); }
});

test('closing a deck during card resolution prevents the follow-up printing search', async () => {
  const controller = new AbortController();
  let calls = 0;
  const fetch = mock.method(globalThis, 'fetch', async () => {
    calls++; controller.abort();
    return json({ ...card, id: 'closed-deck-print', oracle_id: 'closed-deck-oracle', name: 'Closing Deck Fixture' });
  });
  try {
    await assert.rejects(resolveCard({ id: 'closing', name: 'Closing Deck Fixture', zone: 'main', quantity: 1 }, true, controller.signal));
    assert.equal(calls, 1);
  } finally { fetch.mock.restore(); }
});

test('historic set pools keep named bans out of the Scryfall query', () => {
  const f = { ...blankFormat(), allowedSets: ['8ed', 'mrd', 'ori'], banned: ['A+B', 'Who (What)?', 'Half // Half'] };
  const q = buildSearchQuery('', emptyFilters(), f);
  assert.ok(q.includes('(set:8ed or set:mrd or set:ori)'));
  assert.ok(!q.includes('Who (What)?'));
  assert.ok(!q.includes('A+B'));
  assert.deepEqual(filterFormatCards([{ ...card, name: 'Who (What)?' }, { ...card, name: 'Who (What)? II' }], f).map(c => c.name), ['Who (What)? II']);
  assert.ok(!q.includes('name:/'));
  assert.ok(!buildSearchQuery('', emptyFilters(), { ...f, eternal: true }).includes('set:'));
});

test('2015 Modern and Prefire queries contain balanced set groups without name syntax', async () => {
  const { defaultFormats } = await import('../src/lib/default-formats.ts');
  for (const format of defaultFormats().slice(0, 2)) {
    const query = buildSearchQuery('', emptyFilters(), format);
    let depth = 0, quoted = false, escaped = false;
    for (const char of query) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\' && quoted) { escaped = true; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (quoted) continue;
      if (char === '(') depth++;
      if (char === ')') depth--;
      assert.ok(depth >= 0, `${format.name}: unexpected closing parenthesis`);
    }
    assert.equal(quoted, false); assert.equal(depth, 0);
    assert.ok(!query.includes('!"'));
    const bannedCard = { ...card, name: format.banned[0] };
    assert.deepEqual(filterFormatCards([bannedCard, card], format), [card]);
    assert.equal(query.match(/set:/g)?.length, format.allowedSets.length);
    assert.ok(!query.includes('name:/'));
  }
});

test('legal card lists batch requests, filter exact names and bans, and sort before pagination', async () => {
  const { searchLegalPool } = await import('../src/lib/scryfall.ts');
  const names = Array.from({ length: 180 }, (_, i) => `Pool Card ${String(i).padStart(3, '0')}`);
  const f = { ...blankFormat(), whitelistOnly: true, allowedCards: names, banned: [names[0]] };
  const seen: URL[] = [], sent: string[] = [];
  const fetch = mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input)); seen.push(url);
    const q = url.searchParams.get('q')!;
    const terms = [...q.matchAll(/name:"([^"]+)"/g)].map(match => match[1]);
    const data = terms.map(name => ({ ...card, id: name, name, cmc: 200 - names.indexOf(name) }));
    // Simulate substring matches and a second Scryfall page for each batch.
    const second = url.searchParams.has('page');
    return json({ data: [...data.slice(second ? 20 : 0, second ? undefined : 20), { ...card, id: 'prefix-match', name: `${terms[0]} Extra` }], total_cards: data.length + 1, has_more: !second && data.length > 20, next_page: `https://api.scryfall.com/cards/search?${new URLSearchParams({ q, page: '2' })}` });
  });
  try {
    const page = await searchLegalPool('-t:token', f, 'cmc', undefined, undefined, { direction: 'asc' }, q => sent.push(q));
    assert.equal(page.total_cards, 179); assert.equal(page.data.length, 150); assert.equal(page.has_more, true);
    assert.equal(page.data[0].name, names[179]);
    assert.ok(page.data.every(c => names.includes(c.name) && c.name !== names[0]));
    assert.ok(seen.every(url => [...url.searchParams.get('q')!.matchAll(/name:/g)].length <= 40));
    assert.ok(sent.every(q => !q.includes('!"')));
    const requests = seen.length;
    const last = await searchLegalPool('-t:token', f, 'cmc', undefined, page.next_page, { direction: 'asc' });
    assert.equal(last.data.length, 29); assert.equal(last.has_more, false); assert.equal(seen.length, requests);
    assert.equal(last.data.at(-1)!.name, names[1]);
    const abort = new AbortController(); abort.abort();
    await assert.rejects(searchLegalPool('-t:token', f, 'cmc', abort.signal, undefined, { direction: 'asc' }));
    assert.equal(seen.length, requests);
  } finally { fetch.mock.restore(); }
});
