import { scryfallClient, ApiError, CACHE_TTL } from './scryfall-client.ts';
import { normalizeName, RARITIES, OFFICIAL_FORMAT_NAMES, tournamentOnly, validReleaseDate, inReleaseRange, setLegality } from './model.ts';
import type { CardEntry, CardInfo, Format, Rarity } from './model.ts';

export interface ScryfallCard {
  id: string; oracle_id?: string; name: string; set: string; set_name?: string; released_at?: string; collector_number: string;
  type_line: string; oracle_text?: string; mana_cost?: string; color_identity: string[]; produced_mana?: string[];
  legalities?: Record<string, string>;
  border_color?: string; security_stamp?: string | null; layout?: string;
  artist?: string; power?: string; toughness?: string; edhrec_rank?: number; cmc?: number; colors?: string[]; rarity?: string; prices?: { usd?: string | null; usd_foil?: string | null };
  image_uris?: { normal: string; small: string };
  card_faces?: { name: string; colors?: string[]; oracle_text?: string; mana_cost?: string; image_uris?: { normal: string; small: string } }[];
}
export interface ScryfallSet { code: string; name: string; released_at?: string }
export interface SearchResult { data: ScryfallCard[]; total_cards: number; has_more: boolean; next_page?: string }
interface CollectionResult { data: ScryfallCard[]; not_found: unknown[] }
export interface SearchFilters {
  name: string; type: string; typeMode: 'all' | 'any'; excludeType: string; oracle: string;
  colors: string; colorMode: '<=' | '>=' | '='; identity: string; identityMode: '<=' | '>=' | '=';
  manaCost: string; manaValue: string; power: string; toughness: string; loyalty: string;
  rarity: string; sets: string; block: string; legalFormat: string; legality: 'legal' | 'banned' | 'restricted';
  artist: string; flavor: string; language: string; game: string; border: string;
  normalOnly: boolean; includeTokens: boolean; includeUnCards: boolean;
  releasedAfter: string; releasedBefore: string; price: string; currency: 'usd' | 'eur' | 'tix';
}
export const emptyFilters = (): SearchFilters => ({ name: '', type: '', typeMode: 'all', excludeType: '', oracle: '', colors: '', colorMode: '<=', identity: '', identityMode: '<=', manaCost: '', manaValue: '', power: '', toughness: '', loyalty: '', rarity: '', sets: '', block: '', legalFormat: '', legality: 'legal', artist: '', flavor: '', language: '', game: '', border: '', releasedAfter: '', releasedBefore: '', price: '', currency: 'usd', normalOnly: true, includeTokens: false, includeUnCards: false });
const UN_CARD_QUERY = '((border:silver or stamp:acorn) -t:card -t:token -t:emblem -layout:art_series)';
export function isGameCard(card: ScryfallCard): boolean {
  return !['token', 'double_faced_token', 'emblem', 'art_series'].includes(card.layout ?? '')
    && !/\bToken\b|^(?:Card|Emblem|Art Series)(?:$|\s*(?:—|-|\/\/))/i.test(card.type_line);
}
export function isUnCard(card: ScryfallCard): boolean {
  return (card.border_color === 'silver' || card.security_stamp === 'acorn')
    && !['token', 'double_faced_token', 'emblem', 'art_series'].includes(card.layout ?? '')
    && !/\bToken\b|^(?:Card|Emblem|Art Series)(?:$|\s*(?:—|-|\/\/))/i.test(card.type_line);
}
export const quote = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
export function rulesTextTerms(value: string): string[] {
  if (!/[",]/.test(value)) return value.trim() ? [value.trim()] : [];
  const terms: string[] = [];
  let buffer = '', quoted = false;
  const flush = () => { if (buffer.trim()) terms.push(buffer.trim()); buffer = ''; };
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '\\' && quoted && i + 1 < value.length) { buffer += value[++i]; continue; }
    if (char === '"') { flush(); quoted = !quoted; continue; }
    if (char === ',' && !quoted) { flush(); continue; }
    buffer += char;
  }
  if (quoted) throw new Error('Close each quoted rules-text phrase.');
  flush(); return terms;
}

