import type { CardEntry } from './model.ts';

export function cardTypeFaces(card: Pick<CardEntry, 'info'>): string[] {
  return (card.info?.typeLine ?? '').split(/\s*\/\/\s*/).filter(Boolean);
}

export function frontTypeLine(card: Pick<CardEntry, 'info'>): string {
  return cardTypeFaces(card)[0] ?? '';
}

export function isMdfcLand(card: Pick<CardEntry, 'info'>): boolean {
  const faces = cardTypeFaces(card);
  return faces.length > 1 && !/\bLand\b/i.test(faces[0]) && faces.slice(1).some(face => /\bLand\b/i.test(face));
}

export function mdfcLandCount(cards: CardEntry[]): number {
  return cards.filter(isMdfcLand).reduce((total, card) => total + card.quantity, 0);
}

export function frontLandCount(cards: CardEntry[]): number {
  return cards.filter(card => /\bLand\b/i.test(frontTypeLine(card))).reduce((total, card) => total + card.quantity, 0);
}
