import type { Deck } from './model';
export const MANA_COLORS = ['W', 'U', 'B', 'R', 'G'] as const;
export function deckStats(deck: Deck, handSize = 7) {
  const curve = Array.from({ length: 9 }, (_, value) => ({ label: value === 8 ? '8+' : String(value), count: 0 }));
  const pips: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  let lands = 0, unresolved = 0, curveUnknown = 0, size = 0;
  for (const card of deck.cards.filter(c => c.zone === 'main')) size += card.quantity;
  for (const card of deck.cards.filter(c => c.zone === 'main' || c.zone === 'commander')) {
    const frontType = card.info?.typeLine.split(' // ')[0];
    if (!frontType) { unresolved += card.quantity; continue; }
    if (/\bLand\b/.test(frontType)) { if (card.zone === 'main') lands += card.quantity; continue; }
    const mv = card.info?.manaValue;
    if (mv == null || !Number.isFinite(mv)) curveUnknown += card.quantity;
    else curve[Math.min(8, Math.max(0, Math.floor(mv)))].count += card.quantity;
    // A hybrid pip contributes one total pip divided among its possible colors.
    for (const match of (card.info?.manaCost.split(' // ')[0] ?? '').matchAll(/\{([^}]+)\}/g)) {
      const colors = [...new Set(match[1].split('/').filter(c => MANA_COLORS.includes(c as typeof MANA_COLORS[number])))];
      for (const color of colors) pips[color] += card.quantity / colors.length;
      if (match[1] === 'C') pips.C += card.quantity;
    }
  }
  const totalColored = MANA_COLORS.reduce((sum, c) => sum + pips[c], 0);
  const hand = Math.min(size, Math.max(0, Math.floor(Number.isFinite(handSize) ? handSize : 7)));
  return { curve, pips, totalColored, lands, unresolved, curveUnknown, size, hand, expectedLands: size ? hand * lands / size : 0 };
}

export type HandFilter = { kind: 'type' | 'tag'; value: string };
export function openingHandStats(deck: Deck, handSize: number, filter: HandFilter) {
  const cards = deck.cards.filter(c => c.zone === 'main');
  const size = cards.reduce((sum, c) => sum + c.quantity, 0);
  const hand = Math.min(size, Math.max(0, Math.floor(Number.isFinite(handSize) ? handSize : 7)));
  let matches = 0, unresolved = 0;
  for (const card of cards) {
    if (filter.kind === 'tag') { if (card.tags?.some(tag => tag.toLowerCase() === filter.value.toLowerCase())) matches += card.quantity; }
    else {
      const typeLine = card.info?.typeLine?.split(' // ')[0].split(/[—-]/)[0];
      if (!typeLine) { unresolved += card.quantity; continue; }
      if (typeLine.toLowerCase().split(/\s+/).includes(filter.value.toLowerCase())) matches += card.quantity;
    }
  }
  return { size, hand, matches, unresolved, expected: size ? hand * matches / size : 0 };
}
export function handFilterOptions(deck: Deck) {
  const types = new Set(['Land', 'Creature', 'Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Planeswalker', 'Battle']);
  for (const card of deck.cards.filter(c => c.zone === 'main')) for (const type of card.info?.typeLine?.split(' // ')[0].split(/[—-]/)[0].split(/\s+/) ?? []) {
    if (type && !['Basic', 'Legendary', 'Snow', 'World', 'Ongoing'].includes(type)) types.add(type);
  }
  const tags = [...new Set(deck.cards.filter(c => c.zone === 'main').flatMap(c => c.tags ?? []))].sort();
  return { types: [...types].sort(), tags };
}
