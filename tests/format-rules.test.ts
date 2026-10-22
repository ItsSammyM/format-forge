import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCard, blankFormat, createLibrary, validateDeck, parseLibrary, setLegality, changePrinting, parseCardNames } from '../src/lib/model.ts';
import type { CardInfo, Deck, Format } from '../src/lib/model.ts';
import { buildSearchQuery, emptyFilters, cardInfo, filterFormatCards } from '../src/lib/scryfall.ts';
const format = (): Format => ({ ...blankFormat(), name: 'Rules', normalOnly: false, minCards: 1 });
const deck = (): Deck => ({ id: 'rules', name: 'Rules', formatId: 'kitchen-table', cards: [], notes: '', updatedAt: '2026-10-14T00:00:00Z' });
const info = (patch: Partial<CardInfo> = {}): CardInfo => ({ scryfallId: 'fixture', oracleId: 'fixture-oracle', set: 'dmu', collectorNumber: '1', manaCost: '{R}', colorIdentity: ['R'], typeLine: 'Instant', oracleText: '', rarity: 'rare', vintageLegality: 'legal', ...patch });

test('new formats and searches default to tournament cards and retain Vintage restricted cards', () => {
  assert.equal(blankFormat().normalOnly, true); assert.equal(emptyFilters().normalOnly, true);
  const f = { ...format(), normalOnly: true };
  for (const status of ['legal', 'restricted']) assert.deepEqual(validateDeck(addCard(deck(), 'Tournament card', 1, 'main', info({ vintageLegality: status })), f), []);
  for (const status of ['banned', 'not_legal']) assert.match(validateDeck(addCard(deck(), 'Other card', 1, 'main', info({ vintageLegality: status })), f)[0], /tournament card pool/);
  assert.match(validateDeck(addCard(deck(), 'Unknown', 1, 'main'), f)[0], /not verified/);
  assert.deepEqual(validateDeck(addCard(deck(), 'Other card', 1, 'main', info({ vintageLegality: 'not_legal' })), format()), []);
  assert.equal(buildSearchQuery('', { ...emptyFilters(), normalOnly: false }), '-t:token');
});
test('Pauper-style rarity eligibility follows common reprints, not the selected edition', () => {
  const f = { ...format(), bannedRarities: ['uncommon', 'rare', 'mythic', 'special', 'bonus'] as Format['bannedRarities'] };
  const commonReprint = addCard(deck(), 'Downshift', 1, 'main', info({ printRarities: ['rare', 'common'], setsComplete: true }));
  assert.deepEqual(validateDeck(commonReprint, f), []);
  assert.match(validateDeck(addCard(deck(), 'Rare', 1, 'main', info({ printRarities: ['rare'], setsComplete: true })), f)[0], /no printing at an allowed rarity/);
  assert.match(validateDeck(addCard(deck(), 'Unknown reprints', 1, 'main', info()), f)[0], /not verified/);
  assert.ok(buildSearchQuery('', emptyFilters(), f).includes('(in:common)'));
  const changed = changePrinting(commonReprint, commonReprint.cards[0].id, info({ scryfallId: 'new-edition' }));
  assert.deepEqual(changed.cards[0].info!.printRarities, ['rare', 'common']);
});
test('restricted copies count across active sections and ignore considering', () => {
  const f = { ...format(), restricted: [{ name: 'Lightning Bolt', limit: 1 }] };
  let d = addCard(deck(), 'lightning bolt', 1, 'main', info());
  d = addCard(d, 'Lightning Bolt', 20, 'considering', info());
  assert.deepEqual(validateDeck(d, f), []);
  d = addCard(d, 'LIGHTNING BOLT', 1, 'side', info());
  assert.match(validateDeck(d, f)[0], /2 copies.*limit is 1/);
  assert.deepEqual(validateDeck(d, { ...f, restricted: [{ name: 'Lightning Bolt', limit: 2 }] }), []);
  assert.match(validateDeck(d, { ...f, banned: ['Lightning Bolt'] })[0], /is banned/);
  const basics = addCard(deck(), 'Mountain', 2, 'main', info());
  assert.match(validateDeck(basics, { ...f, restricted: [{ name: 'Mountain', limit: 1 }] })[0], /limit is 1/);
});
test('legal card lists replace pool rules and preserve bans, quantities, and considering exclusions', () => {
  const f = { ...format(), whitelistOnly: true, allowedCards: ['Custom Card'], allowedSets: ['m21'], normalOnly: true, restricted: [{ name: 'Custom Card', limit: 1 }], bannedRarities: ['rare'] as Format['bannedRarities'] };
  const d = addCard(deck(), 'CUSTOM CARD', 1, 'main', info({ vintageLegality: 'not_legal' }));
  assert.deepEqual(validateDeck(d, f), []);
  assert.equal(setLegality(d.cards[0], f), 'legal');
  assert.match(validateDeck(addCard(deck(), 'Not Listed', 1, 'main', info()), f)[0], /not in the legal card list/);
  assert.match(validateDeck(d, { ...f, banned: ['Custom Card'] })[0], /is banned/);
  assert.match(validateDeck(addCard(d, 'Custom Card', 1, 'side'), f)[0], /limit is 1/);
  assert.deepEqual(validateDeck(addCard(d, 'Not Listed', 1, 'considering'), f), []);
  const q = buildSearchQuery('', { ...emptyFilters(), normalOnly: false }, f);
  assert.equal(q, '-t:token');
  assert.deepEqual(parseCardNames('1 Custom Card\nCustom Card\n2 Other Card'), ['Custom Card', 'Other Card']);
});
test('new format rules, set names, rarity histories, and display modes survive backups', () => {
  const library = createLibrary();
  library.formats[0] = { ...library.formats[0], whitelistOnly: true, allowedCards: ['Lightning Bolt'], bannedRarities: ['mythic'], restricted: [{ name: 'Lightning Bolt', limit: 2 }] };
  library.decks = [{ ...addCard(deck(), 'Lightning Bolt', 1, 'main', info({ setName: 'Dominaria United', printRarities: ['common', 'rare'] })), views: { main: { display: 'cards', sort: 'name', group: 'type', direction: 'asc' }, side: { display: 'compact', sort: 'name', group: 'none', direction: 'asc' } } }];
  assert.deepEqual(JSON.parse(JSON.stringify(parseLibrary(JSON.stringify(library)))), library);
  const malformed = structuredClone(library); malformed.formats[0].restricted![0].limit = 0;
  assert.throws(() => parseLibrary(JSON.stringify(malformed)));
  const empty = structuredClone(library); empty.formats[0].allowedCards = [];
  assert.throws(() => parseLibrary(JSON.stringify(empty)));
  const badView = structuredClone(library); (badView.decks[0].views!.main as unknown as { display: string }).display = 'bad';
  assert.throws(() => parseLibrary(JSON.stringify(badView)));
});
test('printing metadata retains the full set name, rarity, and Vintage status', () => {
  const card = { id: 'printing', name: 'Print', set: 'dmu', set_name: 'Dominaria United', collector_number: '1', type_line: 'Instant', mana_cost: '{R}', color_identity: ['R'], rarity: 'uncommon', legalities: { vintage: 'restricted' } };
  const metadata = cardInfo(card);
  assert.equal(metadata.setName, 'Dominaria United'); assert.equal(metadata.rarity, 'uncommon'); assert.equal(metadata.vintageLegality, 'restricted');
  const listed = { ...format(), whitelistOnly: true, allowedCards: ['Print'] };
  assert.deepEqual(filterFormatCards([card, { ...card, name: 'Print Other' }], listed), [card]);
});

