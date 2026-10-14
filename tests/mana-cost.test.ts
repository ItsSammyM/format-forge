import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manaCostTokens, manaSymbolLabel } from '../src/lib/mana-cost.ts';
import { createLibrary, parseLibrary } from '../src/lib/model.ts';

test('generic mana, colorless requirements, repeated pips and hybrids remain distinct', () => {
  const tokens = manaCostTokens('{2}{C}{U}{U}{W/U}{2/B}{G/P}{S}{X}');
  assert.deepEqual(tokens.filter(t => t.kind === 'symbol').map(t => t.symbol), ['2', 'C', 'U', 'U', 'W/U', '2/B', 'G/P', 'S', 'X']);
  assert.equal(manaSymbolLabel('2'), '2 generic mana');
  assert.equal(manaSymbolLabel('C'), 'colorless mana');
  assert.equal(manaSymbolLabel('W/U'), 'white or blue mana');
  assert.equal(manaSymbolLabel('2/B'), '2 generic or black mana');
  assert.equal(manaSymbolLabel('G/P'), 'green or Phyrexian mana');
});
test('cards without costs do not gain a colorless or zero symbol', () => {
  assert.deepEqual(manaCostTokens(''), []);
  assert.deepEqual(manaCostTokens('{0}'), [{ kind: 'symbol', symbol: '0', parts: ['0'] }]);
});
test('multiple face costs retain their separator and both casting costs', () => {
  assert.deepEqual(manaCostTokens('{1}{R} // {W/U}'), [
    { kind: 'symbol', symbol: '1', parts: ['1'] }, { kind: 'symbol', symbol: 'R', parts: ['R'] },
    { kind: 'separator' }, { kind: 'symbol', symbol: 'W/U', parts: ['W', 'U'] },
  ]);
});
test('saved color row preferences migrate to mana cost without changing color grouping', () => {
  const library = createLibrary();
  library.decks = [{ id: 'migration', name: 'Migration', formatId: library.formats[0].id, cards: [], notes: '', updatedAt: '2026-10-14T00:00:00Z', views: { main: { sort: 'colors', group: 'colors', direction: 'asc', details: ['colors', 'manaValue'] }, side: { sort: 'name', group: 'none', direction: 'asc', details: ['manaCost'] } } }];
  const migrated = parseLibrary(JSON.stringify(library));
  assert.deepEqual(migrated.decks[0].views!.main!.details, ['manaCost', 'manaValue']);
  assert.equal(migrated.decks[0].views!.main!.sort, 'colors');
  assert.equal(migrated.decks[0].views!.main!.group, 'colors');
  assert.deepEqual(migrated.decks[0].views!.side!.details, ['manaCost']);
});
