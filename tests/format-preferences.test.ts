import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCard, blankFormat, createLibrary, deckCardStatuses, deckPrice, parseLibrary, validateDeck, setLegality, formatText, parseFormatText, tournamentOnly } from '../src/lib/model.ts';
import type { CardInfo, Deck } from '../src/lib/model.ts';
import { DEFAULT_VIEW, boardView, groupCards } from '../src/lib/deck-view.ts';
import { addDefaultFormats, DEFAULT_FORMAT_IDS, isDefaultFormat } from '../src/lib/default-formats.ts';
import { buildSearchQuery, cardInfo, emptyFilters } from '../src/lib/scryfall.ts';
import { backupText, parseBackupText, transferText, parseTransfer } from '../src/lib/transfer.ts';

const info = (priceUSD: number | null): CardInfo => ({ scryfallId: 'printing', set: 'lea', collectorNumber: '1', typeLine: 'Instant', oracleText: '', colorIdentity: [], manaCost: '{1}', priceUSD, vintageLegality: 'legal', modernLegality: 'legal', manaValue: 1 });
const deck = (): Deck => ({ id: 'prices', name: 'Prices', formatId: 'kitchen-table', notes: '', updatedAt: '2026-10-14T00:00:00Z', cards: [] });
const format = () => ({ ...blankFormat(), name: 'Prices', minCards: 1, minSideboard: 0, normalOnly: false });

test('new deck defaults group by type, sort by mana value and show mana costs in compact mode', () => {
  assert.equal(DEFAULT_VIEW.group, 'type'); assert.equal(DEFAULT_VIEW.sort, 'manaValue'); assert.equal(DEFAULT_VIEW.display, 'compact'); assert.ok(DEFAULT_VIEW.details?.includes('manaCost'));
  const cards = [{ id: 'a', name: 'High', quantity: 1, zone: 'main' as const, info: { ...info(1), manaValue: 5 } }, { id: 'b', name: 'Low', quantity: 1, zone: 'main' as const, info: info(1) }];
  assert.deepEqual(groupCards(cards, boardView())[0].cards.map(card => card.name), ['Low', 'High']);
  const legacy = { sort: 'name' as const, group: 'none' as const, direction: 'desc' as const, display: 'list' as const };
  assert.equal(boardView(legacy).display, 'compact'); assert.equal(boardView(legacy).sort, 'name');
});

test('preferred views, zoom and Modern legality survive backups but preferences stay out of deck transfers', () => {
  const library = createLibrary();
  library.theme = 'light';
  library.preferredView = { sort: 'price', group: 'tags', direction: 'desc', display: 'cards', details: ['manaCost', 'price'], cardSize: 220, showPrintings: true, alwaysShowCardNames: true };
  library.decks = [addCard(deck(), 'Example', 1, 'main', info(15))];
  const restored = parseBackupText(backupText(library));
  assert.deepEqual(restored.preferredView, library.preferredView); assert.equal(restored.theme, 'light'); assert.equal(restored.decks[0].cards[0].info!.modernLegality, 'legal');
  const raw = transferText(library, 'decks', ['prices'], []); assert.ok(!raw.includes('preferredView')); assert.ok(!raw.includes('cardSize')); assert.ok(!raw.includes('theme'));
  const transfer = JSON.parse(raw); transfer.preferredView = library.preferredView; assert.throws(() => parseTransfer(JSON.stringify(transfer)));
  transfer.preferredView = undefined; transfer.theme = 'light'; assert.throws(() => parseTransfer(JSON.stringify(transfer)));
  const combined = transferText(library, 'both', ['prices'], []); assert.ok(!combined.includes('preferredPrintings')); assert.ok(!combined.includes('preferredView')); assert.ok(!combined.includes('theme'));
  for (const size of [0, 99, 321, 150.5]) { library.preferredView.cardSize = size; assert.throws(() => parseLibrary(JSON.stringify(library))); }
  library.preferredView = { ...DEFAULT_VIEW, alwaysShowCardNames: 'yes' as unknown as boolean }; assert.throws(() => parseLibrary(JSON.stringify(library)));
});

test('legacy list views migrate to compact without resetting the selected sort and group', () => {
  const library = createLibrary(); library.decks = [{ ...deck(), views: { main: { sort: 'name', group: 'rarity', direction: 'desc', display: 'list' } } }];
  const restored = parseLibrary(JSON.stringify(library)); assert.equal(restored.decks[0].views!.main!.display, 'compact'); assert.equal(restored.decks[0].views!.main!.group, 'rarity');
});

test('protected defaults include Modern and official Canadian Highlander points and are restored by migration', () => {
  const library = createLibrary();
  assert.ok(DEFAULT_FORMAT_IDS.every(id => library.formats.some(format => format.id === id) && isDefaultFormat(id)));
  assert.equal(isDefaultFormat('custom-copy'), false);
  const modern = library.formats.find(f => f.id === 'modern')!; assert.equal(modern.officialFormat, 'modern');
  const highlander = library.formats.find(f => f.id === 'canadian-highlander')!;
  assert.equal(highlander.minCards, 100); assert.equal(highlander.maxCards, null); assert.equal(highlander.maxPoints, 10); assert.equal(highlander.maxSideboard, 0); assert.equal(highlander.copyLimit, 1);
  assert.equal(highlander.pointed!.find(c => c.name === 'Black Lotus')!.points, 7); assert.equal(highlander.pointed!.find(c => c.name === 'Sol Ring')!.points, 3);
  assert.deepEqual(parseFormatText(formatText(highlander)), [highlander]);
  const edited = { ...library, formats: library.formats.filter(f => f.id !== 'modern').map(f => ({ ...f, description: 'My edited description' })) };
  const migrated = addDefaultFormats(edited); assert.ok(migrated.formats.some(f => f.id === 'modern'));
  assert.equal(migrated.formats.find(f => f.id === 'commander')!.description, 'My edited description'); assert.equal(addDefaultFormats(migrated), migrated);
});