export function buildSearchQuery(query: string, filters: SearchFilters, format?: Format, target?: string): string {
  const parts: string[] = query.trim() ? [`(${query.trim()})`] : [];
  if (filters.name.trim()) parts.push(`name:${quote(filters.name.trim())}`);
  if (filters.type.trim()) parts.push(`(${filters.type.trim().split(/\s+/).map(t => `t:${quote(t)}`).join(filters.typeMode === 'any' ? ' or ' : ' ')})`);
  if (filters.excludeType.trim()) parts.push(...filters.excludeType.trim().split(/\s+/).map(t => `-t:${quote(t)}`));
  parts.push(...rulesTextTerms(filters.oracle).map(term => `o:${quote(term)}`));
  if (!filters.includeTokens) parts.push('-t:token');
  if (format?.gameplayOnly) parts.push('-t:card -t:token -t:emblem -layout:art_series');
  const requireTournament = format ? tournamentOnly(format) : false;
  if (filters.normalOnly && (!format?.officialFormat || format.whitelistOnly) || requireTournament) {
    const eligibility = ['legal:vintage', 'restricted:vintage'];
    if (requireTournament ? format?.allowUnCards : filters.includeUnCards) eligibility.push(UN_CARD_QUERY);
    if (filters.includeTokens && !requireTournament) eligibility.push('t:token');
    parts.push(`(${eligibility.join(' or ')})`);
  }
  if (format?.officialFormat && !format.whitelistOnly) {
    if (format.officialFormat === 'paupercommander' && target === 'commander') parts.push('is:paupercommander');
    else parts.push(format.officialFormat === 'vintage' ? '(legal:vintage or restricted:vintage)' : `legal:${format.officialFormat}`);
  }
  if (format?.minCardPrice !== undefined) parts.push(`usd>=${format.minCardPrice}`);
  if (format?.maxCardPrice !== undefined) parts.push(`usd<=${format.maxCardPrice}`);
  if (filters.colors) parts.push(`c${filters.colorMode}${filters.colors}`);
  if (filters.identity) parts.push(`ci${filters.identityMode}${filters.identity}`);
  if (filters.manaCost.trim()) parts.push(`mana:${quote(filters.manaCost.trim())}`);
  for (const [label, key, value] of [['Mana value', 'mv', filters.manaValue], ['Power', 'pow', filters.power], ['Toughness', 'tou', filters.toughness], ['Loyalty', 'loy', filters.loyalty], ['Price', filters.currency, filters.price]]) {
    if (!value.trim()) continue;
    if (!/^(?:<=|>=|=|<|>)?-?\d+(?:\.\d+)?$/.test(value.trim())) throw new Error(`${label} must be a number, optionally with <, <=, =, >=, or >.`);
    parts.push(`${key}${/^[<>=]/.test(value.trim()) ? value.trim() : `=${value.trim()}`}`);
  }
  if (filters.rarity) parts.push(`r:${filters.rarity}`);
  const codes = filters.sets.split(/[\s,]+/).filter(Boolean).map(c => c.toLowerCase());
  if (codes.some(c => !/^[a-z0-9]{2,8}$/.test(c))) throw new Error('Enter set codes separated by spaces or commas.');
  if (codes.length) parts.push(`(${codes.map(c => `set:${c}`).join(' or ')})`);
  if (filters.block.trim()) {
    if (!/^[a-z0-9]{2,8}$/i.test(filters.block.trim())) throw new Error('Enter a set code for the block.');
    parts.push(`block:${filters.block.trim().toLowerCase()}`);
  }
  if (filters.legalFormat) parts.push(`${filters.legality}:${filters.legalFormat}`);
  if (filters.artist.trim()) parts.push(`artist:${quote(filters.artist.trim())}`);
  if (filters.flavor.trim()) parts.push(`flavor:${quote(filters.flavor.trim())}`);
  if (filters.language) parts.push(`lang:${filters.language}`);
  if (filters.game) parts.push(`game:${filters.game}`);
  if (filters.border) parts.push(`border:${filters.border}`);
  for (const [operator, date] of [['>=', filters.releasedAfter], ['<=', filters.releasedBefore]]) {
    if (!date) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Enter a valid release date.');
    parts.push(`date${operator}${date}`);
  }
  if (format?.releasedAfter) parts.push(`date>=${format.releasedAfter}`);
  if (format?.releasedBefore) parts.push(`date<=${format.releasedBefore}`);
  if (!format?.whitelistOnly && !format?.officialFormat && !format?.eternal && format?.allowedSets.length) parts.push(`(${format.allowedSets.map(c => `set:${c}`).join(' or ')})`);
  // Exact-name bans are applied to returned cards, not embedded in Scryfall's
  // grammar. Names and punctuation must never break a format's API query.
  if (!format?.whitelistOnly && format?.bannedRarities?.length) {
    const allowed = RARITIES.filter(r => !format.bannedRarities!.includes(r));
    parts.push(allowed.length ? `(${allowed.map(r => `in:${r}`).join(' or ')})` : 'mv<0');
  }
  if (format?.bannedTypes) parts.push(...format.bannedTypes.map(type => `-t:${quote(type)}`));
  // The API requires a nonempty query. This name regex matches every card.
  return parts.join(' ') || 'name:/.*/';
}

