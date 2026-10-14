import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCard, countCards, createLibrary, deckSize, sideboardSize, deckText, moveCard, parseCardNames, parseDeckText, parseLibrary, setLegality, validateDeck, visibleZones } from '../src/lib/model.ts';
import type { CardInfo, Deck, Format } from '../src/lib/model.ts';

const format = (): Format => ({ ...createLibrary().formats[0], normalOnly: false, minCards: 1 });
const deck = (): Deck => ({ id: 'deck-1', name: 'Test deck', formatId: 'kitchen-table', notes: '', updatedAt: '2026-01-01T00:00:00.000Z', cards: [] });

test('copy limits include mainboard and sideboard and ignore case', () => {
  let d = addCard(deck(), 'Lightning Bolt', 4, 'main');
  d = addCard(d, 'lightning bolt', 1, 'side');
  assert.equal(validateDeck(d, format()).length, 1);
  assert.match(validateDeck(d, format())[0], /5 copies across deck sections/);
});

test('basic land exemption can be disabled and never overrides bans', () => {
  const d = addCard(deck(), 'Snow-Covered Island', 20, 'main');
  assert.deepEqual(validateDeck(d, format()), []);
  assert.match(validateDeck(d, { ...format(), basicLandExemption: false })[0], /20 copies/);
  assert.match(validateDeck(d, { ...format(), banned: ['snow-covered island'] })[0], /is banned/);
});

test('minimum, maximum, and sideboard limits are independent', () => {
  const f = { ...format(), minCards: 60, maxCards: 60, maxSideboard: 0 };
  let d = addCard(deck(), 'Plains', 59, 'main');
  assert.match(validateDeck(d, f)[0], /1 more/);
  d = addCard(d, 'Plains', 2, 'main');
  d = addCard(d, 'Forest', 1, 'side');
  assert.equal(validateDeck(d, f).length, 2);
  assert.equal(countCards(d, 'main'), 61);
});

test('adding cards merges only the same name in the same zone', () => {
  let d = addCard(deck(), ' Lightning Bolt ', 2, 'main');
  d = addCard(d, 'LIGHTNING BOLT', 1, 'main');
  d = addCard(d, 'Lightning Bolt', 1, 'side');
  assert.equal(d.cards.length, 2);
  assert.equal(d.cards[0].quantity, 3);
  assert.equal(d.cards[0].name, 'Lightning Bolt');
  assert.equal(deckText(d), '3 Lightning Bolt\n\nSideboard\n1 Lightning Bolt\n');
});

test('invalid quantities and overflow cannot enter a deck', () => {
  assert.throws(() => addCard(deck(), '', 1, 'main'));
  for (const n of [0, -1, 1.5, NaN, 1000]) assert.throws(() => addCard(deck(), 'Forest', n, 'main'));
  const d = addCard(deck(), 'Forest', 999, 'main');
  assert.throws(() => addCard(d, 'Forest', 1, 'main'));
});

test('library backups preserve decks and format rules', () => {
  const library = createLibrary();
  library.decks.push(addCard(deck(), 'Forest', 60, 'main'));
  assert.deepEqual(parseLibrary(JSON.stringify(library)), library);
});

test('imports reject unknown versions, dangling formats, and duplicate IDs', () => {
  assert.throws(() => parseLibrary('{"version":2,"formats":[],"decks":[]}'));
  const library = createLibrary();
  library.decks.push({ ...deck(), formatId: 'missing' });
  assert.throws(() => parseLibrary(JSON.stringify(library)));
  library.decks = [deck(), deck()];
  assert.throws(() => parseLibrary(JSON.stringify(library)));
  library.decks = [];
  library.formats.push(library.formats[0]);
  assert.throws(() => parseLibrary(JSON.stringify(library)));
});

test('imports reject invalid ranges, quantities, and duplicate card entries', () => {
  const library = createLibrary();
  library.formats[0].maxCards = 59;
  assert.throws(() => parseLibrary(JSON.stringify(library)));
  library.formats[0].maxCards = null;
  const d = addCard(deck(), 'Island', 1, 'main');
  library.decks = [d];
  d.cards[0].quantity = -1;
  assert.throws(() => parseLibrary(JSON.stringify(library)));
  d.cards[0].quantity = 1;
  d.cards.push({ ...d.cards[0], id: 'different-id', name: 'ISLAND' });
  assert.throws(() => parseLibrary(JSON.stringify(library)));
});

