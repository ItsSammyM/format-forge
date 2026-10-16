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

test('opening-hand numeric filters support exact values and inclusive comparisons without treating unknowns as zero', async () => {
  const { openingHandStats, handFilterOptions } = await import('../src/lib/deck-stats.ts');
  const { blankFormat } = await import('../src/lib/model.ts');
  let d = addCard(deck(), 'Zero', 10, 'main', info('Artifact', 0));
  d = addCard(d, 'Two', 20, 'main', info('Creature', 2));
  d = addCard(d, 'Half', 5, 'main', info('Creature', 0.5));
  d = addCard(d, 'Unknown', 25, 'main');
  d = addCard(d, 'Side', 50, 'side', info('Creature', 2));
  const exact = openingHandStats(d, 7, { kind: 'manaValue', value: '2' });
  assert.equal(exact.matches, 20); assert.equal(exact.unresolved, 25); assert.equal(exact.expected, 7 / 3);
  assert.equal(openingHandStats(d, 7, { kind: 'manaValue', value: '2', comparison: '<=' }).matches, 35);
  assert.equal(openingHandStats(d, 7, { kind: 'manaValue', value: '2', comparison: '>=' }).matches, 20);
  assert.equal(openingHandStats(d, 7, { kind: 'manaValue', value: '0' }).matches, 10);
  assert.equal(openingHandStats(d, 7, { kind: 'manaValue', value: 'bad' }).matches, 0);
  const format = { ...blankFormat(), pointed: [{ name: 'Two', points: 3 }] };
  assert.equal(openingHandStats(d, 7, { kind: 'points', value: '3', comparison: '>=' }, format).matches, 20);
  assert.equal(openingHandStats(d, 7, { kind: 'points', value: '0' }, format).matches, 40);
  assert.equal(openingHandStats(d, 7, { kind: 'points', value: '0' }).unresolved, 60);
  const groups = handFilterOptions(d, format).groups;
  assert.ok(groups.find(g => g.label === 'Numeric properties')!.options.some(o => o.kind === 'manaValue'));
  assert.ok(groups.find(g => g.label === 'Numeric properties')!.options.some(o => o.kind === 'points'));
});

test('opening-hand color filters distinguish colors from identity, exact combinations and unknown metadata', async () => {
  const { openingHandStats, handFilterOptions } = await import('../src/lib/deck-stats.ts');
  let d = addCard(deck(), 'Azorius', 12, 'main', { ...info('Creature'), colors: ['U', 'W'], colorIdentity: ['W', 'U'] });
  d = addCard(d, 'Blue with red ability', 18, 'main', { ...info('Creature'), colors: ['U'], colorIdentity: ['U', 'R'] });
  d = addCard(d, 'Colorless', 24, 'main', { ...info('Artifact'), colors: [], colorIdentity: [] });
  d = addCard(d, 'Unknown', 6, 'main');
  assert.equal(openingHandStats(d, 7, { kind: 'colors', value: 'U' }).matches, 30);
  assert.equal(openingHandStats(d, 7, { kind: 'colors', value: 'R' }).matches, 0);
  assert.equal(openingHandStats(d, 7, { kind: 'colorIdentity', value: 'R' }).matches, 18);
  assert.equal(openingHandStats(d, 7, { kind: 'colorIdentity', value: 'exact:WU' }).matches, 12);
  assert.equal(openingHandStats(d, 7, { kind: 'colors', value: 'multicolor' }).matches, 12);
  const colorless = openingHandStats(d, 7, { kind: 'colorIdentity', value: 'colorless' });
  assert.equal(colorless.matches, 24); assert.equal(colorless.unresolved, 6); assert.equal(colorless.expected, 2.8);
  assert.ok(handFilterOptions(d).groups.find(g => g.label === 'Color identity')!.options.some(o => o.value === 'exact:WU'));
});