// Shared, persistent caching and rate limiting cover every API caller.
const request = <T>(url: string, signal?: AbortSignal) => scryfallClient.request<T>(url, signal);
const searchCache = new Map<string, { at: number; data: SearchResult }>();
export interface SearchOptions { unique?: 'cards' | 'art' | 'prints'; direction?: 'auto' | 'asc' | 'desc'; extras?: boolean }
export async function searchCards(query: string, order = 'name', signal?: AbortSignal, next?: string, options: SearchOptions = {}): Promise<SearchResult> {
  const url = next ?? `https://api.scryfall.com/cards/search?${new URLSearchParams({ q: query.trim() || 'name:/.*/', unique: options.unique ?? 'cards', order, dir: options.direction ?? 'auto', include_extras: String(options.extras ?? true) })}`;
  signal?.throwIfAborted();
  const cached = searchCache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;
  let data: SearchResult;
  try { data = await request<SearchResult>(url, signal); }
  catch (error) { if (error instanceof ApiError && error.status === 404) data = { data: [], total_cards: 0, has_more: false }; else throw error; }
  if (searchCache.size >= 100) searchCache.delete(searchCache.keys().next().value!);
  searchCache.set(url, { at: Date.now(), data });
  return data;
}
let setCache: Promise<ScryfallSet[]> | undefined, setsAt = 0;
export function loadSets(): Promise<ScryfallSet[]> {
  if (Date.now() - setsAt >= CACHE_TTL) setCache = undefined;
  if (!setCache) setsAt = Date.now();
  return setCache ??= request<{ data: ScryfallSet[] }>('https://api.scryfall.com/sets').then(list => list.data.sort((a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? ''))).catch(error => { setCache = undefined; throw error; });
}
export function cardInfo(card: ScryfallCard): CardInfo {
  const rawPrice = card.prices?.usd ?? card.prices?.usd_foil;
  const price = rawPrice != null ? Number(rawPrice) : null;
  return { legalities: Object.fromEntries(Object.keys(OFFICIAL_FORMAT_NAMES).filter(key => card.legalities?.[key]).map(key => [key, card.legalities![key]])) as CardInfo['legalities'], isGameCard: isGameCard(card), isUnCard: isUnCard(card), ...(validReleaseDate(card.released_at) ? { releasedAt: card.released_at } : {}), ...(card.set_name ? { setName: card.set_name } : {}), ...(card.legalities?.vintage ? { vintageLegality: card.legalities.vintage } : {}), ...(card.legalities?.modern ? { modernLegality: card.legalities.modern } : {}), scryfallId: card.id, oracleId: card.oracle_id, set: card.set, collectorNumber: card.collector_number,
    image: card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal,
    backImage: card.card_faces?.[1]?.image_uris?.normal, typeLine: card.type_line,
    oracleText: card.oracle_text ?? card.card_faces?.map(f => f.oracle_text ?? '').join('\n') ?? '',
    manaCost: card.mana_cost ?? card.card_faces?.map(f => f.mana_cost ?? '').join(' // ') ?? '', colorIdentity: card.color_identity,
    manaValue: card.cmc ?? null, colors: card.colors ?? [...new Set(card.card_faces?.flatMap(f => f.colors ?? []) ?? [])], rarity: card.rarity ?? 'unknown', priceUSD: price !== null && Number.isFinite(price) ? price : null, checkedAt: new Date().toISOString() };
}
const printingCache = new Map<string, { at: number; promise: Promise<{ printSets: string[]; printRarities: string[]; printReleases?: { set: string; date: string }[] }> }>();
async function printingSets(card: ScryfallCard, signal?: AbortSignal): Promise<{ printSets: string[]; printRarities: string[]; printReleases?: { set: string; date: string }[] }> {
  const key = card.oracle_id ?? normalizeName(card.name);
  const cached = printingCache.get(key);
  let promise = cached && Date.now() - cached.at < CACHE_TTL ? cached.promise : undefined;
  if (!promise) {
    promise = (async () => {
      const query = card.oracle_id ? `oracleid:${card.oracle_id}` : `!${quote(card.name)}`;
      let next: string | undefined = `https://api.scryfall.com/cards/search?${new URLSearchParams({ q: query, unique: 'prints', include_extras: 'true' })}`;
      let completeReleases = true;
      const sets = new Set<string>(), rarities = new Set<string>(), releases = new Map<string, { set: string; date: string }>();
      while (next) {
        const page: SearchResult = await request<SearchResult>(next, signal);
        for (const print of page.data) { if (validReleaseDate(print.released_at)) releases.set(`${print.set}:${print.released_at}`, { set: print.set, date: print.released_at }); else completeReleases = false; sets.add(print.set); if (RARITIES.includes(print.rarity as Rarity)) rarities.add(print.rarity!); }
        next = page.has_more ? page.next_page : undefined;
      }
      return { printSets: [...sets], printRarities: [...rarities], ...(completeReleases ? { printReleases: [...releases.values()] } : {}) };
    })().catch(error => { if (!signal) printingCache.delete(key); throw error; });
    if (printingCache.size >= 500) printingCache.delete(printingCache.keys().next().value!);
    // Abortable consumers share completed results, not another consumer's signal.
    if (!signal) printingCache.set(key, { at: Date.now(), promise });
  }
  const result = await promise; signal?.throwIfAborted();
  if (signal) printingCache.set(key, { at: Date.now(), promise: Promise.resolve(result) });
  return result;
}
async function resolveCardFallback(entry: CardEntry, needsSets: boolean, signal?: AbortSignal, eligibilityFormat?: Format): Promise<CardInfo> {
  signal?.throwIfAborted();
  let card: ScryfallCard;
  if (entry.info?.scryfallId) card = await request<ScryfallCard>(`https://api.scryfall.com/cards/${encodeURIComponent(entry.info.scryfallId)}`, signal);
  else {
    // Imported printing preferences are honored when that printing matches the card.
    let preferred: ScryfallCard | undefined;
    if (entry.info?.set && entry.info.collectorNumber) {
      try { preferred = await request<ScryfallCard>(`https://api.scryfall.com/cards/${encodeURIComponent(entry.info.set)}/${encodeURIComponent(entry.info.collectorNumber)}`, signal); }
      catch (e) { if (!(e instanceof ApiError && e.status === 404)) throw e; }
    }
    card = preferred && (normalizeName(preferred.name) === normalizeName(entry.name) || preferred.card_faces?.some(f => normalizeName(f.name) === normalizeName(entry.name)))
      ? preferred : await request<ScryfallCard>(`https://api.scryfall.com/cards/named?${new URLSearchParams({ exact: entry.name })}`, signal);
  }
  signal?.throwIfAborted();
  const info = cardInfo(card);
  const needsHistory = needsSets && (!eligibilityFormat || setLegality({ ...entry, info }, eligibilityFormat) === 'unknown' || !eligibilityFormat.whitelistOnly && !!eligibilityFormat.bannedRarities?.length);
  return needsHistory ? { ...info, ...await printingSets(card, signal), setsComplete: true, checkedAt: new Date().toISOString() } : info;
}

