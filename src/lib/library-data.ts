import { DEFAULT_FORMAT_IDS } from './default-format-ids.ts';
import type { Library } from './model';

const builtInIds = new Set(DEFAULT_FORMAT_IDS);

/** Keep serialized libraries limited to user-owned data; built-in formats are restored by the client. */
export function compactLibraryData(library: Library, preserveDefaultsVersion = false): Library {
  const formats = library.formats.filter(format => !builtInIds.has(format.id));
  const preferredView = library.preferredView;
  const preferredPrintings = library.preferredPrintings && Object.keys(library.preferredPrintings).length
    ? library.preferredPrintings
    : undefined;
  return {
    version: library.version,
    decks: library.decks,
    formats,
    ...(preserveDefaultsVersion && library.defaultsVersion !== undefined ? { defaultsVersion: library.defaultsVersion } : {}),
    ...(preferredView ? { preferredView } : {}),
    ...(preferredPrintings ? { preferredPrintings } : {}),
    ...(library.theme ? { theme: library.theme } : {}),
  };
}
