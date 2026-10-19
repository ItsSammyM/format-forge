import { normalizeName } from './model.ts';
import type { BoardView, CardEntry, CardInfo, Format } from './model.ts';
import { groupCards } from './deck-view.ts';

export function organizeRuleCards<T extends { name: string; value?: number }>(
  cards: T[], metadata: Record<string, CardInfo>, view: BoardView, valueLabel?: 'points' | 'copies',
) {
  const entries: CardEntry[] = cards.map((card, index) => ({
    id: `${index}:${normalizeName(card.name)}`, name: card.name, quantity: 1, zone: 'main',
    info: metadata[normalizeName(card.name)],
  }));
  const format = valueLabel ? { pointed: cards.map(c => ({ name: c.name, points: c.value ?? 0 })) } as unknown as Format : undefined;
  const groups = groupCards(entries, view, format);
  return groups.map(group => ({ ...group, cards: group.cards.map(entry => ({
    entry,
    original: cards.find(card => normalizeName(card.name) === normalizeName(entry.name))!,
  })) }));
}

export const DEFAULT_RULE_VIEW: BoardView = { sort: 'name', group: 'none', direction: 'asc' };
