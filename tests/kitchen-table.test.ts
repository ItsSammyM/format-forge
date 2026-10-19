import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCard, blankFormat, createLibrary, deckCardStatuses, deckPoints, parseLibrary, validateDeck } from '../src/lib/model.ts';
import type { Deck } from '../src/lib/model.ts';
import { addDefaultFormats, isDefaultFormat } from '../src/lib/default-formats.ts';
import { buildSearchQuery, cardInfo, emptyFilters, filterFormatCards } from '../src/lib/scryfall.ts';
import type { ScryfallCard } from '../src/lib/scryfall.ts';

const raw = (name: string, type = 'Artifact', patch: Partial<ScryfallCard> = {}): ScryfallCard => ({ id: name, name, set: 'ust', collector_number: '1', type_line: type, color_identity: [], border_color: 'silver', legalities: { vintage: 'not_legal' }, ...patch });
const deck = (): Deck => ({ id: 'no-format-deck', name: 'Anything goes', formatId: 'no-format', notes: '', cards: [], updatedAt: '2026-10-15' });

test('No Format accepts cards, copy counts and sizes without deckbuilding rules', () => {
  const format = createLibrary().formats.find(item => item.id === 'no-format')!;
  assert.equal(format.name, 'No Format');
  assert.equal(format.minCards, 0); assert.equal(format.maxCards, null);
  assert.equal(format.maxSideboard, null); assert.equal(format.copyLimit, null);
  assert.deepEqual(validateDeck(deck(), format), []);
  let d = addCard(deck(), "Krark's Other Thumb", 400, 'main', cardInfo(raw("Krark's Other Thumb")));
  d = addCard(d, 'Contract from Below', 100, 'side', cardInfo(raw('Contract from Below', 'Sorcery', { border_color: 'black', legalities: { vintage: 'banned' } })));
  d = addCard(d, 'Anything', 2, 'companion', cardInfo(raw('Anything')));
  assert.deepEqual(validateDeck(d, format), []);
  assert.ok([...deckCardStatuses(d, format).values()].every(s => !s.illegal.length && !s.limits.length));
  const library = createLibrary(); library.decks = [d];
  const restored = parseLibrary(JSON.stringify(library));
  assert.deepEqual(validateDeck(restored.decks[0], restored.formats[0]), []);
});

test('No Format does not apply card eligibility filters', () => {
  const format = createLibrary().formats.find(item => item.id === 'no-format')!;
  const cards = [raw("Krark's Other Thumb"), raw('Contract from Below', 'Sorcery'), raw('Invoke Prejudice', 'Enchantment'), raw('1999 World Championships Ad', 'Card'), raw('Squirrel', 'Token Creature — Squirrel'), raw('Art', 'Art Series', { layout: 'art_series' })];
  assert.deepEqual(filterFormatCards(cards, format).map(c => c.name), cards.map(c => c.name));
  let d = deck(); for (const card of cards) d = addCard(d, card.name, 1, 'main', cardInfo(card));
  assert.deepEqual(validateDeck(d, format), []);
  const query = buildSearchQuery('', { ...emptyFilters(), normalOnly: false, includeTokens: true }, format);
  assert.ok(!query.includes('-t:card -t:token -t:emblem -layout:art_series'));
  assert.ok(!query.includes('legal:vintage'));
});

test('unlimited copies retain named restrictions, point totals and strict import validation', () => {
  const library = createLibrary();
  const format = { ...library.formats[0], restricted: [{ name: 'Sol Ring', limit: 1 }], pointed: [{ name: 'Sol Ring', points: 3 }] };
  let d = addCard(deck(), 'Sol Ring', 2, 'side', cardInfo(raw('Sol Ring')));
  d = addCard(d, 'Sol Ring', 5, 'considering', cardInfo(raw('Sol Ring')));
  assert.equal(deckPoints(d, format), 6);
  assert.ok(validateDeck(d, format).some(i => /limit is 1/.test(i)));
  assert.ok(deckCardStatuses(d, format).get(d.cards[0].id)!.limits.length);
  for (const copyLimit of [0, -1, 1.5]) {
    const invalid = { ...library, formats: [{ ...format, copyLimit }] };
    assert.throws(() => parseLibrary(JSON.stringify(invalid)));
  }
});

test('default migration removes Kitchen table, moves its decks to No Format, and removes unused Singleton', () => {
  const oldSingleton = { ...blankFormat(), id: 'singleton-workshop', name: 'Singleton', copyLimit: 1 };
  const library = { ...createLibrary(), defaultsVersion: 11 as const };
  library.formats.push({ ...blankFormat(), id: 'kitchen-table', name: 'Kitchen table', copyLimit: null, minCards: 0, maxCards: null, maxSideboard: null });
  library.formats.push(oldSingleton);
  library.decks = [{ ...deck(), formatId: 'kitchen-table' }];
  const migrated = addDefaultFormats(library);
  assert.ok(migrated.formats.some(f => f.id === 'no-format'));
  assert.equal(migrated.decks[0].formatId, 'no-format');
  assert.ok(!migrated.formats.some(f => f.id === 'kitchen-table'));
  assert.ok(!migrated.formats.some(f => f.id === 'singleton-workshop'));
  assert.equal(addDefaultFormats(migrated), migrated);
  library.decks = [{ ...deck(), formatId: 'singleton-workshop' }];
  const linked = addDefaultFormats(library);
  assert.ok(linked.formats.some(f => f.id === linked.decks[0].formatId));
  assert.equal(isDefaultFormat('singleton-workshop'), false);
  assert.ok(createLibrary().formats.every(f => isDefaultFormat(f.id)));
  assert.ok(!createLibrary().formats.some(f => f.id === 'kitchen-table'));
});