test('Modern card pools check live legality metadata and add one search filter without extra calls', () => {
  const modern = createLibrary().formats.find(f => f.id === 'modern')!;
  const d = addCard(deck(), 'Not Modern', 1, 'main', { ...info(1), modernLegality: 'banned' });
  assert.equal(setLegality(d.cards[0], modern), 'illegal'); assert.ok(deckCardStatuses(d, modern).get(d.cards[0].id)!.illegal.includes('Not legal in Modern'));
  assert.ok(validateDeck(d, modern).some(issue => issue.includes('not legal in Modern')));
  assert.match(buildSearchQuery('', emptyFilters(), modern), /legal:modern/);
  assert.equal(setLegality({ ...d.cards[0], info: { ...info(1), modernLegality: undefined } }, modern), 'unknown');
  assert.equal(cardInfo({ id: 'test', name: 'Test', set: 'lea', collector_number: '1', type_line: 'Instant', color_identity: [], legalities: { modern: 'legal' } }).modernLegality, 'legal');
});

test('automatic tournament bans also apply to explicit legal lists while preserving Vintage restricted cards', () => {
  const f = { ...format(), whitelistOnly: true, allowedCards: ['Ante', 'Power'], banTournamentIllegal: true };
  let d = addCard(deck(), 'Ante', 1, 'main', { ...info(1), vintageLegality: 'banned' });
  d = addCard(d, 'Power', 1, 'main', { ...info(1000), vintageLegality: 'restricted' });
  assert.ok(validateDeck(d, f).some(issue => issue.includes('Ante is outside'))); assert.ok(!validateDeck(d, f).some(issue => issue.includes('Power is outside')));
  assert.ok(deckCardStatuses(d, f).get(d.cards[0].id)!.illegal.length);
  assert.match(buildSearchQuery('', { ...emptyFilters(), normalOnly: false }, f), /legal:vintage or restricted:vintage/);
  assert.equal(tournamentOnly({ ...f, banTournamentIllegal: false, normalOnly: true }), false);
  assert.ok(!validateDeck(d, { ...f, banTournamentIllegal: false }).some(issue => issue.includes('tournament')));
});

test('card price limits flag selected printings in every zone and deck prices count active copies only', () => {
  const f = { ...format(), minCardPrice: 1000, maxCardPrice: 2000, minDeckPrice: 3000, maxDeckPrice: 4000 };
  let d = addCard(deck(), 'Cheap', 1, 'main', info(5)); d = addCard(d, 'Expensive', 2, 'side', info(1500)); d = addCard(d, 'Considering', 1, 'considering', info(2500));
  assert.deepEqual(deckPrice(d), { total: 3005, missing: 0 });
  assert.ok(validateDeck(d, f).some(issue => issue.startsWith('Cheap: Below'))); assert.ok(!validateDeck(d, f).some(issue => issue.startsWith('Considering:')));
  assert.ok(deckCardStatuses(d, f).get(d.cards[2].id)!.illegal.some(issue => issue.includes('maximum card price')));
  assert.match(buildSearchQuery('', emptyFilters(), f), /usd>=1000 usd<=2000/);
  const changed = { ...d, cards: d.cards.map(c => c.name === 'Cheap' ? { ...c, info: info(1500) } : c) };
  assert.ok(!validateDeck(changed, f).some(issue => issue.startsWith('Cheap:'))); assert.ok(validateDeck(changed, f).some(issue => issue.includes('maximum is $4000.00')));
});

test('price limits handle unknown prices, zero, decimal rounding, minima and invalid imports', () => {
  const f = { ...format(), minCardPrice: 0, maxCardPrice: 20, minDeckPrice: 10, maxDeckPrice: 30 };
  let d = addCard(deck(), 'Known', 3, 'main', info(0.1)); d = addCard(d, 'Also known', 1, 'side', info(0.2));
  assert.equal(deckPrice(d).total, 0.5); assert.ok(validateDeck(d, f).some(issue => issue.includes('minimum is $10.00')));
  d = addCard(d, 'Unknown', 1, 'main', info(null));
  assert.ok(validateDeck(d, f).some(issue => issue.includes('Price unavailable'))); assert.ok(!validateDeck(d, f).some(issue => issue.includes('minimum is')));
  assert.deepEqual(parseFormatText(formatText(f)), [f]);
  for (const invalid of [{ minCardPrice: -1 }, { minCardPrice: 30, maxCardPrice: 20 }, { minDeckPrice: 40, maxDeckPrice: 30 }, { maxDeckPrice: Infinity }]) assert.throws(() => parseFormatText(formatText({ ...f, ...invalid })));
});