test('points are weighted by copies, include active roles and ignore considering', async () => {
  const { deckPoints } = await import('../src/lib/model.ts');
  const f = { ...format(), pointed: [{ name: 'Sol Ring', points: 2 }, { name: 'Demonic Tutor', points: 3 }], maxPoints: 10 };
  let d = addCard(deck(), 'SOL RING', 2, 'main', info());
  d = addCard(d, 'Demonic Tutor', 1, 'commander', info());
  d = addCard(d, 'Sol Ring', 1, 'side', info());
  d = addCard(d, 'Demonic Tutor', 20, 'considering', info());
  assert.equal(deckPoints(d, f), 9);
  assert.deepEqual(validateDeck(d, f), []);
  d = addCard(d, 'Sol Ring', 1, 'companion', { ...info(), scryfallId: '', oracleText: '' });
  assert.equal(deckPoints(d, f), 11);
  assert.ok(validateDeck(d, f).some(issue => /11 points.*limit is 10/.test(issue)));
  assert.equal(deckPoints(d, { ...f, pointed: [] }), 0);
});
test('restriction and points bulk lists accept decklists, explicit values and case-insensitive updates', async () => {
  const { parseValuedCards, mergeValuedCards } = await import('../src/lib/model.ts');
  assert.deepEqual(parseValuedCards('Deck\n4 Lightning Bolt (M11) 146\nSideboard\nSol Ring\nDemonic Tutor = 3\nTime Walk: 5\nMana Crypt\t2', 1, 1), [
    { name: 'Lightning Bolt', value: 1 }, { name: 'Sol Ring', value: 1 }, { name: 'Demonic Tutor', value: 3 }, { name: 'Time Walk', value: 5 }, { name: 'Mana Crypt', value: 2 },
  ]);
  const existing = [{ name: 'Sol Ring', value: 2 }, { name: 'Other', value: 1 }];
  const imported = parseValuedCards('sol ring = 3\nNew = 0', 1);
  assert.deepEqual(mergeValuedCards(existing, imported), [{ name: 'sol ring', value: 3 }, { name: 'Other', value: 1 }, { name: 'New', value: 0 }]);
  assert.deepEqual(mergeValuedCards(existing, imported, true), imported);
  assert.deepEqual(mergeValuedCards(existing, [], true), []);
  for (const bad of ['Sol Ring = -1', 'Sol Ring = 1.5', 'Sol Ring = 1000', 'Sol Ring = nope']) assert.throws(() => parseValuedCards(bad, 1));
  assert.throws(() => parseValuedCards('Sol Ring = 0', 1, 1));
});
test('points and all window visibility preferences survive backups and standalone format exports', async () => {
  const { UI_SECTIONS, formatText, parseFormatText } = await import('../src/lib/model.ts');
  const library = createLibrary();
  library.formats[0] = { ...library.formats[0], id: 'custom-export', pointed: [{ name: 'Sol Ring', points: 2 }], maxPoints: 10 };
  library.decks = [{ ...deck(), layout: { hiddenZones: [...UI_SECTIONS], landsOpen: true } }];
  const restored = parseLibrary(JSON.stringify(library));
  assert.deepEqual(restored.decks[0].layout!.hiddenZones, UI_SECTIONS);
  assert.equal(restored.decks[0].layout!.landsOpen, true);
  assert.deepEqual(parseFormatText(formatText(library.formats[0]))[0], library.formats[0]);
  const defaultFormat = createLibrary().formats.find(format => format.id === 'commander')!;
  assert.deepEqual(parseFormatText(formatText(defaultFormat)), [defaultFormat]);
  const invalid = JSON.parse(JSON.stringify(library)); invalid.formats[0].pointed[0].points = -1;
  assert.throws(() => parseLibrary(JSON.stringify(invalid)));
  invalid.formats[0].pointed[0].points = 2; invalid.formats[0].maxPoints = 1.5;
  assert.throws(() => parseLibrary(JSON.stringify(invalid)));
});

