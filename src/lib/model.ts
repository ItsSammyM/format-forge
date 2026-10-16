import { builtInFormats } from './default-formats.ts';
export type Zone = 'main' | 'side' | 'considering' | 'commander' | 'companion' | 'conspiracy';
export const ZONES: Zone[] = ['main', 'side', 'considering', 'commander', 'companion', 'conspiracy'];
export type UISection = Zone | 'search';
export const UI_SECTIONS: UISection[] = [...ZONES, 'search'];
export const ZONE_NAMES: Record<Zone, string> = { main: 'Deck', side: 'Sideboard', considering: 'Considering', commander: 'Commander', companion: 'Companion', conspiracy: 'Conspiracy' };
export const RARITIES = ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus'] as const;
export type Rarity = typeof RARITIES[number];
export const OFFICIAL_FORMAT_NAMES = { modern: 'Modern', commander: 'Commander', legacy: 'Legacy', vintage: 'Vintage', pauper: 'Pauper', pioneer: 'Pioneer', premodern: 'Premodern', paupercommander: 'Pauper EDH' } as const;
export type OfficialFormat = keyof typeof OFFICIAL_FORMAT_NAMES;
export type CardLegality = 'legal' | 'restricted' | 'banned' | 'not_legal';
export interface Format {
  id: string; name: string; description: string;
  minCards: number; maxCards: number | null;
  minSideboard: number; maxSideboard: number | null;
  copyLimit: number | null; basicLandExemption: boolean; banned: string[];
  allowedSets: string[]; commanderRules: boolean;
  whitelistOnly?: boolean; allowedCards?: string[]; normalOnly?: boolean; bannedRarities?: Rarity[]; restricted?: { name: string; limit: number }[];
  pointed?: { name: string; points: number }[]; maxPoints?: number;
  eternal?: boolean; bannedTypes?: string[]; bannedCompanions?: string[];
  banTournamentIllegal?: boolean; officialFormat?: OfficialFormat;
  allowUnCards?: boolean; gameplayOnly?: boolean; checkCardRoles?: boolean;
  minCardPrice?: number; maxCardPrice?: number; minDeckPrice?: number; maxDeckPrice?: number;
  releasedAfter?: string; releasedBefore?: string; tags?: string[]; commanderAnyCreature?: boolean;
}
export interface CardInfo {
  scryfallId: string; oracleId?: string; setName?: string; vintageLegality?: string; modernLegality?: string; legalities?: Partial<Record<OfficialFormat, CardLegality>>; printRarities?: string[]; set: string; collectorNumber: string;
  image?: string; backImage?: string; typeLine: string; oracleText: string;
  colorIdentity: string[]; manaCost: string;
  printSets?: string[]; setsComplete?: boolean; checkedAt?: string;
  releasedAt?: string; printReleases?: { set: string; date: string }[];
  isUnCard?: boolean; isGameCard?: boolean;
  manaValue?: number | null; colors?: string[]; rarity?: string; priceUSD?: number | null;
}
export const CARD_SORTS = ['name', 'manaValue', 'colors', 'colorIdentity', 'price', 'points', 'type', 'rarity', 'tags'] as const;
export type CardSort = typeof CARD_SORTS[number];
export const CARD_DETAILS = ['manaCost', 'manaValue', 'colorIdentity', 'price', 'points', 'type', 'rarity', 'tags'] as const;
export type CardDetail = typeof CARD_DETAILS[number];
export interface BoardView { sort: CardSort; group: CardSort | 'none'; direction: 'asc' | 'desc'; details?: (CardDetail | CardSort)[]; showPrintings?: boolean; display?: 'list' | 'compact' | 'cards'; cardSize?: number }
export interface DeckLayout { workspace?: number; boards?: number; auxiliary?: number; searchControls?: number; zoneSplits?: Partial<Record<Zone, number>>; hiddenZones?: UISection[]; special?: Partial<Record<Zone, number>> }
export interface CardEntry { id: string; name: string; quantity: number; zone: Zone; info?: CardInfo; tags?: string[] }
export interface Deck { id: string; name: string; formatId: string; notes: string; cards: CardEntry[]; updatedAt: string; views?: Partial<Record<Zone, BoardView>>; layout?: DeckLayout; tags?: string[] }
export interface Library { version: 1; formats: Format[]; decks: Deck[]; defaultsVersion?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10; preferredPrintings?: Record<string, CardInfo>; preferredView?: BoardView }
export const STORAGE_KEY = 'mtg-format-forge.library.v1';
export const normalizeName = (name: string) => name.trim().toLocaleLowerCase('en-US');
export const ruleCardName = (name: string) => normalizeName(name.split(' // ')[0]);
export const countCards = (deck: Deck, zone: Zone) => deck.cards.filter(c => c.zone === zone).reduce((sum, c) => sum + c.quantity, 0);
export const deckSize = (deck: Deck) => countCards(deck, 'main') + countCards(deck, 'commander');
export const sideboardSize = (deck: Deck, format?: Format) => countCards(deck, 'side') + (format?.commanderRules ? 0 : countCards(deck, 'companion'));
const basics = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes', 'snow-covered plains', 'snow-covered island', 'snow-covered swamp', 'snow-covered mountain', 'snow-covered forest']);

