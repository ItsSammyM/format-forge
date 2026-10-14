import type { BoardView, CardEntry, CardSort } from './model.ts';
export const DEFAULT_VIEW: BoardView = { sort: 'manaValue', group: 'type', direction: 'asc', display: 'compact', details: ['manaCost', 'tags'], cardSize: 170 };
export function boardView(saved?: BoardView): BoardView { return { ...DEFAULT_VIEW, ...saved, display: saved?.display === 'cards' ? 'cards' : 'compact', details: saved?.details ?? [...DEFAULT_VIEW.details!] }; }
export const SORT_LABELS: Record<CardSort, string> = { name: 'Alphabetical', manaValue: 'Mana value', colors: 'Colors', colorIdentity: 'Color identity', price: 'Price (USD)', type: 'Type', rarity: 'Rarity', tags: 'Tags' };
const rarityOrder = ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus'];
const colorNames: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
const colors = (value: string[]) => 'WUBRG'.split('').filter(c => value.includes(c));
const type = (card: CardEntry) => card.info?.typeLine?.split(/[—-]/)[0].replace(/\b(?:Basic|Legendary|Snow|World|Ongoing)\s*/g, '').trim() || null;
function value(card: CardEntry, key: CardSort): string | number | null {
  switch (key) {
    case 'name': return card.name.toLowerCase();
    case 'manaValue': return card.info?.manaValue ?? null;
    case 'price': return card.info?.priceUSD ?? null;
    case 'colors': return card.info?.colors ? `${card.info.colors.length}:${colors(card.info.colors).join('')}` : null;
    case 'colorIdentity': return card.info?.scryfallId ? `${card.info.colorIdentity.length}:${colors(card.info.colorIdentity).join('')}` : null;
    case 'type': return type(card);
    case 'rarity': { const index = rarityOrder.indexOf(card.info?.rarity ?? ''); return index < 0 ? null : index; }
    case 'tags': return card.tags?.length ? [...card.tags].sort((a, b) => a.localeCompare(b))[0].toLowerCase() : null;
  }
}
export function sortCards(cards: CardEntry[], key: CardSort, direction: 'asc' | 'desc' = 'asc'): CardEntry[] {
  return [...cards].sort((a, b) => {
    const av = value(a, key), bv = value(b, key);
    if (av === null || bv === null) { if (av !== bv) return av === null ? 1 : -1; }
    const compared = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''));
    return (direction === 'desc' ? -compared : compared) || a.name.localeCompare(b.name);
  });
}
export interface CardGroup { key: string; label: string; cards: CardEntry[]; count: number; order: number; symbols?: string[] }
function labels(card: CardEntry, key: BoardView['group']): { label: string; order: number; symbols?: string[] }[] {
  const v = key === 'none' ? null : value(card, key);
  if (key === 'none') return [{ label: '', order: 0 }];
  if (key === 'tags') return (card.tags?.length ? card.tags : ['Untagged']).map(label => ({ label, order: card.tags?.length ? 0 : 1000 }));
  if (v === null) return [{ label: key === 'price' ? 'Price unavailable' : 'Unknown', order: 1000 }];
  if (key === 'manaValue') return [{ label: `Mana value ${v}`, order: Number(v) }];
  if (key === 'price') { const price = Number(v); return [{ label: price < 1 ? 'Under $1' : price < 5 ? '$1 to $5' : price < 20 ? '$5 to $20' : '$20 and up', order: price < 1 ? 0 : price < 5 ? 1 : price < 20 ? 2 : 3 }]; }
  if (key === 'colors' || key === 'colorIdentity') {
    const selected = colors(key === 'colors' ? card.info!.colors! : card.info!.colorIdentity);
    return [{ label: selected.map(c => colorNames[c]).join(' / ') || 'Colorless', order: selected.length, symbols: selected }];
  }
  if (key === 'rarity') { const rarity = card.info!.rarity!; return [{ label: rarity[0].toUpperCase() + rarity.slice(1), order: Number(v) }]; }
  return [{ label: key === 'name' ? card.name[0].toUpperCase() : String(v), order: 0 }];
}
export function groupCards(cards: CardEntry[], view: BoardView): CardGroup[] {
  const groups = new Map<string, CardGroup>();
  for (const card of sortCards(cards, view.sort, view.direction)) for (const label of labels(card, view.group)) {
    const key = label.label.toLowerCase(), group = groups.get(key) ?? { key, label: label.label, cards: [], count: 0, order: label.order, ...(label.symbols ? { symbols: label.symbols } : {}) };
    group.cards.push(card); group.count += card.quantity; groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}
