import { addDefaultFormats, builtInFormats, DEFAULT_FORMAT_IDS } from './default-formats.ts';
import { parseLibrary } from './model.ts';
import type { Library } from './model.ts';

const builtInIds = new Set(DEFAULT_FORMAT_IDS);

/** Reinsert app-owned formats before validation because saved decks reference their IDs. */
export function parseLibraryWithDefaults(raw: string): Library {
  const value: unknown = JSON.parse(raw);
  if (value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as { formats?: unknown }).formats)) {
    const saved = value as Record<string, unknown>;
    const customFormats = (saved.formats as unknown[]).filter(format => !format || typeof format !== 'object' || !builtInIds.has(String((format as { id?: unknown }).id)));
    const customIds = new Set(customFormats.flatMap(format => format && typeof format === 'object' && typeof (format as { id?: unknown }).id === 'string' ? [(format as { id: string }).id] : []));
    const formats = [...builtInFormats().filter(format => !customIds.has(format.id)), ...customFormats];
    return addDefaultFormats(parseLibrary(JSON.stringify({ ...saved, formats })));
  }
  return addDefaultFormats(parseLibrary(raw));
}