export function blankFormat(): Format {
  return { id: crypto.randomUUID(), name: '', description: '', minCards: 60, maxCards: null, minSideboard: 0, maxSideboard: 15, copyLimit: 4, basicLandExemption: true, banned: [], allowedSets: [], commanderRules: false, normalOnly: true };
}
export function createLibrary(): Library {
  return { version: 1, formats: builtInFormats(), decks: [], defaultsVersion: 10 };
}
export const tournamentOnly = (format: Format) => format.banTournamentIllegal ?? (!format.whitelistOnly && !format.officialFormat && !!format.normalOnly);
export function tournamentEligibility(card: CardEntry, format: Format): 'legal' | 'illegal' | 'unknown' {
  if (!tournamentOnly(format)) return 'legal';
  if (format.allowUnCards && card.info?.isUnCard) return 'legal';
  if (!card.info?.vintageLegality) return 'unknown';
  if (['legal', 'restricted'].includes(card.info.vintageLegality)) return 'legal';
  if (format.allowUnCards && card.info.isUnCard === undefined) return 'unknown';
  return 'illegal';
}
export const cardPoints = (card: Pick<CardEntry, 'name'>, format?: Format): number => format?.pointed?.find(point => ruleCardName(point.name) === ruleCardName(card.name))?.points ?? 0;
export const validReleaseDate = (date: unknown): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
export const hasReleaseRange = (format: Format) => !!(format.releasedAfter || format.releasedBefore);
export const inReleaseRange = (date: string, format: Format) => (!format.releasedAfter || date >= format.releasedAfter) && (!format.releasedBefore || date <= format.releasedBefore);
// Svelte's numeric inputs produce null when cleared. Optional limits use undefined.
export const optionalLimit = (value: number | null | undefined): number | undefined => value ?? undefined;
export function normalizeFormatLimits(value: { [K in 'maxCards' | 'maxSideboard' | 'maxPoints' | 'minCardPrice' | 'maxCardPrice' | 'minDeckPrice' | 'maxDeckPrice']?: number | null }) {
  return {
    maxCards: optionalLimit(value.maxCards) ?? null, maxSideboard: optionalLimit(value.maxSideboard) ?? null,
    maxPoints: optionalLimit(value.maxPoints),
    minCardPrice: optionalLimit(value.minCardPrice), maxCardPrice: optionalLimit(value.maxCardPrice),
    minDeckPrice: optionalLimit(value.minDeckPrice), maxDeckPrice: optionalLimit(value.maxDeckPrice),
  };
}
export function formatText(format: Format): string { return JSON.stringify({ version: 1, formats: [format], decks: [] }, null, 2); }
export function parseFormatText(raw: string): Format[] {
  const library = parseLibrary(raw);
  if (!library.formats.length || library.decks.length) throw new Error('Choose a standalone format export, not a deck-library backup.');
  return library.formats;
}
export function officialLegality(card: Pick<CardEntry, 'info'>, format: Format): string | undefined {
  const key = format.officialFormat;
  if (!key || format.whitelistOnly) return undefined;
  return card.info?.legalities?.[key] ?? (key === 'modern' ? card.info?.modernLegality : key === 'vintage' ? card.info?.vintageLegality : undefined);
}
function copyRestriction(deck: Deck, format: Format, key: string): number | undefined {
  const named = format.restricted?.find(card => ruleCardName(card.name) === key)?.limit;
  const official = deck.cards.some(card => card.zone !== 'considering' && ruleCardName(card.name) === key && officialLegality(card, format) === 'restricted');
  return official ? Math.min(named ?? Infinity, 1) : named;
}
export function setLegality(card: CardEntry, format: Format, allowedNames?: Set<string>): 'legal' | 'illegal' | 'unknown' {
  if (format.whitelistOnly) { const allowed = allowedNames ?? new Set((format.allowedCards ?? []).map(normalizeName)); if (![card.name, ...card.name.split(' // ')].some(name => allowed.has(normalizeName(name)))) return 'illegal'; }
  const official = !format.whitelistOnly && !!format.officialFormat;
  const legality = officialLegality(card, format);
  if (official && legality && !(format.officialFormat === 'paupercommander' ? legality === 'legal' : ['legal', 'restricted'].includes(legality))) return 'illegal';
  if (hasReleaseRange(format)) {
    const eligibleSet = (set: string) => format.whitelistOnly || official || format.eternal || !format.allowedSets.length || format.allowedSets.includes(set);
    const match = card.info?.printReleases?.some(print => eligibleSet(print.set) && inReleaseRange(print.date, format))
      || card.info?.scryfallId && card.info.releasedAt && eligibleSet(card.info.set) && inReleaseRange(card.info.releasedAt, format);
    if (match) return official && !legality ? 'unknown' : 'legal';
    return card.info?.setsComplete && card.info.printReleases !== undefined ? 'illegal' : 'unknown';
  }
  if (format.whitelistOnly) return 'legal';
  if (official) return legality ? 'legal' : 'unknown';
  if (format.eternal || !format.allowedSets.length || card.info?.printSets?.some(code => format.allowedSets.includes(code))) return 'legal';
  // A printing can prove legality, but cannot prove illegality without all reprints.
  if (card.info?.scryfallId && format.allowedSets.includes(card.info.set)) return 'legal';
  return card.info?.setsComplete ? 'illegal' : 'unknown';
}
export function deckPoints(deck: Deck, format: Format): number {
  const points = new Map((format.pointed ?? []).map(c => [ruleCardName(c.name), c.points]));
  return deck.cards.filter(c => c.zone !== 'considering').reduce((sum, c) => sum + c.quantity * (points.get(ruleCardName(c.name)) ?? 0), 0);
}
export function deckPrice(deck: Deck): { total: number; missing: number } {
  let cents = 0, missing = 0;
  for (const card of deck.cards.filter(c => c.zone !== 'considering')) {
    if (card.info?.priceUSD == null) missing += card.quantity;
    else cents += Math.round(card.info.priceUSD * 100) * card.quantity;
  }
  return { total: cents / 100, missing };
}
export function cardPriceIssues(card: CardEntry, format: Format): string[] {
  const price = card.info?.priceUSD;
  if (price == null) return [];
  const issues: string[] = [];
  if (format.minCardPrice !== undefined && price < format.minCardPrice) issues.push(`Below the $${format.minCardPrice.toFixed(2)} minimum card price`);
  if (format.maxCardPrice !== undefined && price > format.maxCardPrice) issues.push(`Above the $${format.maxCardPrice.toFixed(2)} maximum card price`);
  return issues;
}
export function validateDeck(deck: Deck, format: Format): string[] {
  const issues: string[] = [];
  const allowedNames = format.whitelistOnly ? new Set((format.allowedCards ?? []).map(normalizeName)) : undefined;
  if ([format.minCardPrice, format.maxCardPrice, format.minDeckPrice, format.maxDeckPrice].some(n => n !== undefined)) {
    const price = deckPrice(deck);
    if (price.missing) issues.push(`Price unavailable for ${price.missing} copies; price rules are not fully verified.`);
    if (!price.missing && format.minDeckPrice !== undefined && price.total < format.minDeckPrice) issues.push(`Deck costs $${price.total.toFixed(2)}; minimum is $${format.minDeckPrice.toFixed(2)}.`);
    if (format.maxDeckPrice !== undefined && price.total > format.maxDeckPrice) issues.push(`Deck costs at least $${price.total.toFixed(2)}; maximum is $${format.maxDeckPrice.toFixed(2)}.`);
  }
  const pointTotal = deckPoints(deck, format);
  if (format.maxPoints !== undefined && pointTotal > format.maxPoints) issues.push(`Deck uses ${pointTotal} points; the limit is ${format.maxPoints}.`);
  const main = deckSize(deck), side = sideboardSize(deck, format);
  if (main < format.minCards) issues.push(`Deck needs ${format.minCards - main} more cards (${main}/${format.minCards}).`);
  if (format.maxCards !== null && main > format.maxCards) issues.push(`Deck exceeds the ${format.maxCards}-card limit by ${main - format.maxCards}.`);
  if (side < format.minSideboard) issues.push(`Sideboard needs ${format.minSideboard - side} more cards.`);
  if (format.maxSideboard !== null && side > format.maxSideboard) issues.push(`Sideboard exceeds the ${format.maxSideboard}-card limit by ${side - format.maxSideboard}.`);
  const totals = new Map<string, { name: string; quantity: number }>();
  const banned = new Set(format.banned.map(ruleCardName)), unknown = new Set<string>(), illegal = new Set<string>();
  for (const card of deck.cards.filter(c => c.zone !== 'considering')) {
    issues.push(...cardPriceIssues(card, format).map(issue => `${card.name}: ${issue}.`));
    if (format.bannedTypes?.some(type => card.info?.typeLine.toLowerCase().includes(type.toLowerCase()))) issues.push(`${card.name} has a card type banned in this format.`);
    if (card.zone === 'companion' && format.bannedCompanions?.some(name => normalizeName(name) === normalizeName(card.name))) issues.push(`${card.name} is banned as a companion.`);
    const key = ruleCardName(card.name), prior = totals.get(key);
    totals.set(key, { name: prior?.name ?? card.name, quantity: (prior?.quantity ?? 0) + card.quantity });
    if (format.gameplayOnly && card.info?.isGameCard !== true) issues.push(`${card.name}: ${card.info?.isGameCard === false ? 'not a playable card.' : 'playable-card eligibility not verified.'}`);
    if (tournamentOnly(format)) {
      const eligibility = tournamentEligibility(card, format);
      if (eligibility === 'unknown') issues.push(`${card.name}: tournament-card eligibility not verified.`);
      else if (eligibility === 'illegal') issues.push(`${card.name} is outside this format's tournament card pool.`);
    }
    if (!format.whitelistOnly && format.bannedRarities?.length) {
      const rarities = card.info?.printRarities ?? (card.info?.rarity ? [card.info.rarity] : []);
      const allowedRarities = card.zone === 'commander' && format.commanderAnyCreature ? ['uncommon'] : RARITIES.filter(rarity => !format.bannedRarities!.includes(rarity));
      if (!rarities.some(rarity => allowedRarities.includes(rarity as Rarity))) {
        if (card.info?.setsComplete && card.info.printRarities) issues.push(`${card.name} has no printing at an allowed rarity.`);
        else issues.push(`${card.name}: rarity eligibility not verified.`);
      }
    }
    const pdhCommander = card.zone === 'commander' && format.commanderAnyCreature && card.info?.printRarities?.includes('uncommon');
    const legality = pdhCommander ? 'legal' : setLegality(card, format, allowedNames);
    if (legality === 'unknown') unknown.add(card.name);
    if (legality === 'illegal') illegal.add(card.name);
  }
  for (const card of illegal) issues.push(hasReleaseRange(format) ? `${card} is outside the allowed release dates or card pool.` : format.whitelistOnly ? `${card} is not in the legal card list.` : format.officialFormat ? `${card} is not legal in ${OFFICIAL_FORMAT_NAMES[format.officialFormat]}.` : `${card} was not printed in any allowed set.`);
  if (unknown.size) issues.push(`${hasReleaseRange(format) ? 'Card-pool' : format.officialFormat ? OFFICIAL_FORMAT_NAMES[format.officialFormat] : 'Set'} legality not verified for ${unknown.size} ${unknown.size === 1 ? 'card' : 'cards'}.`);
  for (const [key, card] of totals) {
    if (banned.has(key)) issues.push(`${card.name} is banned in this format.`);
    const restricted = copyRestriction(deck, format, key);
    const limit = Math.min(restricted ?? Infinity, format.copyLimit ?? Infinity);
    if (card.quantity > limit && (restricted !== undefined || !(format.basicLandExemption && basics.has(key)))) issues.push(`${card.name}: ${card.quantity} copies across deck sections; the limit is ${limit}.`);
  }
  if (format.checkCardRoles !== false) {
    if (countCards(deck, 'companion') > 1) issues.push('Choose at most one companion.');
    for (const c of deck.cards.filter(c => c.zone === 'companion')) if (c.info?.scryfallId && !/companion\s*[—-]/i.test(c.info.oracleText)) issues.push(`${c.name} does not have a companion ability.`);
    for (const c of deck.cards.filter(c => c.zone === 'conspiracy')) if (c.info?.scryfallId && !/conspiracy/i.test(c.info.typeLine)) issues.push(`${c.name} is not a conspiracy card.`);
  }
  if (format.commanderRules) {
    const commanders = deck.cards.filter(c => c.zone === 'commander'), quantity = countCards(deck, 'commander');
    if (quantity < 1 || quantity > 2) issues.push('Choose one commander, or two with compatible pairing abilities.');
    if (commanders.some(c => c.quantity !== 1)) issues.push('Each commander must have exactly one copy.');
    for (const c of commanders) {
      const pairedBackground = /background/i.test(c.info?.typeLine ?? '') && commanders.length === 2 && commanders.some(other => other.id !== c.id && /choose a background/i.test(other.info?.oracleText ?? ''));
      if (c.info?.scryfallId && !(format.commanderAnyCreature && /creature/i.test(c.info.typeLine) && c.info.printRarities?.includes('uncommon')) && !(/legendary/i.test(c.info.typeLine) && /creature/i.test(c.info.typeLine)) && !/can be your commander/i.test(c.info.oracleText) && !pairedBackground) issues.push(`${c.name} cannot normally be a commander.`);
    }
    if (commanders.length === 2 && commanders.every(c => c.info?.scryfallId)) {
      const [a, b] = commanders, ta = a.info!.oracleText, tb = b.info!.oracleText;
      const partner = (t: string) => /(?:^|\n)Partner(?:\s*\(|\s*$)/i.test(t);
      const paired = partner(ta) && partner(tb) || /friends forever/i.test(ta) && /friends forever/i.test(tb)
        || ta.toLowerCase().includes(`partner with ${b.name.toLowerCase()}`) && tb.toLowerCase().includes(`partner with ${a.name.toLowerCase()}`)
        || /choose a background/i.test(ta) && /background/i.test(b.info!.typeLine) || /choose a background/i.test(tb) && /background/i.test(a.info!.typeLine)
        || /doctor's companion/i.test(ta) && /Time Lord Doctor/i.test(b.info!.typeLine) || /doctor's companion/i.test(tb) && /Time Lord Doctor/i.test(a.info!.typeLine);
      if (!paired) issues.push('The two commanders do not have a recognized pairing ability.');
    }
    if (commanders.length && commanders.every(c => c.info?.scryfallId)) {
      const identity = new Set(commanders.flatMap(c => c.info!.colorIdentity));
      for (const c of deck.cards.filter(c => c.zone !== 'considering' && c.zone !== 'conspiracy')) if (c.info?.colorIdentity.some(color => !identity.has(color))) issues.push(`${c.name} is outside your commander's color identity.`);
    }
    if (deck.cards.some(c => c.zone !== 'considering' && !c.info?.scryfallId)) issues.push('Commander eligibility and color identity are not fully verified.');
  }
  return issues;
}
export function normalizeTags(tags: string[]): string[] {
  const clean = uniqueCardNames(tags);
  if (clean.length > 50 || clean.some(t => t.length > 40 || /[\r\n,]/.test(t))) throw new Error('Use up to 50 tags, each 40 characters or fewer.');
  return clean;
}
export function setCardTags(deck: Deck, id: string, tags: string[]): Deck {
  const card = deck.cards.find(c => c.id === id);
  if (!card) return deck;
  const clean = normalizeTags(tags);
  return { ...deck, cards: deck.cards.map(c => normalizeName(c.name) === normalizeName(card.name) ? { ...c, tags: clean } : c), updatedAt: new Date().toISOString() };
}
export function addCard(deck: Deck, name: string, quantity: number, zone: Zone, info?: CardInfo, tags?: string[]): Deck {
  if (!name.trim() || name.length > 200 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999 || !ZONES.includes(zone)) throw new Error('Enter a card name and a quantity from 1 to 999.');
  const existing = deck.cards.find(c => normalizeName(c.name) === normalizeName(name) && c.zone === zone);
  const inherited = deck.cards.filter(c => normalizeName(c.name) === normalizeName(name)).flatMap(c => c.tags ?? []);
  const mergedTags = normalizeTags([...inherited, ...(tags ?? [])]);
  if (existing && existing.quantity + quantity > 999) throw new Error('A card entry can have at most 999 copies.');
  const tagging = mergedTags.length ? { tags: mergedTags } : {};
  const cards = existing ? deck.cards.map(c => c.id === existing.id ? { ...c, quantity: c.quantity + quantity, info: info ?? c.info, ...tagging } : c)
    : [...deck.cards, { id: crypto.randomUUID(), name: name.trim(), quantity, zone, ...(info ? { info } : {}), ...tagging }];
  return { ...deck, cards, updatedAt: new Date().toISOString() };
}
export function moveCard(deck: Deck, id: string, zone: Zone, quantity?: number): Deck {
  const card = deck.cards.find(c => c.id === id);
  if (!card || card.zone === zone) return deck;
  const count = quantity ?? card.quantity;
  if (!Number.isSafeInteger(count) || count < 1 || count > card.quantity) throw new Error(`Choose a quantity from 1 to ${card.quantity}.`);
  const cards = count === card.quantity ? deck.cards.filter(c => c.id !== id) : deck.cards.map(c => c.id === id ? { ...c, quantity: c.quantity - count } : c);
  return addCard({ ...deck, cards }, card.name, count, zone, card.info, card.tags);
}
export function replaceDeckText(deck: Deck, text: string, preferences: Record<string, CardInfo> = {}): Deck {
  const hasCards = text.split(/\r?\n/).some(line => { const clean = line.trim(); return clean && !/^(?:#|\/\/)/.test(clean) && !/^(?:deck|mainboard|sideboard|considering|maybeboard|commander|companion|conspiracy)\s*:?$/i.test(clean); });
  const cards = (hasCards ? parseDeckText(text) : []).map(c => {
    const previous = deck.cards.find(old => normalizeName(old.name) === normalizeName(c.name) && old.zone === c.zone) ?? deck.cards.find(old => normalizeName(old.name) === normalizeName(c.name));
    const samePrinting = !c.info || previous?.info?.set === c.info.set && previous.info.collectorNumber === c.info.collectorNumber;
    return { ...c, ...(previous?.tags ? { tags: [...previous.tags] } : {}), info: samePrinting ? previous?.info ?? preferences[normalizeName(c.name)] ?? c.info : c.info };
  });
  return { ...deck, cards, updatedAt: new Date().toISOString() };
}
export function changePrinting(deck: Deck, id: string, info: CardInfo): Deck {
  const card = deck.cards.find(c => c.id === id);
  if (!card) return deck;
  const knownSets = card.info?.oracleId && card.info.oracleId === info.oracleId ? { printSets: card.info.printSets, printRarities: card.info.printRarities, printReleases: card.info.printReleases, setsComplete: card.info.setsComplete, checkedAt: card.info.checkedAt } : {};
  return { ...deck, cards: deck.cards.map(c => c.id === id ? { ...c, info: { ...info, ...knownSets } } : c), updatedAt: new Date().toISOString() };
}
export function isPointerDrag(drag: { pointerId?: number } | null, pointerId: number): boolean { return drag?.pointerId !== undefined && drag.pointerId === pointerId; }

export function visibleZones(deck: Deck): Zone[] {
  return ZONES.filter(z => ['main', 'side', 'considering'].includes(z) || deck.cards.some(c => c.zone === z));
}

export function uniqueCardNames(names: string[]): string[] {
  return [...new Map(names.map(n => n.trim()).filter(Boolean).map(n => [normalizeName(n), n])).values()];
}

// Ban lists accept names alone and the same text conventions as deck imports.
export function parseCardNames(text: string): string[] {
  const headers = /^(?:deck|main|mainboard|main deck|library|sideboard|side|considering|maybeboard|maybe board|commanders?|companions?|conspirac(?:y|ies)|banned cards|ban list)\s*:?(?:\])?$/i;
  const names: string[] = [];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    let line = raw.trim();
    if (!line || /^(?:#|\/\/)/.test(line) || headers.test(line.replace(/^\[/, ''))) continue;
    line = line.replace(/^SB:\s*/i, '').replace(/\s+#.*$/, '').replace(/\s+\*F\*\s*$/i, '').replace(/\s+\[(?:Commander|Companion|Sideboard|Maybeboard|Considering|Conspiracy)\]\s*$/i, '');
    const quantity = line.match(/^(\d+)x?\s+(.+)$/i);
    if (quantity) { if (Number(quantity[1]) < 1 || Number(quantity[1]) > 999) throw new Error(`Line ${index + 1}: invalid quantity.`); line = quantity[2]; }
    line = line.replace(/\s+\([a-z0-9]+\)\s+\S+$/i, '').trim();
    if (!line || line.length > 200 || /^\d+$/.test(line)) throw new Error(`Line ${index + 1}: expected a card name.`);
    names.push(line);
  }
  if (!names.length) throw new Error('No card names found. Paste names or a decklist.');
  return uniqueCardNames(names);
}
export type ExportStyle = 'arena' | 'plain' | 'mtgo' | 'extended';
export function deckText(deck: Deck, style: ExportStyle = 'plain', printings = false): string {
  const line = (c: CardEntry) => `${c.quantity} ${c.name}${printings && c.info?.set && c.info.collectorNumber ? ` (${c.info.set.toUpperCase()}) ${c.info.collectorNumber}` : ''}`;
  const lines = (z: Zone) => deck.cards.filter(c => c.zone === z || (z === 'side' && c.zone === 'companion' && style !== 'extended')).map(line).join('\n');
  if (style === 'mtgo') return [deck.cards.filter(c => c.zone === 'main' || c.zone === 'commander').map(line).join('\n'), deck.cards.filter(c => c.zone === 'side' || c.zone === 'companion').map(c => `SB: ${line(c)}`).join('\n')].filter(Boolean).join('\n') + '\n';
  const zones: Zone[] = style === 'extended' ? ['commander', 'companion', 'main', 'side', 'considering', 'conspiracy'] : ['commander', 'companion', 'main', 'side'];
  const hasRoles = deck.cards.some(c => c.zone === 'commander' || c.zone === 'companion');
  const text = zones.filter(z => z === 'main' || deck.cards.some(c => c.zone === z || z === 'side' && c.zone === 'companion')).map(z => `${z === 'main' && style === 'plain' && !hasRoles ? '' : `${ZONE_NAMES[z]}\n`}${lines(z)}`).join('\n\n').trim();
  return `${style === 'extended' ? '// Format Forge all sections\n' : ''}${text}\n`;
}
// A selected add destination overrides section markers and accepts bare names as one copy.
export function parseDeckText(text: string, targetZone?: Zone): CardEntry[] {
  let zone: Zone = 'main', explicit = false, gap = false;
  const separateRoles = text.includes('// Format Forge all sections');
  let result: Deck = { id: 'import', name: 'Import', formatId: '', notes: '', updatedAt: new Date().toISOString(), cards: [] };
  const headers: Record<string, Zone> = { deck: 'main', main: 'main', mainboard: 'main', 'main deck': 'main', library: 'main', sideboard: 'side', side: 'side', considering: 'considering', maybeboard: 'considering', 'maybe board': 'considering', commander: 'commander', commanders: 'commander', companion: 'companion', companions: 'companion', conspiracy: 'conspiracy', conspiracies: 'conspiracy' };
  const errors: string[] = [];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    let line = raw.trim();
    if (!line) { if (result.cards.some(c => c.zone === 'main')) gap = true; continue; }
    const heading = line.replace(/^(?:\/\/|#)\s*/, '').replace(/^\[|\]$|:$/g, '').trim().toLowerCase();
    if (headers[heading]) { zone = headers[heading]; explicit = true; gap = false; continue; }
    if (/^(?:\/\/|#)/.test(line)) continue;
    let target = zone;
    if (/^SB:\s*/i.test(line)) { target = 'side'; line = line.replace(/^SB:\s*/i, ''); }
    else if (!explicit && gap) target = zone = 'side';
    const tagged = line.match(/\s+\[(Commander|Companion|Sideboard|Maybeboard|Considering|Conspiracy)\]\s*$/i);
    if (tagged) { target = headers[tagged[1].toLowerCase()]; line = line.slice(0, tagged.index).trim(); }
    line = line.replace(/\s+#.*$/, '').replace(/\s+\*F\*\s*$/i, '');
    const match = line.match(/^(\d+)x?\s+(.+)$/i);
    if (!match && /^[-+]?\d+(?:\.\d+)?x?\s+/i.test(line)) { errors.push(`Line ${index + 1}: enter a whole-number quantity from 1 to 999.`); continue; }
    if (!match && !targetZone) { errors.push(`Line ${index + 1}: expected a quantity followed by a card name.`); continue; }
    if (targetZone) target = targetZone;
    const nameText = match?.[2] ?? line;
    const printing = nameText.match(/^(.+?)\s+\(([a-z0-9]+)\)\s+([^\s]+)$/i), cardName = (printing?.[1] ?? nameText).trim();
    try { result = addCard(result, cardName, match ? Number(match[1]) : 1, target); }
    catch (e) { errors.push(`Line ${index + 1}: ${e instanceof Error ? e.message : 'Invalid card.'}`); }
    if (printing) {
      const entry = result.cards.find(c => c.zone === target && normalizeName(c.name) === normalizeName(cardName));
      if (entry) entry.info = { scryfallId: '', set: printing[2].toLowerCase(), collectorNumber: printing[3], typeLine: '', oracleText: '', colorIdentity: [], manaCost: '' };
    }
  }
  if (errors.length) throw new Error(errors.slice(0, 5).join('\n'));
  if (!result.cards.length) throw new Error(targetZone ? 'No cards found. Paste card names, optionally preceded by quantities, one per line.' : 'No cards found. Paste quantities and card names, one per line.');
  // Arena-style lists designate the companion and also include it in the sideboard.
  if (!separateRoles && !targetZone) for (const companion of result.cards.filter(c => c.zone === 'companion')) {
    const side = result.cards.find(c => c.zone === 'side' && normalizeName(c.name) === normalizeName(companion.name));
    if (side) side.quantity -= Math.min(side.quantity, companion.quantity);
  }
  return result.cards.filter(c => c.quantity > 0);
}

// Additive v1 migration preserves existing browser libraries and old backups.
export function parseLibrary(raw: string): Library {
  const value: unknown = JSON.parse(raw);
  const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const str = (v: unknown): v is string => typeof v === 'string';
  const name = (v: unknown): v is string => str(v) && v.trim().length > 0 && v.length <= 200;
  const num = (v: unknown, min = 0): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= 999;
  const money = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000000000;
  const codes = (v: unknown): v is string[] => Array.isArray(v) && v.every(c => str(c) && /^[a-z0-9]{2,8}$/.test(c));
  const fail = (): never => { throw new Error('This file is not a valid Format Forge v1 backup.'); };
  if (!object(value) || value.version !== 1 || !Array.isArray(value.formats) || !Array.isArray(value.decks) || value.formats.length > 1000 || value.decks.length > 10000) return fail();
  const formatIds = new Set<string>();
  const formats: Format[] = value.formats.map(f => {
    if (!object(f) || !name(f.id) || formatIds.has(f.id) || !name(f.name) || !str(f.description) || !num(f.minCards)
      || !(f.maxCards === null || num(f.maxCards, f.minCards)) || !num(f.minSideboard ?? 0)
      || !(f.maxSideboard === null || num(f.maxSideboard, (f.minSideboard ?? 0) as number)) || !(f.copyLimit === null || num(f.copyLimit, 1))
      || typeof f.basicLandExemption !== 'boolean' || !Array.isArray(f.banned) || !f.banned.every(name)
      || (f.maxPoints !== undefined && !num(f.maxPoints)) || (f.pointed !== undefined && (!Array.isArray(f.pointed) || !f.pointed.every(c => object(c) && name(c.name) && num(c.points)) || new Set(f.pointed.map(c => ruleCardName((c as { name: string }).name))).size !== f.pointed.length))
      || (f.whitelistOnly !== undefined && typeof f.whitelistOnly !== 'boolean') || (f.allowedCards !== undefined && (!Array.isArray(f.allowedCards) || f.allowedCards.length > 50000 || !f.allowedCards.every(name))) || (f.whitelistOnly === true && (!Array.isArray(f.allowedCards) || !f.allowedCards.length))
      || (f.normalOnly !== undefined && typeof f.normalOnly !== 'boolean') || (f.bannedRarities !== undefined && (!Array.isArray(f.bannedRarities) || !f.bannedRarities.every(r => RARITIES.includes(r as Rarity)))) || (f.restricted !== undefined && (!Array.isArray(f.restricted) || !f.restricted.every(c => object(c) && name(c.name) && num(c.limit, 1)) || new Set(f.restricted.map(c => ruleCardName((c as { name: string }).name))).size !== f.restricted.length))
      || (f.allowedSets !== undefined && !codes(f.allowedSets)) || (f.commanderRules !== undefined && typeof f.commanderRules !== 'boolean') || (f.eternal !== undefined && typeof f.eternal !== 'boolean') || (f.bannedTypes !== undefined && (!Array.isArray(f.bannedTypes) || !f.bannedTypes.every(name))) || (f.bannedCompanions !== undefined && (!Array.isArray(f.bannedCompanions) || !f.bannedCompanions.every(name)))) return fail();
    if (f.releasedAfter !== undefined && !validReleaseDate(f.releasedAfter) || f.releasedBefore !== undefined && !validReleaseDate(f.releasedBefore) || typeof f.releasedAfter === 'string' && typeof f.releasedBefore === 'string' && f.releasedAfter > f.releasedBefore) return fail();
    if (f.tags !== undefined && (!Array.isArray(f.tags) || !f.tags.every(name) || f.tags.length > 50 || new Set(f.tags.map(normalizeName)).size !== f.tags.length)) return fail();
    for (const key of ['gameplayOnly', 'checkCardRoles', 'commanderAnyCreature']) if (f[key] !== undefined && typeof f[key] !== 'boolean') return fail();
    if (f.allowUnCards !== undefined && typeof f.allowUnCards !== 'boolean') return fail();
    if (f.banTournamentIllegal !== undefined && typeof f.banTournamentIllegal !== 'boolean' || f.officialFormat !== undefined && (typeof f.officialFormat !== 'string' || !Object.hasOwn(OFFICIAL_FORMAT_NAMES, f.officialFormat))) return fail();
    for (const key of ['minCardPrice', 'maxCardPrice', 'minDeckPrice', 'maxDeckPrice']) if (f[key] !== undefined && !money(f[key])) return fail();
    if (f.minCardPrice !== undefined && f.maxCardPrice !== undefined && (f.minCardPrice as number) > (f.maxCardPrice as number) || f.minDeckPrice !== undefined && f.maxDeckPrice !== undefined && (f.minDeckPrice as number) > (f.maxDeckPrice as number)) return fail();
    formatIds.add(f.id);
    const tags = f.tags === undefined ? undefined : normalizeTags(f.tags as string[]);
    return { ...(tags?.length ? { tags } : {}), ...(f.commanderAnyCreature !== undefined ? { commanderAnyCreature: f.commanderAnyCreature as boolean } : {}), id: f.id, name: f.name, description: f.description, minCards: f.minCards, maxCards: f.maxCards,
      minSideboard: (f.minSideboard ?? 0) as number, maxSideboard: f.maxSideboard, copyLimit: f.copyLimit,
      ...(f.releasedAfter !== undefined ? { releasedAfter: f.releasedAfter as string } : {}), ...(f.releasedBefore !== undefined ? { releasedBefore: f.releasedBefore as string } : {}),
      ...Object.fromEntries(['gameplayOnly', 'checkCardRoles'].filter(key => f[key] !== undefined).map(key => [key, f[key]])),
      ...(f.allowUnCards !== undefined ? { allowUnCards: f.allowUnCards as boolean } : {}),
      ...(f.banTournamentIllegal !== undefined ? { banTournamentIllegal: f.banTournamentIllegal as boolean } : {}), ...(f.officialFormat !== undefined ? { officialFormat: f.officialFormat as OfficialFormat } : {}),
      ...Object.fromEntries(['minCardPrice', 'maxCardPrice', 'minDeckPrice', 'maxDeckPrice'].filter(key => f[key] !== undefined).map(key => [key, f[key]])),
      ...(f.maxPoints !== undefined ? { maxPoints: f.maxPoints as number } : {}), ...(f.pointed !== undefined ? { pointed: f.pointed as { name: string; points: number }[] } : {}),
      ...(f.whitelistOnly !== undefined ? { whitelistOnly: f.whitelistOnly as boolean } : {}), ...(f.allowedCards !== undefined ? { allowedCards: uniqueCardNames(f.allowedCards as string[]) } : {}),
      ...(f.normalOnly !== undefined ? { normalOnly: f.normalOnly as boolean } : {}), ...(f.bannedRarities !== undefined ? { bannedRarities: f.bannedRarities as Rarity[] } : {}), ...(f.restricted !== undefined ? { restricted: f.restricted as { name: string; limit: number }[] } : {}),
      basicLandExemption: f.basicLandExemption, banned: f.banned as string[], allowedSets: (f.allowedSets ?? []) as string[], commanderRules: (f.commanderRules ?? false) as boolean, ...(f.eternal !== undefined ? { eternal: f.eternal as boolean } : {}), ...(f.bannedTypes !== undefined ? { bannedTypes: f.bannedTypes as string[] } : {}), ...(f.bannedCompanions !== undefined ? { bannedCompanions: f.bannedCompanions as string[] } : {}) };
  });
  function info(v: unknown): CardInfo | undefined {
    if (v === undefined) return undefined;
    if (!object(v) || !str(v.scryfallId) || !str(v.set) || !str(v.collectorNumber) || !str(v.typeLine) || !str(v.oracleText) || !str(v.manaCost)
      || !Array.isArray(v.colorIdentity) || !v.colorIdentity.every(c => str(c) && /^[WUBRG]$/.test(c))
      || (v.oracleId !== undefined && !str(v.oracleId)) || (v.printSets !== undefined && !codes(v.printSets))
      || (v.colors !== undefined && (!Array.isArray(v.colors) || !v.colors.every(c => str(c) && /^[WUBRG]$/.test(c))))
      || (v.manaValue !== undefined && v.manaValue !== null && (typeof v.manaValue !== 'number' || !Number.isFinite(v.manaValue)))
      || (v.priceUSD !== undefined && v.priceUSD !== null && (typeof v.priceUSD !== 'number' || !Number.isFinite(v.priceUSD) || v.priceUSD < 0))
      || (v.setName !== undefined && !str(v.setName)) || (v.vintageLegality !== undefined && (!str(v.vintageLegality) || !['legal', 'restricted', 'banned', 'not_legal'].includes(v.vintageLegality))) || (v.printRarities !== undefined && (!Array.isArray(v.printRarities) || !v.printRarities.every(r => RARITIES.includes(r as Rarity))))
      || (v.rarity !== undefined && !str(v.rarity))
      || (v.setsComplete !== undefined && typeof v.setsComplete !== 'boolean') || (v.checkedAt !== undefined && (!str(v.checkedAt) || !Number.isFinite(Date.parse(v.checkedAt))))) return fail();
    if (v.releasedAt !== undefined && !validReleaseDate(v.releasedAt) || v.printReleases !== undefined && (!Array.isArray(v.printReleases) || v.printReleases.length > 10000 || !v.printReleases.every(print => object(print) && str(print.set) && /^[a-z0-9]{2,8}$/.test(print.set) && validReleaseDate(print.date)))) return fail();
    if (v.isGameCard !== undefined && typeof v.isGameCard !== 'boolean') return fail();
    if (v.isUnCard !== undefined && typeof v.isUnCard !== 'boolean') return fail();
    if (v.legalities !== undefined && (!object(v.legalities) || Object.entries(v.legalities).some(([key, status]) => !Object.hasOwn(OFFICIAL_FORMAT_NAMES, key) || !['legal', 'restricted', 'banned', 'not_legal'].includes(status as string)))) return fail();
    if (v.modernLegality !== undefined && (!str(v.modernLegality) || !['legal', 'restricted', 'banned', 'not_legal'].includes(v.modernLegality))) return fail();
    const image = (url: unknown): string | undefined => str(url) && /^https:\/\/cards\.scryfall\.io\//.test(url) ? url : undefined;
    return { scryfallId: v.scryfallId, set: v.set, collectorNumber: v.collectorNumber, typeLine: v.typeLine, oracleText: v.oracleText,
      ...(v.releasedAt !== undefined ? { releasedAt: v.releasedAt as string } : {}), ...(v.printReleases !== undefined ? { printReleases: v.printReleases as { set: string; date: string }[] } : {}),
      ...(v.isGameCard !== undefined ? { isGameCard: v.isGameCard as boolean } : {}),
      ...(v.isUnCard !== undefined ? { isUnCard: v.isUnCard as boolean } : {}),
      ...(v.legalities !== undefined ? { legalities: v.legalities as CardInfo['legalities'] } : {}),
      ...(v.modernLegality !== undefined ? { modernLegality: v.modernLegality as string } : {}),
      ...(v.setName !== undefined ? { setName: v.setName as string } : {}), ...(v.vintageLegality !== undefined ? { vintageLegality: v.vintageLegality as string } : {}), ...(v.printRarities !== undefined ? { printRarities: v.printRarities as string[] } : {}),
      manaCost: v.manaCost, colorIdentity: v.colorIdentity as string[], oracleId: v.oracleId as string | undefined,
      image: image(v.image), backImage: image(v.backImage), printSets: v.printSets as string[] | undefined,
      setsComplete: v.setsComplete as boolean | undefined, checkedAt: v.checkedAt as string | undefined,
      ...(v.colors !== undefined ? { colors: v.colors as string[] } : {}), ...(v.manaValue !== undefined ? { manaValue: v.manaValue as number | null } : {}),
      ...(v.priceUSD !== undefined ? { priceUSD: v.priceUSD as number | null } : {}), ...(v.rarity !== undefined ? { rarity: v.rarity as string } : {}) };
  }
  function readView(view: unknown): BoardView {
    if (!object(view) || !CARD_SORTS.includes(view.sort as CardSort) || !(view.group === 'none' || CARD_SORTS.includes(view.group as CardSort)) || !['asc', 'desc'].includes(view.direction as string)) return fail();
    if (view.details !== undefined && (!Array.isArray(view.details) || !view.details.every(k => CARD_SORTS.includes(k as CardSort) || k === 'manaCost'))) return fail();
    if (view.display !== undefined && !['list', 'compact', 'cards'].includes(view.display as string)) return fail();
    if (view.showPrintings !== undefined && typeof view.showPrintings !== 'boolean') return fail();
    if (view.cardSize !== undefined && (typeof view.cardSize !== 'number' || !Number.isInteger(view.cardSize) || view.cardSize < 100 || view.cardSize > 320)) return fail();
    return { ...(view.cardSize !== undefined ? { cardSize: view.cardSize as number } : {}), ...(view.display !== undefined ? { display: view.display === 'list' ? 'compact' as const : view.display as BoardView['display'] } : {}), ...(view.details !== undefined ? { details: [...new Set((view.details as (CardDetail | CardSort)[]).map(k => k === 'colors' ? 'manaCost' : k))] } : {}), ...(view.showPrintings !== undefined ? { showPrintings: view.showPrintings as boolean } : {}), sort: view.sort as CardSort, group: view.group as BoardView['group'], direction: view.direction as BoardView['direction'] };
  }
  const ids = new Set<string>();
  const decks: Deck[] = value.decks.map(d => {
    if (!object(d) || !name(d.id) || ids.has(d.id) || !name(d.name) || !str(d.formatId) || !formatIds.has(d.formatId)
      || !str(d.notes) || !str(d.updatedAt) || !Number.isFinite(Date.parse(d.updatedAt)) || !Array.isArray(d.cards) || d.cards.length > 10000) return fail();
    ids.add(d.id);
    const entryIds = new Set<string>(), entries = new Set<string>();
    const cards: CardEntry[] = d.cards.map(c => {
      if (!object(c) || !name(c.id) || entryIds.has(c.id) || !name(c.name) || !num(c.quantity, 1) || !ZONES.includes(c.zone as Zone)) return fail();
      const key = `${c.zone}:${normalizeName(c.name)}`;
      if (entries.has(key)) return fail();
      entryIds.add(c.id); entries.add(key);
      const metadata = info(c.info);
      if (c.tags !== undefined && (!Array.isArray(c.tags) || !c.tags.every(str))) return fail();
      const tags = c.tags !== undefined ? normalizeTags(c.tags as string[]) : undefined;
      return { id: c.id, name: c.name, quantity: c.quantity, zone: c.zone as Zone, ...(metadata ? { info: metadata } : {}), ...(tags !== undefined ? { tags } : {}) };
    });
    const views: Partial<Record<Zone, BoardView>> = {};
    if (d.views !== undefined) {
      if (!object(d.views)) return fail();
      for (const [zone, view] of Object.entries(d.views)) {
        if (!ZONES.includes(zone as Zone)) return fail();
        views[zone as Zone] = readView(view);
      }
    }
    const layout: DeckLayout = {};
    if (d.layout !== undefined) {
      if (!object(d.layout)) return fail();
      for (const key of ['workspace', 'boards', 'auxiliary', 'searchControls'] as const) {
        const ratio = d.layout[key];
        if (ratio !== undefined) {
          if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 15 || ratio > 85) return fail();
          layout[key] = ratio;
        }
      }
      if (d.layout.zoneSplits !== undefined) { if (!object(d.layout.zoneSplits)) return fail(); layout.zoneSplits = {}; for (const [zone, ratio] of Object.entries(d.layout.zoneSplits)) { if (!ZONES.includes(zone as Zone) || typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 15 || ratio > 85) return fail(); layout.zoneSplits[zone as Zone] = ratio; } }
      if (d.layout.hiddenZones !== undefined) { if (!Array.isArray(d.layout.hiddenZones) || !d.layout.hiddenZones.every(zone => UI_SECTIONS.includes(zone as UISection))) return fail(); layout.hiddenZones = [...new Set(d.layout.hiddenZones)] as UISection[]; }
      if (d.layout.special !== undefined) {
        if (!object(d.layout.special)) return fail();
        layout.special = {};
        for (const [zone, height] of Object.entries(d.layout.special)) {
          if (!ZONES.includes(zone as Zone) || typeof height !== 'number' || !Number.isFinite(height) || height < 70 || height > 1000) return fail();
          layout.special[zone as Zone] = height;
        }
      }
    }
    if (d.tags !== undefined && (!Array.isArray(d.tags) || !d.tags.every(str))) return fail();
    return { ...(d.tags !== undefined ? { tags: normalizeTags(d.tags as string[]) } : {}), id: d.id, name: d.name, formatId: d.formatId, notes: d.notes, updatedAt: d.updatedAt, cards,
      ...(d.views !== undefined ? { views } : {}), ...(d.layout !== undefined ? { layout } : {}) };
  });
  if (value.defaultsVersion !== undefined && value.defaultsVersion !== 1 && value.defaultsVersion !== 2 && value.defaultsVersion !== 3 && value.defaultsVersion !== 4 && value.defaultsVersion !== 5 && value.defaultsVersion !== 6 && value.defaultsVersion !== 7 && value.defaultsVersion !== 8 && value.defaultsVersion !== 9 && value.defaultsVersion !== 10) return fail();
  const preferences: Record<string, CardInfo> = {};
  if (value.preferredPrintings !== undefined) {
    if (!object(value.preferredPrintings)) return fail();
    for (const [key, rawInfo] of Object.entries(value.preferredPrintings)) { const printing = info(rawInfo); if (!name(key) || !printing?.scryfallId) return fail(); Object.defineProperty(preferences, normalizeName(key), { value: printing, enumerable: true, writable: true, configurable: true }); }
  }
  return { version: 1, formats, decks, ...(value.preferredView !== undefined ? { preferredView: readView(value.preferredView) } : {}), ...(value.defaultsVersion !== undefined ? { defaultsVersion: value.defaultsVersion as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 } : {}), ...(value.preferredPrintings !== undefined ? { preferredPrintings: preferences } : {}) };
}

export interface ValuedCard { name: string; value: number }
export function parseValuedCards(text: string, defaultValue: number, minimum = 0): ValuedCard[] {
  const result = new Map<string, ValuedCard>();
  const valid = (value: number) => Number.isSafeInteger(value) && value >= minimum && value <= 999;
  if (!valid(defaultValue)) throw new Error(`Choose a default value from ${minimum} to 999.`);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(?:#|\/\/)/.test(line) || /^(?:deck|sideboard|commander|companion|considering|maybeboard|conspiracy)\s*:?$/i.test(line)) continue;
    const explicit = line.match(/^(.*?)\s*(?:=|:|\t)\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!explicit && /[=\t]/.test(line)) throw new Error(`Use Card name = a whole value: ${line}`);
    // A leading number is a card-list quantity, not a points value. Explicit
    // values use "Name = value" or "Name: value" to avoid that ambiguity.
    const names = parseCardNames(explicit ? explicit[1] : line);
    const value = explicit ? Number(explicit[2]) : defaultValue;
    if (!valid(value)) throw new Error(`Use whole values from ${minimum} to 999: ${line}`);
    for (const name of names) result.set(ruleCardName(name), { name, value });
  }
  if (!result.size) throw new Error('No cards found. Paste card names or a decklist.');
  return [...result.values()];
}
export function mergeValuedCards(existing: ValuedCard[], imported: ValuedCard[], replace = false): ValuedCard[] {
  const result = new Map((replace ? [] : existing).map(card => [ruleCardName(card.name), card]));
  for (const card of imported) result.set(ruleCardName(card.name), card);
  return [...result.values()];
}

export interface CardStatus { illegal: string[]; limits: string[] }
export function deckCardStatuses(deck: Deck, format: Format): Map<string, CardStatus> {
  const allowedNames = format.whitelistOnly ? new Set((format.allowedCards ?? []).map(normalizeName)) : undefined;
  const totals = new Map<string, number>();
  for (const card of deck.cards.filter(c => c.zone !== 'considering')) totals.set(ruleCardName(card.name), (totals.get(ruleCardName(card.name)) ?? 0) + card.quantity);
  const pointTotal = deckPoints(deck, format);
  const commanderCards = deck.cards.filter(c => c.zone === 'commander');
  const identity = commanderCards.length && commanderCards.every(c => c.info?.scryfallId) ? new Set(commanderCards.flatMap(c => c.info!.colorIdentity)) : undefined;
  return new Map(deck.cards.map(card => {
    const illegal: string[] = cardPriceIssues(card, format), limits: string[] = [];
    const key = ruleCardName(card.name);
    if (format.banned.some(name => ruleCardName(name) === key)) illegal.push('Banned card');
    if (setLegality(card, format, allowedNames) === 'illegal') illegal.push(hasReleaseRange(format) ? 'Outside release dates or allowed card pool' : format.whitelistOnly ? 'Not in legal card list' : format.officialFormat ? `Not legal in ${OFFICIAL_FORMAT_NAMES[format.officialFormat]}` : 'Not in allowed sets');
    if (format.gameplayOnly && card.info?.isGameCard === false) illegal.push('Not a playable card');
    if (tournamentEligibility(card, format) === 'illegal') illegal.push('Outside tournament card pool');
    if (!format.whitelistOnly && format.bannedRarities?.length && card.info?.setsComplete && card.info.printRarities) { const allowed = card.zone === 'commander' && format.commanderAnyCreature ? ['uncommon'] : RARITIES.filter(rarity => !format.bannedRarities!.includes(rarity)); if (!card.info.printRarities.some(rarity => allowed.includes(rarity as Rarity))) illegal.push('No allowed rarity printing'); }
    if (format.bannedTypes?.some(type => card.info?.typeLine.toLowerCase().includes(type.toLowerCase()))) illegal.push('Banned card type');
    if (card.zone === 'companion' && format.bannedCompanions?.some(name => ruleCardName(name) === key)) illegal.push('Banned as companion');
    if (format.commanderRules && identity && card.info?.scryfallId && card.info.colorIdentity.some(color => !identity.has(color))) illegal.push('Outside commander color identity');
    if (card.zone !== 'considering') {
      const restriction = copyRestriction(deck, format, key);
      const limit = Math.min(restriction ?? Infinity, format.copyLimit ?? Infinity);
      if ((restriction !== undefined || !(format.basicLandExemption && basics.has(key))) && (totals.get(key) ?? 0) > limit) limits.push(`Copy limit ${limit} exceeded`);
      if (format.maxPoints !== undefined && pointTotal > format.maxPoints && format.pointed?.some(c => ruleCardName(c.name) === key && c.points > 0)) limits.push(`Point budget exceeded (${pointTotal}/${format.maxPoints})`);
    }
    return [card.id, { illegal, limits }];
  }));
}