test('point values and copy limits recognize the front name of double-faced cards', async () => {
  const { deckPoints } = await import('../src/lib/model.ts');
  const f = { ...format(), pointed: [{ name: 'Front Card', points: 3 }], restricted: [{ name: 'Front Card', limit: 1 }] };
  let d = addCard(deck(), 'Front Card // Back Card', 1, 'main', info());
  assert.equal(deckPoints(d, f), 3); assert.deepEqual(validateDeck(d, f), []);
  d = addCard(d, 'Front Card', 1, 'side', info());
  assert.equal(deckPoints(d, f), 6);
  assert.ok(validateDeck(d, f).some(issue => /2 copies.*limit is 1/.test(issue)));
});

test('considering shows illegal cards, while only active copy and point excesses get limit warnings', async () => {
  const { deckCardStatuses } = await import('../src/lib/model.ts');
  const f = { ...format(), minSideboard: 5, banned: ['Banned'], restricted: [{ name: 'Restricted', limit: 1 }], pointed: [{ name: 'Pointed', points: 3 }], maxPoints: 2 };
  let d = addCard(deck(), 'Banned', 1, 'considering', info());
  d = addCard(d, 'Restricted', 2, 'main', info());
  d = addCard(d, 'Pointed', 1, 'main', info());
  d = addCard(d, 'Plain', 1, 'side', info());
  d = addCard(d, 'Pointed', 3, 'considering', info());
  const statuses = deckCardStatuses(d, f);
  assert.deepEqual(statuses.get(d.cards[0].id)!.illegal, ['Banned card']);
  assert.ok(statuses.get(d.cards[1].id)!.limits.some(reason => /Copy limit/.test(reason)));
  assert.ok(statuses.get(d.cards[2].id)!.limits.some(reason => /Point budget/.test(reason)));
  assert.deepEqual(statuses.get(d.cards[3].id)!.limits, []);
  assert.deepEqual(statuses.get(d.cards[4].id)!.limits, []);
  assert.ok(validateDeck(d, f).some(issue => /Sideboard needs/.test(issue)));
});
test('stacked zone proportions persist and invalid proportions are rejected', () => {
  const library = createLibrary(); library.decks = [{ ...deck(), layout: { zoneSplits: { side: 40, considering: 60, commander: 50 } } }];
  assert.deepEqual(parseLibrary(JSON.stringify(library)).decks[0].layout!.zoneSplits, library.decks[0].layout!.zoneSplits);
  const invalid = JSON.parse(JSON.stringify(library)); invalid.decks[0].layout.zoneSplits.side = 0;
  assert.throws(() => parseLibrary(JSON.stringify(invalid)));
});
