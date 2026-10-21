import { parseLibrary, normalizeName } from './model.ts';
import type { CardEntry, Deck, Format, Library } from './model.ts';
import { DEFAULT_FORMAT_IDS } from './default-format-ids.ts';
import { compactLibraryData } from './library-data.ts';
import { parseLibraryWithDefaults } from './library-restore.ts';
import { builtInFormats } from './default-formats.ts';
const builtInFormatIds = new Set(DEFAULT_FORMAT_IDS);
export type TransferScope = 'decks' | 'formats' | 'both';
export interface PortableCard { id: string; name: string; quantity: number; zone: CardEntry['zone']; tags?: string[]; printing?: { scryfallId: string; set: string; collectorNumber: string } }
export interface PortableDeck { id: string; name: string; formatId: string; notes: string; updatedAt: string; tags?: string[]; cards: PortableCard[] }
export interface TransferFile { kind: 'format-forge-transfer'; version: 1; scope: TransferScope; decks: PortableDeck[]; formats: Format[]; formatRefs: { id: string; name: string }[] }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function portableDeck(deck: Deck): PortableDeck {
  return { id: deck.id, name: deck.name, formatId: deck.formatId, notes: deck.notes, updatedAt: deck.updatedAt,
    ...(deck.tags !== undefined ? { tags: [...deck.tags] } : {}), cards: deck.cards.map(card => ({ id: card.id, name: card.name, quantity: card.quantity, zone: card.zone,
      ...(card.tags !== undefined ? { tags: [...card.tags] } : {}), ...(card.info && (card.info.scryfallId || card.info.set && card.info.collectorNumber) ? { printing: { scryfallId: card.info.scryfallId, set: card.info.set, collectorNumber: card.info.collectorNumber } } : {}) })) };
}
export function createTransfer(library: Library, scope: TransferScope, deckIds: string[], formatIds: string[]): TransferFile {
  const decks = scope === 'formats' ? [] : library.decks.filter(deck => deckIds.includes(deck.id));
  const required = new Set(decks.map(deck => deck.formatId));
  const formats = scope === 'decks' ? [] : library.formats.filter(format => !builtInFormatIds.has(format.id) && (formatIds.includes(format.id) || scope === 'both' && required.has(format.id)));
  if (!decks.length && !formats.length) throw new Error('Select at least one deck or format to export.');
  return { kind: 'format-forge-transfer', version: 1, scope, decks: decks.map(portableDeck), formats: clone(formats), formatRefs: library.formats.filter(format => required.has(format.id) && !builtInFormatIds.has(format.id)).map(format => ({ id: format.id, name: format.name })) };
}
export function transferText(library: Library, scope: TransferScope, deckIds: string[], formatIds: string[]): string { return JSON.stringify(createTransfer(library, scope, deckIds, formatIds), null, 2); }
export function backupText(library: Library): string { return JSON.stringify({ kind: 'format-forge-backup', ...compactLibraryData(library) }, null, 2); }
export function parseBackupText(raw: string): Library {
  const value = JSON.parse(raw);
  if (value?.kind !== undefined && value.kind !== 'format-forge-backup') throw new Error('Choose an account backup file. Library exports use Import library.');
  return parseLibraryWithDefaults(raw);
}
function restoreDeck(deck: PortableDeck): Deck {
  return { id: deck.id, name: deck.name, formatId: deck.formatId, notes: deck.notes, updatedAt: deck.updatedAt,
    ...(deck.tags !== undefined ? { tags: deck.tags } : {}), cards: deck.cards.map(card => ({ id: card.id, name: card.name, quantity: card.quantity, zone: card.zone,
      ...(card.tags !== undefined ? { tags: card.tags } : {}), ...(card.printing ? { info: { ...card.printing, typeLine: '', oracleText: '', colorIdentity: [], manaCost: '' } } : {}) })) };
}
export function parseTransfer(raw: string): TransferFile {
  const value = JSON.parse(raw);
  if (value?.kind !== 'format-forge-transfer') {
    // Keep older standalone format files usable.
    if (value?.kind === undefined && value?.version === 1 && Array.isArray(value.formats) && Array.isArray(value.decks) && !value.decks.length && value.defaultsVersion === undefined && value.preferredPrintings === undefined && value.preferredView === undefined && value.theme === undefined) {
      const library = parseLibrary(raw), formats = library.formats.filter(format => !builtInFormatIds.has(format.id));
      if (!formats.length) throw new Error('Built-in formats are available in the app and cannot be imported as custom formats.');
      return { kind: 'format-forge-transfer', version: 1, scope: 'formats', decks: [], formats, formatRefs: [] };
    }
    throw new Error('Choose a deck or format export. Account backups use Restore account backup.');
  }
  const fail = (): never => { throw new Error('This is not a valid deck/format transfer file.'); };
  if (value.version !== 1 || !['decks', 'formats', 'both'].includes(value.scope) || !Array.isArray(value.decks) || !Array.isArray(value.formats) || !Array.isArray(value.formatRefs) || value.decks.length > 10000 || value.formatRefs.length > 1000 || value.preferredPrintings !== undefined || value.preferredView !== undefined || value.defaultsVersion !== undefined || value.theme !== undefined || value.accountPreferences !== undefined) return fail();
  if (value.scope === 'decks' && value.formats.length || value.scope === 'formats' && value.decks.length || !value.decks.length && !value.formats.length) return fail();
  const refs = new Map<string, string>();
  for (const ref of value.formatRefs) {
    if (!ref || typeof ref.id !== 'string' || !ref.id.trim() || ref.id.length > 200 || typeof ref.name !== 'string' || !ref.name.trim() || ref.name.length > 200 || refs.has(ref.id)) return fail();
    refs.set(ref.id, ref.name);
  }
  for (const id of builtInFormatIds) refs.delete(id);
  const parsedFormats = parseLibrary(JSON.stringify({ version: 1, formats: value.formats, decks: [] })).formats.filter(format => !builtInFormatIds.has(format.id));
  if (!value.decks.length && !parsedFormats.length) return fail();
  const formats = new Map(parsedFormats.map(format => [format.id, format]));
  for (const [id, name] of refs) if (formats.has(id) && formats.get(id)!.name !== name) return fail();
  for (const deck of value.decks) {
    if (!deck || typeof deck !== 'object' || (!refs.has(deck.formatId) && !builtInFormatIds.has(deck.formatId)) || !Array.isArray(deck.cards) || deck.views !== undefined || deck.layout !== undefined) return fail();
    for (const card of deck.cards) {
      if (!card || typeof card !== 'object' || card.info !== undefined) return fail();
      if (card.printing !== undefined && (!card.printing || typeof card.printing.scryfallId !== 'string' || card.printing.scryfallId.length > 200 || typeof card.printing.set !== 'string' || card.printing.set.length > 8 || typeof card.printing.collectorNumber !== 'string' || card.printing.collectorNumber.length > 200)) return fail();
    }
  }
  if (value.scope === 'both' && value.decks.some((deck: PortableDeck) => !formats.has(deck.formatId) && !builtInFormatIds.has(deck.formatId))) return fail();
  // Reuse the library validator for deck quantities, tags, sections and IDs.
  const deckFormatIds = new Set(value.decks.map((deck: PortableDeck) => deck.formatId));
  const validationFormats = [...builtInFormats().filter(format => deckFormatIds.has(format.id)), ...[...refs].map(([id, name]) => formats.get(id) ?? ({ id, name, description: '', minCards: 1, maxCards: null, minSideboard: 0, maxSideboard: null, copyLimit: 4, basicLandExemption: true, allowedSets: [], banned: [], commanderRules: false }))];
  const validated = parseLibrary(JSON.stringify({ version: 1, formats: validationFormats, decks: value.decks.map(restoreDeck) }));
  return { kind: 'format-forge-transfer', version: 1, scope: value.scope, formats: parsedFormats, decks: validated.decks.map(portableDeck), formatRefs: [...refs].map(([id, name]) => ({ id, name })) };
}
export interface ImportReference { key: string; name: string; suggestedId?: string }
export interface ImportPlan { newFormats: Format[]; targets: Record<string, string>; references: ImportReference[]; deckCount: number; reusedFormats: number }
const refKey = (index: number, id: string) => `${index}:${id}`;
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, stable(value)])) : value;
const sameFormat = (a: Format, b: Format) => normalizeName(a.name) === normalizeName(b.name) && JSON.stringify(stable({ ...a, id: '', name: '' })) === JSON.stringify(stable({ ...b, id: '', name: '' }));
export function planImport(library: Library, files: TransferFile[]): ImportPlan {
  const plan: ImportPlan = { newFormats: [], targets: {}, references: [], deckCount: files.reduce((count, file) => count + file.decks.length, 0), reusedFormats: 0 };
  for (const [index, file] of files.entries()) for (const format of file.formats) {
    const existing = [...library.formats, ...plan.newFormats].find(candidate => sameFormat(format, candidate));
    if (existing) { plan.targets[refKey(index, format.id)] = existing.id; plan.reusedFormats++; }
    else {
      const names = new Set([...library.formats, ...plan.newFormats].map(format => normalizeName(format.name)));
      let name = format.name, suffix = 1;
      while (names.has(normalizeName(name))) name = `${format.name.slice(0, 180)} (imported${suffix++ === 1 ? '' : ` ${suffix - 1}`})`;
      const copy = { ...clone(format), id: crypto.randomUUID(), name, tags: (format.tags ?? []).filter(tag => tag.toLocaleLowerCase() !== 'default') }; plan.newFormats.push(copy); plan.targets[refKey(index, format.id)] = copy.id;
    }
  }
  for (const [index, file] of files.entries()) for (const ref of file.formatRefs) {
    if (!file.decks.some(deck => deck.formatId === ref.id) || plan.targets[refKey(index, ref.id)]) continue;
    const crossFile = files.flatMap((other, otherIndex) => other.formats.filter(format => format.id === ref.id && normalizeName(format.name) === normalizeName(ref.name)).map(format => plan.targets[refKey(otherIndex, format.id)]));
    const candidates = [...library.formats, ...plan.newFormats].filter(format => normalizeName(format.name) === normalizeName(ref.name));
    const possible = [...new Set([...crossFile, ...candidates.map(format => format.id)])];
    plan.references.push({ key: refKey(index, ref.id), name: ref.name, suggestedId: possible.length === 1 ? possible[0] : undefined });
  }
  return plan;
}
export function applyImport(library: Library, files: TransferFile[], plan: ImportPlan, mappings: Record<string, string>): Library {
  const formats = [...library.formats, ...clone(plan.newFormats)];
  const ids = new Set(formats.map(format => format.id));
  if (ids.size !== formats.length || formats.length > 1000 || library.decks.length + plan.deckCount > 10000) throw new Error('The imported library would exceed supported limits or contain conflicting format IDs.');
  const decks = files.flatMap((file, index) => file.decks.map(portable => {
    const key = refKey(index, portable.formatId), formatId = plan.targets[key] ?? mappings[key] ?? (builtInFormatIds.has(portable.formatId) ? portable.formatId : undefined);
    if (!formatId || !ids.has(formatId)) throw new Error('Choose a format for every imported deck group.');
    const deck = restoreDeck(clone(portable));
    return { ...deck, id: crypto.randomUUID(), formatId, cards: deck.cards.map(card => ({ ...card, id: crypto.randomUUID() })) };
  }));
  return { ...library, formats, decks: [...library.decks, ...decks] };
}