type CollectionIdentifier = { id: string } | { set: string; collector_number: string } | { name: string };
const COLLECTION_URL = 'https://api.scryfall.com/cards/collection';
function collectionIdentifier(entry: CardEntry): CollectionIdentifier {
  if (entry.info?.scryfallId) return { id: entry.info.scryfallId };
  if (entry.info?.set && entry.info.collectorNumber) return { set: entry.info.set, collector_number: entry.info.collectorNumber };
  return { name: entry.name };
}
function identifierCacheUrl(identifier: CollectionIdentifier): string {
  if ('id' in identifier) return `https://api.scryfall.com/cards/${encodeURIComponent(identifier.id)}`;
  if ('set' in identifier) return `https://api.scryfall.com/cards/${encodeURIComponent(identifier.set)}/${encodeURIComponent(identifier.collector_number)}`;
  return `https://api.scryfall.com/cards/named?${new URLSearchParams({ exact: identifier.name })}`;
}
function cardMatchesIdentifier(card: ScryfallCard, identifier: CollectionIdentifier): boolean {
  if ('id' in identifier) return card.id === identifier.id;
  if ('set' in identifier) return card.set.toLowerCase() === identifier.set.toLowerCase() && card.collector_number === identifier.collector_number;
  const expected = normalizeName(identifier.name);
  return [card.name, ...card.card_faces?.map(face => face.name) ?? []].some(name => normalizeName(name) === expected);
}
async function enrichResolvedCard(entry: CardEntry, card: ScryfallCard, needsSets: boolean, signal?: AbortSignal, eligibilityFormat?: Format): Promise<CardInfo> {
  signal?.throwIfAborted();
  const info = cardInfo(card);
  const needsHistory = needsSets && (!eligibilityFormat || setLegality({ ...entry, info }, eligibilityFormat) === 'unknown' || !eligibilityFormat.whitelistOnly && !!eligibilityFormat.bannedRarities?.length);
  return needsHistory ? { ...info, ...await printingSets(card, signal), setsComplete: true, checkedAt: new Date().toISOString() } : info;
}

