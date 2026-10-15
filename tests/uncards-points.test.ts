import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCard, blankFormat, createLibrary, parseLibrary, formatText, parseFormatText, validateDeck, deckCardStatuses, tournamentEligibility, cardPoints, deckPoints } from '../src/lib/model.ts';
import type { Deck, Format } from '../src/lib/model.ts';
import { cardInfo, isUnCard, buildSearchQuery, emptyFilters, filterFormatCards } from '../src/lib/scryfall.ts';
import type { ScryfallCard } from '../src/lib/scryfall.ts';
import { sortCards, groupCards } from '../src/lib/deck-view.ts';
import { backupText, parseBackupText, createTransfer } from '../src/lib/transfer.ts';

const raw = (patch: Partial<ScryfallCard> = {}): ScryfallCard => ({ id: 'un-fixture', name: "Krark's Other Thumb", set: 'ust', collector_number: '1', type_line: 'Legendary Artifact', color_identity: [], border_color: 'silver', legalities: { vintage: 'not_legal' }, ...patch });
const deck = (): Deck => ({ id: 'un-deck', name: 'Un deck', formatId: 'kitchen-table', notes: '', cards: [], updatedAt: '2026-10-15T00:00:00Z' });
const format = (): Format => ({ ...blankFormat(), name: 'Un allowed', minCards: 1, banTournamentIllegal: true, allowUnCards: true });

test('silver-border and acorn gameplay cards are distinct from ads, tokens, emblems and art cards', () => {
  assert.equal(isUnCard(raw()), true);
  assert.equal(isUnCard(raw({ border_color: 'black', security_stamp: 'acorn' })), true);
  assert.equal(isUnCard(raw({ border_color: 'black', security_stamp: 'oval', legalities: { vintage: 'legal' } })), false);
  for (const patch of [
    { type_line: 'Card' }, { type_line: 'Token Creature — Squirrel' }, { type_line: 'Emblem' }, { type_line: 'Art Series' },
    { layout: 'art_series' }, { layout: 'double_faced_token' },
  ]) assert.equal(isUnCard(raw(patch)), false);
  assert.equal(isUnCard(raw({ border_color: 'gold', name: '1999 World Championships Ad', type_line: 'Card' })), false);
});

test('Un-card allowance changes validation and highlights while ante and advertisements stay excluded', () => {
  let d = addCard(deck(), "Krark's Other Thumb", 1, 'main', cardInfo(raw()));
  d = addCard(d, 'Ante', 1, 'main', cardInfo(raw({ id: 'ante', name: 'Ante', border_color: 'black', legalities: { vintage: 'banned' } })));
  d = addCard(d, 'Advertisement', 1, 'considering', cardInfo(raw({ id: 'ad', name: 'Advertisement', type_line: 'Card' })));
  const f = format(), issues = validateDeck(d, f);
  assert.ok(!issues.some(issue => issue.startsWith("Krark's Other Thumb"))); assert.ok(issues.some(issue => issue.startsWith('Ante is outside')));
  assert.equal(deckCardStatuses(d, f).get(d.cards[0].id)!.illegal.length, 0);
  assert.ok(deckCardStatuses(d, f).get(d.cards[2].id)!.illegal.length);
  assert.equal(tournamentEligibility(d.cards[0], { ...f, allowUnCards: false }), 'illegal');
  const unverified = { ...d.cards[0], info: { ...d.cards[0].info!, isUnCard: undefined } };
  assert.equal(tournamentEligibility(unverified, f), 'unknown');
  assert.equal(tournamentEligibility({ ...unverified, info: { ...unverified.info!, vintageLegality: 'restricted' } }, f), 'legal');
});

