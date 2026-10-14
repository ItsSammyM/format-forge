import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckStats } from '../src/lib/deck-stats.ts';
import { addCard } from '../src/lib/model.ts';
import type { CardInfo, Deck } from '../src/lib/model.ts';
const deck = (): Deck => ({ id: 'stats', name: 'Stats', formatId: 'test', cards: [], notes: '', updatedAt: '' });
const info = (typeLine: string, manaValue = 0, manaCost = ''): CardInfo => ({ scryfallId: 'fixture', set: 'test', collectorNumber: '1', typeLine, manaValue, manaCost, colorIdentity: [], oracleText: '' });
test('24 lands in 60 cards average 2.8 in a seven-card opening hand', () => {
  let d = addCard(deck(), 'Mountain', 24, 'main', info('Basic Land — Mountain'));
  d = addCard(d, 'Spell', 36, 'main', info('Sorcery', 2, '{1}{R}'));
  const stats = deckStats(d);
  assert.equal(stats.expectedLands, 2.8);
  assert.equal(stats.curve[0].count, 0);
  assert.equal(stats.curve[2].count, 36);
  assert.equal(stats.pips.R, 36);
  assert.equal(deckStats(d, 6).expectedLands, 2.4);
  assert.equal(deckStats(d, 100).expectedLands, 24);
});
test('curve and pips include commanders but omit other zones and only front faces of DFCs', () => {
  let d = addCard(deck(), 'Spell', 2, 'main', info('Creature', 3, '{1}{G}{G}'));
  d = addCard(d, 'Commander', 1, 'commander', info('Legendary Creature', 9, '{W}{U}'));
  d = addCard(d, 'Sideboard', 20, 'side', info('Sorcery', 1, '{B}'));
  d = addCard(d, 'Considering', 20, 'considering', info('Sorcery', 1, '{R}'));
  d = addCard(d, 'Front spell', 1, 'main', info('Sorcery // Land', 2, '{U}{U} //'));
  const stats = deckStats(d);
  assert.equal(stats.size, 3);
  assert.equal(stats.lands, 0);
  assert.equal(stats.curve[8].count, 1);
  assert.equal(stats.pips.G, 4);
  assert.equal(stats.pips.U, 3);
  assert.equal(stats.pips.R, 0);
  assert.equal(stats.pips.B, 0);
});
test('hybrid, two-brid, Phyrexian, generic, X and colorless costs are distinguished', () => {
  const stats = deckStats(addCard(deck(), 'Hybrid', 2, 'main', info('Instant', 4, '{2}{X}{W/U}{2/W}{B/P}{C}')));
  assert.equal(stats.pips.W, 3); assert.equal(stats.pips.U, 1); assert.equal(stats.pips.B, 2);
  assert.equal(stats.totalColored, 6); assert.equal(stats.pips.C, 2);
});
test('empty and unresolved decks avoid NaN and report incomplete counts', () => {
  assert.equal(deckStats(deck()).expectedLands, 0);
  const d = addCard(deck(), 'Unknown', 4, 'main');
  assert.equal(deckStats(d).unresolved, 4);
  assert.equal(deckStats(d).curve.reduce((sum, b) => sum + b.count, 0), 0);
  assert.equal(deckStats(d, NaN).hand, 4);
  const unknownMV = addCard(deck(), 'No mana value', 1, 'main', { ...info('Creature'), manaValue: null });
  assert.equal(deckStats(unknownMV).curveUnknown, 1);
});

test('opening-hand averages count types and tags by copies, once per matching card', async () => {
  const { openingHandStats, handFilterOptions } = await import('../src/lib/deck-stats.ts');
  let d = addCard(deck(), 'Artifact Creature', 4, 'main', info('Artifact Creature — Golem'), ['ramp', 'utility']);
  d = addCard(d, 'Instant', 8, 'main', info('Instant'), ['ramp']);
  d = addCard(d, 'Land', 28, 'main', info('Basic Land — Island'));
  d = addCard(d, 'Other creature', 20, 'main', info('Legendary Creature — Wizard'), ['finisher']);
  d = addCard(d, 'Side', 5, 'side', info('Creature'), ['ramp']);
  d = addCard(d, 'Commander', 1, 'commander', info('Legendary Creature'), ['ramp']);
  d = addCard(d, 'Considering', 5, 'considering', info('Creature'), ['wishlist']);
  const creatures = openingHandStats(d, 7, { kind: 'type', value: 'Creature' });
  assert.equal(creatures.size, 60); assert.equal(creatures.matches, 24); assert.equal(creatures.expected, 2.8);
  const ramp = openingHandStats(d, 7, { kind: 'tag', value: 'RAMP' });
  assert.equal(ramp.matches, 12); assert.equal(ramp.expected, 1.4);
  const artifact = openingHandStats(d, 7, { kind: 'type', value: 'artifact' });
  assert.equal(artifact.matches, 4);
  const options = handFilterOptions(d);
  assert.ok(options.types.includes('Artifact')); assert.ok(!options.types.includes('Golem')); assert.ok(!options.types.includes('Legendary'));
  assert.deepEqual(options.tags, ['finisher', 'ramp', 'utility']);
});
test('unknown types and double-faced cards retain consistent hand counts', async () => {
  const { openingHandStats } = await import('../src/lib/deck-stats.ts');
  let d = addCard(deck(), 'Front sorcery', 3, 'main', info('Sorcery // Land'));
  d = addCard(d, 'Unknown', 2, 'main', undefined, ['ramp']);
  const lands = openingHandStats(d, 7, { kind: 'type', value: 'Land' });
  assert.equal(lands.matches, 0); assert.equal(lands.unresolved, 2); assert.equal(lands.hand, 5);
  const ramp = openingHandStats(d, 7, { kind: 'tag', value: 'ramp' });
  assert.equal(ramp.expected, 2); assert.equal(ramp.unresolved, 0);
  assert.equal(openingHandStats(d, -1, { kind: 'type', value: 'Sorcery' }).expected, 0);
  assert.equal(openingHandStats(deck(), 7, { kind: 'type', value: 'Land' }).expected, 0);
});