/** Resolve a deck with Scryfall's collection endpoint (75 identifiers per request). */
export async function resolveCards(entries: CardEntry[], needsSets: boolean, signal?: AbortSignal, eligibilityFormat?: Format): Promise<Map<string, CardInfo>> {
  const resolved = new Map<string, CardInfo>();
  const identifiers = new Map<string, { identifier: CollectionIdentifier; entries: CardEntry[] }>();
  for (const entry of entries) {
    const identifier = collectionIdentifier(entry), key = JSON.stringify(identifier);
    const group = identifiers.get(key) ?? { identifier, entries: [] };
    group.entries.push(entry); identifiers.set(key, group);
  }
  const unique = [...identifiers.values()], missing: typeof unique = [];
  for (const item of unique) {
    signal?.throwIfAborted();
    let cached: ScryfallCard | undefined;
    try { cached = await scryfallClient.cachedRequest<ScryfallCard>(identifierCacheUrl(item.identifier)); }
    catch (error) { if (!(error instanceof ApiError && error.status === 404)) throw error; }
    if (!cached || !cardMatchesIdentifier(cached, item.identifier)) { missing.push(item); continue; }
    const info = await enrichResolvedCard(item.entries[0], cached, needsSets, signal, eligibilityFormat);
    for (const entry of item.entries) resolved.set(entry.id, info);
  }
  for (let start = 0; start < missing.length; start += 75) {
    signal?.throwIfAborted();
    const batch = missing.slice(start, start + 75);
    const result = await scryfallClient.request<CollectionResult>(COLLECTION_URL, signal, {
      method: 'POST', body: JSON.stringify({ identifiers: batch.map(item => item.identifier) }),
    });
    const matched = new Set<string>();
    for (const item of batch) {
      const card = result.data.find(candidate => cardMatchesIdentifier(candidate, item.identifier));
      if (!card) continue;
      const info = await enrichResolvedCard(item.entries[0], card, needsSets, signal, eligibilityFormat);
      for (const entry of item.entries) resolved.set(entry.id, info);
      matched.add(JSON.stringify(item.identifier));
    }
    // Keep uncommon import / stale-printing fallbacks working without making
    // every normal card name its own request.
    for (const item of batch) if (!matched.has(JSON.stringify(item.identifier))) {
      for (const entry of item.entries) resolved.set(entry.id, await resolveCardFallback(entry, needsSets, signal, eligibilityFormat));
    }
  }
  return resolved;
}

