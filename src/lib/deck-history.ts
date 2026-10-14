import type { CardInfo, Deck } from './model';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const content = (deck: Deck) => JSON.stringify({ name: deck.name, formatId: deck.formatId, notes: deck.notes, tags: deck.tags, cards: deck.cards });
export class DeckHistory {
  private past: Deck[] = [];
  private future: Deck[] = [];
  private group = '';
  private lastEdit = 0;
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  record(before: Deck, after: Deck, group = '', now = Date.now()) {
    if (content(before) === content(after)) return;
    if (!group || group !== this.group || now - this.lastEdit > 800) this.past.push(clone(before));
    this.group = group; this.lastEdit = now; this.future = [];
  }
  private restore(current: Deck, snapshot: Deck) { return { ...clone(snapshot), layout: current.layout, views: current.views, updatedAt: new Date().toISOString() }; }
  undo(current: Deck): Deck | undefined {
    const previous = this.past.pop(); if (!previous) return;
    this.future.push(clone(current)); this.group = ''; return this.restore(current, previous);
  }
  redo(current: Deck): Deck | undefined {
    const next = this.future.pop(); if (!next) return;
    this.past.push(clone(current)); this.group = ''; return this.restore(current, next);
  }
  refreshMetadata(id: string, before: CardInfo | undefined, info: CardInfo) {
    const refresh = (deck: Deck) => ({ ...deck, cards: deck.cards.map(card => card.id === id && card.info?.scryfallId === before?.scryfallId && card.info?.set === before?.set && card.info?.collectorNumber === before?.collectorNumber ? { ...card, info: clone(info) } : card) });
    this.past = this.past.map(refresh); this.future = this.future.map(refresh);
  }
}
