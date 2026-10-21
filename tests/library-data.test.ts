import assert from 'node:assert/strict';
import test from 'node:test';
import { compactLibraryData } from '../src/lib/library-data.ts';
import { addDefaultFormats } from '../src/lib/default-formats.ts';
import { parseLibraryWithDefaults } from '../src/lib/library-restore.ts';
import { createLibrary, blankFormat } from '../src/lib/model.ts';

test('compact library data omits built-in formats and redundant metadata', () => {
  const library = createLibrary();
  library.formats.push({ ...blankFormat(), id: 'custom', name: 'Custom' });
  const compact = compactLibraryData(library);

  assert.deepEqual(compact.formats.map(format => format.id), ['custom']);
  assert.equal('defaultsVersion' in compact, false);
  assert.equal(compactLibraryData(library, true).defaultsVersion, library.defaultsVersion);
  assert.equal('preferredPrintings' in compact, false);
  assert.deepEqual(compact.decks, []);
  assert.equal(addDefaultFormats(compact).formats.some(format => format.id === 'commander'), true);
});

test('compact library data retains user formats, decks, and preferences', () => {
  const library = createLibrary();
  const deck = { id: 'deck', name: 'Test', formatId: 'no-format', notes: '', cards: [], updatedAt: '2026-01-01T00:00:00.000Z' };
  const preferredView = { sort: 'name' as const, group: 'none' as const, direction: 'desc' as const };
  library.decks.push(deck);
  library.preferredView = preferredView;
  library.preferredPrintings = { 'example card': { scryfallId: 'id', set: 'abc', collectorNumber: '1', typeLine: 'Creature', oracleText: '', colorIdentity: [], manaCost: '' } };
  library.accentColor = 'blue';
  const compact = compactLibraryData(library);

  assert.deepEqual(compact.decks, [deck]);
  assert.equal(compact.preferredView, preferredView);
  assert.equal(compact.preferredPrintings, library.preferredPrintings);
  assert.equal(compact.accentColor, 'blue');
  assert.equal('accentColor' in compactLibraryData({ ...library, accentColor: 'green' }), false);
});

test('restoring compact data re-adds referenced built-in formats before validation', () => {
  const library = createLibrary();
  library.decks.push({ id: 'deck', name: 'Test', formatId: 'no-format', notes: '', cards: [], updatedAt: '2026-01-01T00:00:00.000Z' });
  const compact = compactLibraryData(library);
  assert.deepEqual(compact.formats, []);
  const restored = parseLibraryWithDefaults(JSON.stringify(compact));
  assert.equal(restored.formats.some(format => format.id === 'no-format'), true);
  assert.equal(restored.decks[0].formatId, 'no-format');
});