export async function resolveCard(entry: CardEntry, needsSets: boolean, signal?: AbortSignal, eligibilityFormat?: Format): Promise<CardInfo> {
  const result = await resolveCards([entry], needsSets, signal, eligibilityFormat);
  const info = result.get(entry.id);
  if (!info) throw new Error(`Could not resolve ${entry.name}.`);
  return info;
}

const editionsCache = new Map<string, { at: number; promise: Promise<ScryfallCard[]> }>();
export function loadPrintings(name: string, oracleId?: string): Promise<ScryfallCard[]> {
  const key = oracleId ?? normalizeName(name);
  const cached = editionsCache.get(key);
  let result = cached && Date.now() - cached.at < CACHE_TTL ? cached.promise : undefined;
  if (!result) {
    result = (async () => {
      let next: string | undefined = `https://api.scryfall.com/cards/search?${new URLSearchParams({ q: oracleId ? `oracleid:${oracleId}` : `!${quote(name)}`, unique: 'prints', order: 'released', dir: 'desc', include_extras: 'true' })}`;
      const cards: ScryfallCard[] = [];
      while (next) { const page: SearchResult = await request(next); cards.push(...page.data); next = page.has_more ? page.next_page : undefined; }
      return cards;
    })().catch(error => { editionsCache.delete(key); throw error; });
    if (editionsCache.size >= 500) editionsCache.delete(editionsCache.keys().next().value!);
    editionsCache.set(key, { at: Date.now(), promise: result });
  }
  return result;
}
const oracleCache = new Map<string, { at: number; promise: Promise<CardInfo> }>();
const oracleQueue = new Map<string, { name: string; resolve: (info: CardInfo) => void; reject: (error: unknown) => void }>();
let oracleFlushTimer: ReturnType<typeof setTimeout> | undefined, oracleFlushing = false;
async function flushOracleQueue() {
  if (oracleFlushing) return;
  oracleFlushTimer = undefined;
  oracleFlushing = true;
  const batch = [...oracleQueue.entries()].slice(0, 75);
  for (const [key] of batch) oracleQueue.delete(key);
  try {
    const entries: CardEntry[] = batch.map(([key, item]) => ({ id: `oracle:${key}`, name: item.name, quantity: 1, zone: 'main' }));
    const cards = await resolveCards(entries, false);
    for (const [key, item] of batch) {
      const info = cards.get(`oracle:${key}`);
      if (info) item.resolve(info); else item.reject(new Error(`Could not resolve ${item.name}.`));
    }
  } catch (error) { for (const [, item] of batch) item.reject(error); }
  finally {
    oracleFlushing = false;
    if (oracleQueue.size && !oracleFlushTimer) oracleFlushTimer = setTimeout(() => { void flushOracleQueue(); }, 25);
  }
}
export function latestOracle(name: string): Promise<CardInfo> {
  const key = normalizeName(name), cached = oracleCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.promise;
  const promise = new Promise<CardInfo>((resolve, reject) => {
    oracleQueue.set(key, { name, resolve, reject });
    if (!oracleFlushTimer && !oracleFlushing) oracleFlushTimer = setTimeout(() => { void flushOracleQueue(); }, 25);
  }).catch(error => { oracleCache.delete(key); throw error; });
  oracleCache.set(key, { at: Date.now(), promise }); return promise;
}

export function filterFormatCards(cards: ScryfallCard[], format?: Format, target?: string): ScryfallCard[] {
  const banned = new Set(format?.banned.map(normalizeName) ?? []);
  const allowed = format?.whitelistOnly ? new Set((format.allowedCards ?? []).map(normalizeName)) : undefined;
  return cards.filter(card => {
    const names = [card.name, ...card.card_faces?.map(f => f.name) ?? []].map(normalizeName);
    if (format && card.released_at && !inReleaseRange(card.released_at, format)) return false;
    if (names.some(name => banned.has(name)) || allowed && !names.some(name => allowed.has(name))) return false;
    if (format?.officialFormat && !format.whitelistOnly && !(format.officialFormat === 'paupercommander' && target === 'commander') && card.legalities?.[format.officialFormat] && !['legal', 'restricted'].includes(card.legalities[format.officialFormat])) return false;
    if (format?.gameplayOnly && !isGameCard(card)) return false;
    if (format && tournamentOnly(format) && card.legalities?.vintage && !['legal', 'restricted'].includes(card.legalities.vintage) && !(format.allowUnCards && isUnCard(card))) return false;
    return true;
  });
}