const info = (patch: Partial<CardInfo> = {}): CardInfo => ({ scryfallId: 'card-1', set: 'dmu', collectorNumber: '1', typeLine: 'Legendary Creature', oracleText: '', colorIdentity: ['U'], manaCost: '{U}', ...patch });

test('considering cards do not affect sizes, bans, or copy limits', () => {
  let d = addCard(deck(), 'Forest', 1, 'main');
  d = addCard(d, 'Banned card', 10, 'considering');
  assert.deepEqual(validateDeck(d, { ...format(), banned: ['Banned card'] }), []);
  assert.equal(deckSize(d), 1);
});

test('moving cards preserves metadata and merges target quantities', () => {
  let d = addCard(deck(), 'Forest', 1, 'main', info());
  d = addCard(d, 'forest', 2, 'considering');
  const moved = moveCard(d, d.cards[0].id, 'considering');
  assert.equal(moved.cards.length, 1);
  assert.equal(moved.cards[0].quantity, 3);
  assert.deepEqual(moved.cards[0].info, info());
});

test('partial moves retain the remaining cards and merge only the moved quantity', () => {
  let d = addCard(deck(), 'Lightning Bolt', 4, 'main', info());
  d = addCard(d, 'lightning bolt', 1, 'side');
  const moved = moveCard(d, d.cards[0].id, 'side', 1);
  assert.equal(countCards(moved, 'main'), 3);
  assert.equal(countCards(moved, 'side'), 2);
  assert.equal(moved.cards[0].id, d.cards[0].id);
  assert.deepEqual(moved.cards[1].info, info());
  assert.equal(d.cards[0].quantity, 4);
  for (const count of [0, 5, -1, 1.5, NaN]) assert.throws(() => moveCard(d, d.cards[0].id, 'side', count));
});

test('failed move overflow leaves both source and target intact', () => {
  let d = addCard(deck(), 'Forest', 4, 'main');
  d = addCard(d, 'Forest', 999, 'side');
  assert.throws(() => moveCard(d, d.cards[0].id, 'side', 1));
  assert.equal(countCards(d, 'main'), 4);
  assert.equal(countCards(d, 'side'), 999);
});

test('extra sections exist only while they contain cards', () => {
  const d = deck();
  assert.deepEqual(visibleZones(d), ['main', 'side', 'considering']);
  const added = addCard(d, 'Leader', 1, 'commander');
  assert.deepEqual(visibleZones(added), ['main', 'side', 'considering', 'commander']);
  const moved = moveCard(added, added.cards[0].id, 'conspiracy', 1);
  assert.deepEqual(visibleZones(moved), ['main', 'side', 'considering', 'conspiracy']);
});

test('ban plaintext accepts names, quantities, sections, and printings', () => {
  const names = parseCardNames('Lightning Bolt\n1 lightning bolt (M11) 146\n\nDeck\n2 Sol Ring (CMM) 396\n\nSideboard\nSB: 1 Negate\n// comments\n1 Opt *F* #Draw');
  assert.deepEqual(names, ['lightning bolt', 'Sol Ring', 'Negate', 'Opt']);
  assert.deepEqual(parseCardNames('Lightning Bolt\nSol Ring'), ['Lightning Bolt', 'Sol Ring']);
  assert.throws(() => parseCardNames('0 Opt'));
  assert.throws(() => parseCardNames(''));
});

test('both lower and upper sideboard limits are checked', () => {
  const f = { ...format(), minSideboard: 2, maxSideboard: 3 };
  let d = addCard(deck(), 'Forest', 1, 'main');
  assert.match(validateDeck(d, f)[0], /Sideboard needs 2/);
  d = addCard(d, 'Island', 4, 'side');
  assert.match(validateDeck(d, f)[0], /Sideboard exceeds/);
  assert.deepEqual(validateDeck(d, { ...f, maxSideboard: null }), []);
});

test('set legality allows reprints and keeps unresolved cards unknown', () => {
  const f = { ...format(), allowedSets: ['m21'] };
  const d = addCard(deck(), 'Example', 1, 'main', info({ set: 'dmu', printSets: ['dmu', 'm21'], setsComplete: true }));
  assert.equal(setLegality(d.cards[0], f), 'legal');
  assert.deepEqual(validateDeck(d, f), []);
  assert.equal(setLegality({ ...d.cards[0], info: info({ printSets: ['dmu'], setsComplete: true }) }, f), 'illegal');
  assert.equal(setLegality({ ...d.cards[0], info: undefined }, f), 'unknown');
  assert.equal(setLegality({ ...d.cards[0], info: info({ scryfallId: '', set: 'm21' }) }, f), 'unknown');
});