test('search Un-cards are an independent exception with token exclusion and format rules preserved', () => {
  const query = buildSearchQuery('', { ...emptyFilters(), includeUnCards: true });
  assert.ok(query.includes('border:silver or stamp:acorn')); assert.ok(query.includes('-t:card')); assert.ok(query.includes('-t:token'));
  assert.ok(query.includes('legal:vintage or restricted:vintage'));
  const forced = buildSearchQuery('', emptyFilters(), format()); assert.ok(forced.includes('stamp:acorn'));
  const forbidden = buildSearchQuery('', { ...emptyFilters(), includeUnCards: true, includeTokens: true }, { ...format(), allowUnCards: false });
  assert.ok(!forbidden.includes('stamp:acorn')); assert.ok(!forbidden.includes(' or t:token'));
  const tokens = buildSearchQuery('', { ...emptyFilters(), includeUnCards: true, includeTokens: true }); assert.ok(tokens.endsWith(' or t:token)'));
  const custom = { ...format(), normalOnly: true, banTournamentIllegal: false };
  assert.equal(buildSearchQuery('', { ...emptyFilters(), normalOnly: false, includeTokens: true }, custom), 'name:/.*/');
  const data = [raw(), raw({ id: 'ad', name: 'Ad', type_line: 'Card' }), raw({ id: 'ante', name: 'Ante', border_color: 'black' })];
  assert.deepEqual(filterFormatCards(data, format()).map(c => c.id), ['un-fixture']);
});

test('Un-card preferences and classification survive format exports and full backups', () => {
  const f = format(); assert.deepEqual(parseFormatText(formatText(f)), [f]);
  const library = createLibrary(); library.formats.push(f); library.decks = [{ ...addCard(deck(), "Krark's Other Thumb", 1, 'main', cardInfo(raw())), formatId: f.id }];
  assert.equal(parseBackupText(backupText(library)).decks[0].cards[0].info!.isUnCard, true);
  assert.equal(createTransfer(library, 'both', [library.decks[0].id], []).formats[0].allowUnCards, true);
  assert.throws(() => parseFormatText(formatText({ ...f, allowUnCards: 'yes' as any })));
});

test('points sort and group numerically by active format, including unlisted and double-faced cards', () => {
  const f = { ...format(), pointed: [{ name: 'Power', points: 10 }, { name: 'Front', points: 2 }, { name: 'Small', points: 1 }] };
  let d = addCard(deck(), 'Power', 2, 'main'); d = addCard(d, 'Front // Back', 1, 'side'); d = addCard(d, 'Unlisted', 1, 'main'); d = addCard(d, 'Small', 1, 'considering');
  assert.equal(cardPoints(d.cards[0], f), 10); assert.equal(cardPoints(d.cards[1], f), 2); assert.equal(cardPoints(d.cards[2], f), 0);
  assert.deepEqual(sortCards(d.cards, 'points', 'asc', f).map(c => c.name), ['Unlisted', 'Small', 'Front // Back', 'Power']);
  assert.deepEqual(sortCards(d.cards, 'points', 'desc', f).map(c => c.name), ['Power', 'Front // Back', 'Small', 'Unlisted']);
  const view = { sort: 'points' as const, group: 'points' as const, direction: 'asc' as const };
  assert.deepEqual(groupCards(d.cards, view, f).map(group => group.label), ['0 points', '1 point', '2 points', '10 points']);
  assert.equal(groupCards(d.cards, view, f).at(-1)!.count, 2);
  assert.equal(deckPoints(d, f), 22); // Considering displays points but contributes none to the budget.
  assert.equal(cardPoints(d.cards[0], { ...f, pointed: [] }), 0);
  assert.equal(sortCards(d.cards, 'points', 'asc', f)[0].name, 'Unlisted'); assert.equal(d.cards[0].name, 'Power');
});

test('points views and library rule warnings survive reload and react to format changes without requests', () => {
  const library = createLibrary();
  library.formats[0] = { ...library.formats[0], minCards: 1, gameplayOnly: false, normalOnly: false, banned: ['Banned'] };
  library.preferredView = { sort: 'points', group: 'points', direction: 'desc', details: ['manaCost', 'points'] };
  library.decks = [{ ...addCard(deck(), 'Banned', 1, 'main'), views: { main: { ...library.preferredView, display: 'cards' } } }];
  const restored = parseLibrary(JSON.stringify(library));
  assert.deepEqual(restored.preferredView, library.preferredView); assert.deepEqual(restored.decks[0].views, library.decks[0].views);
  assert.ok(validateDeck(restored.decks[0], restored.formats[0]).some(issue => issue === 'Banned is banned in this format.'));
  assert.deepEqual(validateDeck(restored.decks[0], { ...restored.formats[0], banned: [] }), []);
});