test('rarity and set counts use selected printings, ignore other zones and report missing data', async () => {
  const { openingHandStats, handFilterOptions } = await import('../src/lib/deck-stats.ts');
  let d = addCard(deck(), 'Common', 20, 'main', { ...info('Creature'), rarity: 'common', set: 'm10', setName: 'Magic 2010' });
  d = addCard(d, 'Rare', 10, 'main', { ...info('Instant'), rarity: 'rare', set: 'm11' });
  d = addCard(d, 'Missing', 30, 'main');
  d = addCard(d, 'Commander', 1, 'commander', { ...info('Creature'), rarity: 'rare', set: 'm11' });
  d = addCard(d, 'Considering', 20, 'considering', { ...info('Creature'), rarity: 'rare', set: 'm11' });
  const rare = openingHandStats(d, 7, { kind: 'rarity', value: 'RARE' });
  assert.equal(rare.size, 60); assert.equal(rare.matches, 10); assert.equal(rare.unresolved, 30);
  assert.equal(openingHandStats(d, 7, { kind: 'set', value: 'M10' }).matches, 20);
  assert.ok(handFilterOptions(d).groups.find(g => g.label === 'Selected printing set')!.options.some(o => o.label === 'Magic 2010'));
  for (const kind of ['manaValue', 'colors', 'colorIdentity', 'rarity', 'set', 'points'] as const) {
    assert.equal(openingHandStats(deck(), 7, { kind, value: '0' }).expected, 0);
    assert.equal(openingHandStats(d, -1, { kind, value: '0' }).expected, 0);
  }
});

test('price thresholds use per-copy USD for the selected printing and preserve free versus unpriced cards', async () => {
  const { openingHandStats, handFilterOptions } = await import('../src/lib/deck-stats.ts');
  let d = addCard(deck(), 'Free', 6, 'main', { ...info('Artifact'), priceUSD: 0 });
  d = addCard(d, 'Budget', 18, 'main', { ...info('Creature'), priceUSD: 0.25 });
  d = addCard(d, 'Expensive', 12, 'main', { ...info('Creature'), priceUSD: 100 });
  d = addCard(d, 'Unpriced', 24, 'main', { ...info('Creature'), priceUSD: null });
  d = addCard(d, 'Sideboard', 15, 'side', { ...info('Creature'), priceUSD: 0.25 });
  const cheap = openingHandStats(d, 7, { kind: 'price', value: '1', comparison: '<=' });
  assert.equal(cheap.matches, 24); assert.equal(cheap.unresolved, 24); assert.equal(cheap.expected, 2.8);
  assert.equal(openingHandStats(d, 7, { kind: 'price', value: '0' }).matches, 6);
  assert.equal(openingHandStats(d, 7, { kind: 'price', value: '0.25' }).matches, 18);
  assert.equal(openingHandStats(d, 7, { kind: 'price', value: '0.25', comparison: '>=' }).matches, 30);
  assert.equal(openingHandStats(d, 7, { kind: 'price', value: '' }).matches, 0);
  assert.ok(handFilterOptions(d).groups.some(g => g.options.some(o => o.kind === 'price')));
});

test('ordered rarity comparisons include their bound but never rank special or bonus as normal rarities', async () => {
  const { openingHandStats } = await import('../src/lib/deck-stats.ts');
  let d = deck();
  for (const rarity of ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus']) d = addCard(d, rarity, 10, 'main', { ...info('Creature'), rarity });
  d = addCard(d, 'Unknown', 5, 'main');
  const lower = openingHandStats(d, 7, { kind: 'rarity', value: 'uncommon', comparison: '<=' });
  assert.equal(lower.matches, 20); assert.equal(lower.unresolved, 5);
  assert.equal(openingHandStats(d, 7, { kind: 'rarity', value: 'rare', comparison: '>=' }).matches, 20);
  assert.equal(openingHandStats(d, 7, { kind: 'rarity', value: 'rare', comparison: '=' }).matches, 10);
  assert.equal(openingHandStats(d, 7, { kind: 'rarity', value: 'special' }).matches, 10);
  assert.equal(openingHandStats(d, 7, { kind: 'rarity', value: 'special', comparison: '>=' }).matches, 0);
});
