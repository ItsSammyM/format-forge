import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCard, createLibrary, formatText, moveCard, parseFormatText, parseLibrary, setCardTags } from '../src/lib/model.ts';
import type { CardEntry, Deck } from '../src/lib/model.ts';
import { DEFAULT_VIEW, groupCards, sortCards } from '../src/lib/deck-view.ts';
import { addDefaultFormats, defaultFormats } from '../src/lib/default-formats.ts';
const deck = (): Deck => ({ id: 'd', name: 'Deck', formatId: 'kitchen-table', notes: '', updatedAt: '2026-01-01T00:00:00Z', cards: [] });
const card = (name: string, patch: Partial<CardEntry['info']> = {}): CardEntry => ({ id: name, name, zone: 'main', quantity: 1, info: { scryfallId: name, set: 'ori', collectorNumber: '1', typeLine: 'Creature', oracleText: '', manaCost: '', colorIdentity: ['U'], colors: ['U'], manaValue: 2, rarity: 'common', priceUSD: 1, ...patch } });

test('sort numeric values numerically, missing data last, without changing the deck', () => {
  const cards = [card('Ten', { manaValue: 10 }), card('Unknown', { manaValue: null }), card('Two', { manaValue: 2 })];
  assert.deepEqual(sortCards(cards, 'manaValue').map(c => c.name), ['Two', 'Ten', 'Unknown']);
  assert.deepEqual(sortCards(cards, 'manaValue', 'desc').map(c => c.name), ['Ten', 'Two', 'Unknown']);
  assert.equal(cards[0].name, 'Ten');
});

test('rarity, colors, identity, type, price, and names are sortable', () => {
  const cards = [card('Z', { rarity: 'rare', colors: ['U', 'R'], colorIdentity: ['U', 'R'], typeLine: 'Legendary Creature — Wizard', priceUSD: 10 }), card('A', { rarity: 'common', colors: [], colorIdentity: [], typeLine: 'Artifact', priceUSD: 0.5 })];
  for (const key of ['name', 'rarity', 'colors', 'colorIdentity', 'type', 'price'] as const) assert.equal(sortCards(cards, key)[0].name, 'A');
  assert.deepEqual(groupCards(cards, { ...DEFAULT_VIEW, group: 'type' }).map(g => g.label), ['Artifact', 'Creature']);
});

test('price grouping distinguishes free cards and unavailable prices', () => {
  const cards = [card('Free', { priceUSD: 0 }), card('Cheap', { priceUSD: 2 }), card('Mid', { priceUSD: 8 }), card('Costly', { priceUSD: 25 }), card('Unknown', { priceUSD: null })];
  assert.deepEqual(groupCards(cards, { ...DEFAULT_VIEW, group: 'price' }).map(g => g.cards[0].name), ['Free', 'Cheap', 'Mid', 'Costly', 'Unknown']);
});

test('tag groups include multi-tag cards in each group while total deck counts stay unchanged', () => {
  const cards = [{ ...card('Tagged'), tags: ['Ramp', 'Draw'], quantity: 3 }, card('Plain')];
  const groups = groupCards(cards, { ...DEFAULT_VIEW, group: 'tags' });
  assert.deepEqual(groups.map(g => [g.label, g.count]), [['Draw', 3], ['Ramp', 3], ['Untagged', 1]]);
  assert.equal(cards.reduce((sum, c) => sum + c.quantity, 0), 4);
});

test('tags survive partial moves, target merges, and further additions', () => {
  let d = addCard(deck(), 'Opt', 4, 'main');
  d = setCardTags(d, d.cards[0].id, ['Draw', ' draw ', 'Tempo']);
  d = moveCard(d, d.cards[0].id, 'side', 1);
  assert.deepEqual(d.cards[1].tags, ['draw', 'Tempo']);
  d = addCard(d, 'Opt', 1, 'considering');
  assert.deepEqual(d.cards[2].tags, ['draw', 'Tempo']);
  d = setCardTags(d, d.cards[1].id, ['Cantrip']);
  assert.ok(d.cards.every(c => c.tags?.[0] === 'Cantrip'));
  assert.throws(() => setCardTags(d, d.cards[0].id, ['x'.repeat(41)]));
});

test('backups preserve tags, views, layout ratios, and expanded metadata', () => {
  const library = createLibrary();
  library.decks = [{ ...deck(), cards: [{ ...card('Opt'), tags: ['Cantrip'] }], views: { main: { sort: 'price', group: 'tags', direction: 'desc' } }, layout: { workspace: 40, boards: 55, auxiliary: 60, special: { commander: 150 } } }];
  const restored = parseLibrary(JSON.stringify(library)).decks[0];
  assert.deepEqual(restored.views, library.decks[0].views);
  assert.deepEqual(restored.layout, library.decks[0].layout);
  assert.deepEqual(restored.cards[0].tags, ['Cantrip']);
  assert.equal(restored.cards[0].info?.priceUSD, 1);
  library.decks[0].layout!.workspace = 0;
  assert.throws(() => parseLibrary(JSON.stringify(library)));
});