export function legalPoolQuery(query: string, names: string[]): string {
  // Positive fielded name terms are only candidates; exact membership is checked
  // locally, so names like Opt never admit Optical Optimizer.
  return `${query} (${names.map(name => `name:${quote(name.split(' // ')[0])}`).join(' or ')})`;
}
export function legalPoolBatches(query: string, names: string[]): string[][] {
  const batches: string[][] = []; let batch: string[] = [];
  const fits = (names: string[]) => names.length <= 40 && new TextEncoder().encode(legalPoolQuery(query, names)).length <= 700;
  for (const name of names) {
    if (batch.length && !fits([...batch, name])) { batches.push(batch); batch = []; }
    if (!fits([name])) throw new Error('This legal-list search is too long. Shorten the advanced query.');
    batch.push(name);
  }
  if (batch.length) batches.push(batch);
  return batches;
}
const legalPoolCache = new Map<string, { at: number; cards: ScryfallCard[] }>();
export async function searchLegalPool(query: string, format: Format, order = 'name', signal?: AbortSignal, next?: string, options: SearchOptions = {}, onquery?: (query: string) => void): Promise<SearchResult> {
  const names = [...new Set(format.allowedCards ?? [])];
  if (!names.length) return { data: [], total_cards: 0, has_more: false };
  const batches = legalPoolBatches(query, names);
  onquery?.(legalPoolQuery(query, batches[0]));
  const key = JSON.stringify([query, names, format, order, options]);
  let cached = legalPoolCache.get(key);
  if (!cached || Date.now() - cached.at >= CACHE_TTL) {
    const found = new Map<string, ScryfallCard>();
    for (const batch of batches) {
      signal?.throwIfAborted();
      const candidateQuery = legalPoolQuery(query, batch); onquery?.(candidateQuery);
      let page: SearchResult = await searchCards(candidateQuery, order, signal, undefined, options);
      while (true) {
        for (const card of filterFormatCards(page.data, format)) found.set(card.id, card);
        if (!page.has_more || !page.next_page) break;
        page = await searchCards(candidateQuery, order, signal, page.next_page, options);
      }
    }
    const numeric = (value: unknown) => value == null || value === '' || !Number.isFinite(Number(value)) ? Infinity : Number(value);
    const sortValue = (card: ScryfallCard): string | number => {
      switch (order) {
        case 'cmc': return numeric(card.cmc);
        case 'usd': return numeric(card.prices?.usd);
        case 'power': return numeric(card.power);
        case 'toughness': return numeric(card.toughness);
        case 'edhrec': return numeric(card.edhrec_rank);
        case 'released': return card.released_at ?? '';
        case 'rarity': return RARITIES.indexOf(card.rarity as Rarity);
        case 'color': return `${card.colors?.length ?? 0}:${card.colors?.join('') ?? ''}`;
        case 'artist': return card.artist ?? '';
        case 'set': return card.set;
        default: return card.name;
      }
    };
    const descending = options.direction === 'desc' || options.direction !== 'asc' && ['released', 'usd', 'rarity', 'power', 'toughness'].includes(order);
    const cards = [...found.values()].sort((a, b) => { const av = sortValue(a), bv = sortValue(b); if (av === Infinity || bv === Infinity) return av === bv ? a.name.localeCompare(b.name) : av === Infinity ? 1 : -1; const diff = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv)); return (descending ? -diff : diff) || a.name.localeCompare(b.name); });
    cached = { at: Date.now(), cards }; if (legalPoolCache.size >= 10) legalPoolCache.delete(legalPoolCache.keys().next().value!); legalPoolCache.set(key, cached);
  }
  signal?.throwIfAborted();
  const offset = next && /^legal-page:\d+$/.test(next) ? Number(next.slice(11)) : 0;
  const hasMore = offset + 150 < cached.cards.length;
  return { data: cached.cards.slice(offset, offset + 150), total_cards: cached.cards.length, has_more: hasMore, next_page: hasMore ? `legal-page:${offset + 150}` : undefined };
}
