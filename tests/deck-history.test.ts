import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeckHistory } from '../src/lib/deck-history.ts';
import { addCard, moveCard, changePrinting } from '../src/lib/model.ts';
import type { CardInfo, Deck } from '../src/lib/model.ts';
const deck = (): Deck => ({ id: 'history', name: 'History', cards: [], formatId: 'test', notes: '', updatedAt: '2026-10-14T00:00:00Z' });
const info: CardInfo = { scryfallId: 'one', set: 'm11', collectorNumber: '1', typeLine: 'Instant', oracleText: '', manaCost: '{R}', colorIdentity: ['R'] };
test('multiple edits undo and redo in order without mutating the earlier decks', () => {
  const history = new DeckHistory();
  const initial = deck(); const added = addCard(initial, 'Bolt', 2, 'main'); history.record(initial, added);
  const moved = moveCard(added, added.cards[0].id, 'side', 1); history.record(added, moved);
  const imported = addCard(moved, 'Opt', 1, 'considering'); history.record(moved, imported);
  let current = history.undo(imported)!; assert.deepEqual(current.cards, moved.cards);
  current = history.undo(current)!; assert.deepEqual(current.cards, added.cards);
  current = history.undo(current)!; assert.deepEqual(current.cards, []); assert.equal(history.canUndo, false);
  current = history.redo(current)!; assert.deepEqual(current.cards, added.cards);
  current = history.redo(current)!; assert.deepEqual(current.cards, moved.cards);
  current = history.redo(current)!; assert.deepEqual(current.cards, imported.cards); assert.equal(history.canRedo, false);
  assert.equal(added.cards[0].quantity, 2); assert.equal(initial.cards.length, 0);
});
test('a new edit after undo discards redo, while layout changes preserve history', () => {
  const history = new DeckHistory(); const initial = deck(); const added = addCard(initial, 'Bolt', 1, 'main'); history.record(initial, added);
  const resized = { ...added, layout: { workspace: 70 }, views: { main: { sort: 'name' as const, group: 'type' as const, direction: 'asc' as const } } };
  history.record(added, resized);
  const undone = history.undo(resized)!; assert.equal(undone.cards.length, 0); assert.deepEqual(undone.layout, resized.layout); assert.deepEqual(undone.views, resized.views);
  const branched = addCard(undone, 'Forest', 1, 'main'); history.record(undone, branched); assert.equal(history.canRedo, false);
});
test('typing groups into one edit while later typing is a new action', () => {
  const history = new DeckHistory(); const initial = deck(); const a = { ...initial, notes: 'a' }; const abc = { ...a, notes: 'abc' }; const later = { ...abc, notes: 'abcdef' };
  history.record(initial, a, 'primer', 1000); history.record(a, abc, 'primer', 1200); history.record(abc, later, 'primer', 2400);
  const first = history.undo(later)!; assert.equal(first.notes, 'abc'); assert.equal(history.undo(first)!.notes, '');
});
test('card data refreshes preserve resolved metadata without creating undo actions or changing printing choices', () => {
  const history = new DeckHistory(); const a = addCard(deck(), 'Bolt', 1, 'main'); const b = addCard(a, 'Opt', 1, 'main'); history.record(a, b);
  history.refreshMetadata(a.cards[0].id, undefined, info);
  const resolved = { ...b, cards: b.cards.map(c => c.id === a.cards[0].id ? { ...c, info } : c) };
  const previous = history.undo(resolved)!; assert.equal(previous.cards[0].info!.scryfallId, 'one'); assert.equal(history.canUndo, false);
  const newPrint = changePrinting(previous, previous.cards[0].id, { ...info, scryfallId: 'two', set: 'lea' }); history.record(previous, newPrint);
  history.refreshMetadata(previous.cards[0].id, { ...info, scryfallId: 'two', set: 'lea' }, { ...info, scryfallId: 'two', set: 'lea', rarity: 'rare' });
  assert.equal(history.undo(newPrint)!.cards[0].info!.scryfallId, 'one');
});