test('standalone formats export and import their complete rules', () => {
  const format = defaultFormats()[0];
  assert.deepEqual(parseFormatText(formatText(format)), [format]);
  const library = createLibrary(); library.decks = [deck()];
  assert.throws(() => parseFormatText(JSON.stringify(library)), /standalone/);
});

test('presets have the correct cutoff sets and distinct bans', () => {
  const [modern, prefire] = defaultFormats();
  assert.equal(modern.allowedSets.length, 49); assert.equal(prefire.allowedSets.length, 63);
  assert.ok(modern.allowedSets.includes('ori')); assert.ok(!modern.allowedSets.includes('bfz'));
  assert.ok(prefire.allowedSets.includes('rna')); assert.ok(!prefire.allowedSets.includes('war'));
  assert.ok(modern.banned.includes('Birthing Pod')); assert.ok(!prefire.banned.includes('Birthing Pod'));
  assert.ok(prefire.banned.includes('Creeping Chill')); assert.ok(!modern.banned.includes('Golgari Grave-Troll'));
  assert.equal(modern.banned.length, 32); assert.equal(prefire.banned.length, 26);
});

test('default upgrade adds protected presets once and preserves edits', () => {
  const old = { ...createLibrary(), defaultsVersion: undefined, formats: createLibrary().formats.slice(0, 2) };
  const upgraded = addDefaultFormats(old);
  assert.equal(upgraded.formats.length, 6);
  upgraded.formats = upgraded.formats.filter(f => f.id !== 'prefire');
  assert.equal(addDefaultFormats(upgraded).formats.length, 6);
  const custom = { ...old, formats: [{ ...defaultFormats()[0], minCards: 42 }] };
  assert.equal(addDefaultFormats(custom).formats.find(f => f.id === '2015-modern')!.minCards, 42);
});

test('default upgrade restores missing protected presets while preserving historical edits', () => {
  const library = { ...createLibrary(), defaultsVersion: 1 as const, formats: createLibrary().formats.filter(f => f.id !== 'commander' && f.id !== 'prefire').map(f => ({ ...f, minCards: 42 })) };
  const upgraded = addDefaultFormats(library);
  const commander = upgraded.formats.find(f => f.id === 'commander')!;
  assert.equal(commander.eternal, true); assert.equal(commander.minCards, 100); assert.equal(commander.maxCards, 100);
  assert.equal(commander.copyLimit, 1); assert.equal(commander.maxSideboard, 0);
  assert.ok(commander.banned.includes('Black Lotus'));
  assert.ok(!commander.banned.includes('Lutri, the Spellchaser'));
  assert.deepEqual(commander.bannedCompanions, ['Lutri, the Spellchaser']);
  assert.ok(upgraded.formats.some(f => f.id === 'prefire'));
  assert.equal(upgraded.formats.find(f => f.id === '2015-modern')!.minCards, 42);
  const removed = { ...upgraded, formats: upgraded.formats.filter(f => f.id !== 'commander') };
  assert.ok(addDefaultFormats(removed).formats.some(f => f.id === 'commander'));
});

test('search control sizes survive backups and old layouts remain valid', () => {
  const library = createLibrary();
  library.decks = [{ ...deck(), layout: { workspace: 46, searchControls: 68 } }];
  assert.equal(parseLibrary(JSON.stringify(library)).decks[0].layout!.searchControls, 68);
  for (const size of [15, 85, 32.5]) {
    library.decks[0].layout!.searchControls = size;
    assert.equal(parseLibrary(JSON.stringify(library)).decks[0].layout!.searchControls, size);
  }
  for (const size of [0, 14, 86, 'big']) {
    const invalid = JSON.parse(JSON.stringify(library)); invalid.decks[0].layout.searchControls = size;
    assert.throws(() => parseLibrary(JSON.stringify(invalid)));
  }
  delete library.decks[0].layout!.searchControls;
  assert.deepEqual(parseLibrary(JSON.stringify(library)).decks[0].layout, { workspace: 46 });
});

test('hidden zones survive backups without excluding their cards from decks or exports', async () => {
  const { deckText, countCards, validateDeck } = await import('../src/lib/model.ts');
  const library = createLibrary();
  let d = addCard(deck(), 'Opt', 1, 'main');
  d = addCard(d, 'Opt', 4, 'side');
  d = addCard(d, 'Maybe', 2, 'considering');
  const before = deckText(d, 'extended');
  d.layout = { hiddenZones: ['side', 'considering'] };
  library.decks = [d];
  const restored = parseLibrary(JSON.stringify(library)).decks[0];
  assert.deepEqual(restored.layout!.hiddenZones, ['side', 'considering']);
  assert.equal(countCards(restored, 'side'), 4); assert.equal(countCards(restored, 'considering'), 2);
  assert.equal(deckText(restored, 'extended'), before);
  assert.ok(validateDeck(restored, { ...library.formats[0], gameplayOnly: false, normalOnly: false, minCards: 1, copyLimit: 4 }).some(issue => /5 copies/.test(issue)));
  const invalid = JSON.parse(JSON.stringify(library)); invalid.decks[0].layout.hiddenZones = ['invalid-section'];
  assert.throws(() => parseLibrary(JSON.stringify(invalid)));
});