test('commanders count toward deck size and color identity is checked', () => {
  const f = { ...format(), minCards: 3, maxCards: 3, copyLimit: 1, maxSideboard: 0, commanderRules: true };
  let d = addCard(deck(), 'Blue commander', 1, 'commander', info());
  d = addCard(d, 'Island', 2, 'main', info({ typeLine: 'Basic Land' }));
  assert.equal(deckSize(d), 3);
  assert.deepEqual(validateDeck(d, f), []);
  d = addCard(d, 'Red spell', 1, 'main', info({ typeLine: 'Instant', colorIdentity: ['R'] }));
  assert.ok(validateDeck(d, f).some(i => i.includes('color identity')));
});

test('partner commanders require compatible abilities', () => {
  let d = addCard(deck(), 'First', 1, 'commander', info({ oracleText: 'Partner (You can have two commanders.)' }));
  d = addCard(d, 'Second', 1, 'commander', info({ oracleText: 'Partner (You can have two commanders.)' }));
  assert.deepEqual(validateDeck(d, { ...format(), commanderRules: true }), []);
  d.cards[1].info!.oracleText = '';
  assert.ok(validateDeck(d, { ...format(), commanderRules: true }).some(i => i.includes('pairing')));
});

test('companions count toward ordinary sideboards but not commander sideboards', () => {
  let d = addCard(deck(), 'Commander', 1, 'commander', info());
  d = addCard(d, 'Companion', 1, 'companion', info({ oracleText: 'Companion — A deck restriction.' }));
  assert.equal(sideboardSize(d), 1);
  assert.equal(sideboardSize(d, { ...format(), commanderRules: true }), 0);
  assert.deepEqual(validateDeck(d, { ...format(), maxSideboard: 0, commanderRules: true }), []);
});

test('Arena-style import preserves sections and printing preferences', () => {
  const cards = parseDeckText('Commander\n1 Blue Commander (DMU) 12\n\nDeck\n4x Lightning Bolt (M11) 146\n20 Mountain\n\nSideboard\n2 Abrade\n\nMaybeboard\n1 Opt');
  assert.deepEqual(cards.map(c => [c.name, c.quantity, c.zone]), [['Blue Commander', 1, 'commander'], ['Lightning Bolt', 4, 'main'], ['Mountain', 20, 'main'], ['Abrade', 2, 'side'], ['Opt', 1, 'considering']]);
  assert.equal(cards[1].info?.set, 'm11');
  assert.equal(cards[1].info?.collectorNumber, '146');
});

test('MTGO prefixes, comment headers, inline roles, and blank sideboards import', () => {
  assert.equal(parseDeckText('4 Opt\nSB: 2 Negate')[1].zone, 'side');
  assert.equal(parseDeckText('4 Opt\n\n2 Negate')[1].zone, 'side');
  assert.equal(parseDeckText('// Sideboard\n2 Negate')[0].zone, 'side');
  assert.equal(parseDeckText('1 Commander [Commander]')[0].zone, 'commander');
  assert.equal(parseDeckText('4 Opt *F* #Draw')[0].name, 'Opt');
  assert.throws(() => parseDeckText('4 Opt\nThis is not a card line'), /Line 2/);
});

test('exports round-trip companion designation without double counting', () => {
  let d = addCard(deck(), 'Commander', 1, 'commander');
  d = addCard(d, 'Companion', 1, 'companion');
  d = addCard(d, 'Companion', 2, 'side');
  d = addCard(d, 'Forest', 60, 'main');
  for (const style of ['arena', 'plain'] as const) {
    const imported = { ...d, cards: parseDeckText(deckText(d, style)) };
    assert.equal(sideboardSize(imported), 3);
    assert.equal(countCards(imported, 'companion'), 1);
    assert.equal(countCards(imported, 'side'), 2);
  }
});

