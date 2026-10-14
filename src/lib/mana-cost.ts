export type ManaToken = { kind: 'symbol'; symbol: string; parts: string[] } | { kind: 'separator' };
// Keep costs as symbols rather than deriving them from colors or mana value.
export function manaCostTokens(cost: string): ManaToken[] {
  return Array.from(cost.matchAll(/\{([^}]+)\}|\/\//g), match => match[1]
    ? { kind: 'symbol' as const, symbol: match[1], parts: match[1].split('/') }
    : { kind: 'separator' as const });
}
const names: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green', C: 'colorless', S: 'snow', P: 'Phyrexian' };
export function manaSymbolLabel(symbol: string): string {
  if (/^\d+$/.test(symbol)) return `${symbol} generic mana`;
  if (/^[XYZ]$/.test(symbol)) return `${symbol} generic mana`;
  return `${symbol.split('/').map(p => /^\d+$/.test(p) ? `${p} generic` : names[p] ?? p).join(' or ')} mana`;
}
export function manaSymbolColor(part: string): string {
  return ({ W: '#f3ecd2', U: '#a7d4ec', B: '#cdc5c1', R: '#ec9c82', G: '#a8c6a0' } as Record<string, string>)[part] ?? '#c8c4bb';
}
