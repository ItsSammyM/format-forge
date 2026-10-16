import { cardPoints, RARITIES } from './model.ts';
import type { CardEntry, Deck, Format } from './model.ts';
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

export type HandFilterKind = 'type' | 'tag' | 'manaValue' | 'colors' | 'colorIdentity' | 'rarity' | 'set' | 'points' | 'price';
export type HandFilter = { kind: HandFilterKind; value: string; comparison?: '=' | '<=' | '>=' };
export interface HandFilterGroup { label: string; options: { kind: HandFilterKind; value: string; label: string }[] }
const COLOR_NAMES: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
const colorKey = (colors: string[]) => MANA_COLORS.filter(color => colors.includes(color)).join('');
function matchesHandFilter(card: CardEntry, filter: HandFilter, format?: Format): boolean | undefined {
  const value = filter.value.toLowerCase(), info = card.info;
  switch (filter.kind) {
    case 'tag': return !!card.tags?.some(tag => tag.toLowerCase() === value);
    case 'type': {
      const type = info?.typeLine?.split(' // ')[0].split(/[—-]/)[0];
      return type ? type.toLowerCase().split(/\s+/).includes(value) : undefined;
    }
    case 'manaValue':
    case 'points':
    case 'price': {
      const actual = filter.kind === 'manaValue' ? info?.manaValue : filter.kind === 'price' ? info?.priceUSD : format ? cardPoints(card, format) : undefined;
      if (actual == null || !Number.isFinite(actual)) return undefined;
      const target = Number(filter.value);
      if (!filter.value.trim() || !Number.isFinite(target)) return false;
      return filter.comparison === '<=' ? actual <= target : filter.comparison === '>=' ? actual >= target : actual === target;
    }
    case 'colors':
    case 'colorIdentity': {
      const colors = info?.[filter.kind];
      if (!colors) return undefined;
      if (value === 'colorless') return colors.length === 0;
      if (value === 'multicolor') return colors.length > 1;
      if (value.startsWith('exact:')) return colorKey(colors) === filter.value.slice(6);
      return colors.includes(filter.value);
    }
    case 'rarity': {
      if (!info?.rarity) return undefined;
      if (!filter.comparison || filter.comparison === '=') return info.rarity.toLowerCase() === value;
      const order = ['common', 'uncommon', 'rare', 'mythic'];
      const actual = order.indexOf(info.rarity.toLowerCase()), target = order.indexOf(value);
      return actual >= 0 && target >= 0 && (filter.comparison === '<=' ? actual <= target : actual >= target);
    }
    case 'set': return info?.set ? info.set.toLowerCase() === value : undefined;
  }
}
export function openingHandStats(deck: Deck, handSize: number, filter: HandFilter, format?: Format) {
  const cards = deck.cards.filter(c => c.zone === 'main');
  const size = cards.reduce((sum, c) => sum + c.quantity, 0);
  const hand = Math.min(size, Math.max(0, Math.floor(Number.isFinite(handSize) ? handSize : 7)));
  let matches = 0, unresolved = 0;
  for (const card of cards) {
    const match = matchesHandFilter(card, filter, format);
    if (match === undefined) unresolved += card.quantity;
    else if (match) matches += card.quantity;
  }
  return { size, hand, matches, unresolved, expected: size ? hand * matches / size : 0 };
}
export function handFilterOptions(deck: Deck, format?: Format) {
  const types = new Set(['Land', 'Creature', 'Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Planeswalker', 'Battle']);
  for (const card of deck.cards.filter(c => c.zone === 'main')) for (const type of card.info?.typeLine?.split(' // ')[0].split(/[—-]/)[0].split(/\s+/) ?? []) {
    if (type && !['Basic', 'Legendary', 'Snow', 'World', 'Ongoing'].includes(type)) types.add(type);
  }
  const tags = [...new Set(deck.cards.filter(c => c.zone === 'main').flatMap(c => c.tags ?? []))].sort();
  const cards = deck.cards.filter(c => c.zone === 'main');
  const groups: HandFilterGroup[] = [
    { label: 'Card types', options: [...types].sort().map(value => ({ kind: 'type', value, label: value })) },
    ...(tags.length ? [{ label: 'Card tags', options: tags.map(value => ({ kind: 'tag' as const, value, label: `Tag: ${value}` })) }] : []),
    { label: 'Numeric properties', options: [{ kind: 'manaValue', value: '0', label: 'Mana value' }, { kind: 'price', value: '0', label: 'Price (USD)' }] },
  ];
  for (const kind of ['colors', 'colorIdentity'] as const) {
    const combinations = [...new Set(cards.flatMap(c => { const colors = c.info?.[kind]; return colors && colors.length > 0 ? [colorKey(colors)] : []; }))].sort();
    groups.push({ label: kind === 'colors' ? 'Card colors' : 'Color identity', options: [
      ...MANA_COLORS.map(value => ({ kind, value, label: `Includes ${COLOR_NAMES[value]}` })),
      { kind, value: 'colorless', label: 'Colorless' }, { kind, value: 'multicolor', label: 'Multicolor' },
      ...combinations.map(value => ({ kind, value: `exact:${value}`, label: `Exactly ${[...value].map(c => COLOR_NAMES[c]).join(' / ')}` })),
    ] });
  }
  groups.push({ label: 'Rarity of selected printing', options: RARITIES.map(value => ({ kind: 'rarity', value, label: value[0].toUpperCase() + value.slice(1) })) });
  const sets = new Map(cards.filter(c => c.info?.set).map(c => [c.info!.set, c.info!.setName ?? c.info!.set.toUpperCase()]));
  if (sets.size) groups.push({ label: 'Selected printing set', options: [...sets].sort(([a], [b]) => a.localeCompare(b)).map(([value, label]) => ({ kind: 'set', value, label })) });
  if (format) groups.find(group => group.label === 'Numeric properties')!.options.push({ kind: 'points', value: '0', label: 'Points per copy' });
  return { types: [...types].sort(), tags, groups };
}