test('all-section exports preserve considering and conspiracy cards', () => {
  let d = addCard(deck(), 'Forest', 60, 'main');
  d = addCard(d, 'Opt', 1, 'considering');
  d = addCard(d, 'Backup Plan', 1, 'conspiracy');
  assert.ok(!deckText(d, 'arena').includes('Opt'));
  assert.ok(!deckText(d, 'arena').includes('Backup Plan'));
  const cards = parseDeckText(deckText(d, 'extended'));
  assert.deepEqual(cards.map(c => [c.name, c.quantity, c.zone]), d.cards.map(c => [c.name, c.quantity, c.zone]));
});

test('old browser libraries migrate new fields without losing decks', () => {
  const library = createLibrary();
  const oldFormat = { ...library.formats[0] } as Partial<Format>;
  delete oldFormat.allowedSets; delete oldFormat.minSideboard; delete oldFormat.commanderRules;
  const raw = JSON.stringify({ version: 1, formats: [oldFormat], decks: [deck()] });
  const migrated = parseLibrary(raw);
  assert.deepEqual(migrated.formats[0].allowedSets, []);
  assert.equal(migrated.formats[0].minSideboard, 0);
  assert.equal(migrated.formats[0].commanderRules, false);
  assert.equal(migrated.decks[0].id, 'deck-1');
});

test('backups preserve card metadata and reject impossible sideboard ranges', () => {
  const library = createLibrary();
  library.decks = [addCard(deck(), 'Commander', 1, 'commander', info())];
  assert.equal(parseLibrary(JSON.stringify(library)).decks[0].cards[0].info?.scryfallId, 'card-1');
  library.formats[0].minSideboard = 16;
  assert.throws(() => parseLibrary(JSON.stringify(library)));
});

test('native drag survives pointercancel while an active touch drag can cancel', async () => {
  const { isPointerDrag } = await import('../src/lib/model.ts');
  assert.equal(isPointerDrag({}, 1), false);
  assert.equal(isPointerDrag(null, 1), false);
  assert.equal(isPointerDrag({ pointerId: 4 }, 1), false);
  assert.equal(isPointerDrag({ pointerId: 4 }, 4), true);
});
test('text editing preserves tags and printing metadata across zone changes', async () => {
  const { replaceDeckText } = await import('../src/lib/model.ts');
  const info: CardInfo = { scryfallId: 'bolt', set: 'm11', collectorNumber: '146', manaCost: '{R}', typeLine: 'Instant', oracleText: 'Damage', colorIdentity: ['R'], manaValue: 1 };
  const d = addCard(deck(), 'Lightning Bolt', 4, 'main', info, ['removal']);
  const edited = replaceDeckText(d, 'Deck\n3 Lightning Bolt\n\nSideboard\n1 Lightning Bolt');
  assert.deepEqual(edited.cards.map(c => [c.zone, c.quantity]), [['main', 3], ['side', 1]]);
  for (const c of edited.cards) { assert.deepEqual(c.tags, ['removal']); assert.deepEqual(c.info, info); }
  const editionChanged = replaceDeckText(d, '4 Lightning Bolt (lea) 161');
  assert.equal(editionChanged.cards[0].info!.set, 'lea');
  assert.equal(editionChanged.cards[0].info!.scryfallId, '');
  assert.throws(() => replaceDeckText(d, '0 Bad Card'));
  assert.equal(d.cards[0].quantity, 4);
  assert.equal(replaceDeckText(d, '').cards.length, 0);
  assert.equal(replaceDeckText(d, '# Format Forge separate roles\nDeck\nSideboard').cards.length, 0);
});
test('deck tags, list details and preferred printings survive library backups', () => {
  const library = createLibrary();
  const info: CardInfo = { scryfallId: 'bolt', set: 'm11', collectorNumber: '146', manaCost: '{R}', typeLine: 'Instant', oracleText: 'Damage', colorIdentity: ['R'] };
  library.preferredPrintings = { 'lightning bolt': info };
  library.decks = [{ ...deck(), tags: ['aggro'], views: { main: { sort: 'name', group: 'colors', direction: 'asc', details: ['manaValue', 'manaCost'], showPrintings: true } } }];
  assert.deepEqual(JSON.parse(JSON.stringify(parseLibrary(JSON.stringify(library)))), library);
});
test('explicit eternal formats allow all sets even when imported set codes remain', () => {
  assert.equal(setLegality({ id: 'card', name: 'Test', quantity: 1, zone: 'main' }, { ...format(), eternal: true, allowedSets: ['dmu'] }), 'legal');
});
