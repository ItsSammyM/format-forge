import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLibrary, addCard, formatText, parseLibrary } from '../src/lib/model.ts';
import type { CardInfo, Deck, Library } from '../src/lib/model.ts';
import { createTransfer, transferText, backupText, parseTransfer, parseBackupText, planImport, applyImport } from '../src/lib/transfer.ts';

const printing: CardInfo = { scryfallId: 'chosen-print', set: 'm11', collectorNumber: '146', typeLine: 'Instant', oracleText: 'Deal damage.', manaCost: '{R}', colorIdentity: ['R'] };
function source(): Library {
  const library = createLibrary();
  const empty: Deck = { id: 'original', name: 'Burn', formatId: library.formats[0].id, notes: 'A primer', tags: ['red'], cards: [], updatedAt: '2026-10-14T00:00:00Z', layout: { workspace: 70, hiddenZones: ['considering'] }, views: { main: { sort: 'name', group: 'type', direction: 'asc', display: 'compact' } } };
  let deck = addCard(empty, 'Lightning Bolt', 4, 'main', printing);
  deck = addCard(deck, 'Lightning Bolt', 1, 'side', { ...printing, scryfallId: 'side-print', set: 'lea' });
  deck = addCard(deck, 'Mountain', 2, 'considering');
  deck.cards[0].tags = ['damage']; library.decks.push(deck, { ...empty, id: 'other', name: 'Other', cards: [] });
  library.preferredPrintings = { 'lightning bolt': { ...printing, scryfallId: 'future-default', set: '2xm' } };
  return library;
}
const mappingsFor = (plan: ReturnType<typeof planImport>) => Object.fromEntries(plan.references.filter(ref => ref.suggestedId).map(ref => [ref.key, ref.suggestedId!]));

test('selected deck export retains per-zone printings and contents, without personal defaults or layout', () => {
  const library = source(); const file = parseTransfer(transferText(library, 'decks', ['original'], []));
  assert.equal(file.decks.length, 1); assert.equal(file.formats.length, 0);
  assert.deepEqual(file.formatRefs, [{ id: library.formats[0].id, name: library.formats[0].name }]);
  assert.equal(file.decks[0].cards[0].printing!.scryfallId, 'chosen-print');
  assert.equal(file.decks[0].cards[1].printing!.scryfallId, 'side-print');
  assert.equal(file.decks[0].cards[2].printing, undefined);
  assert.deepEqual(file.decks[0].cards[0].tags, ['damage']); assert.deepEqual(file.decks[0].tags, ['red']); assert.equal(file.decks[0].notes, 'A primer');
  const raw = transferText(library, 'decks', ['original'], []);
  assert.ok(!raw.includes('future-default')); assert.ok(!raw.includes('hiddenZones')); assert.ok(!raw.includes('views'));
});

test('combined export includes required formats and explicitly selected extra formats', () => {
  const library = source(); const file = parseTransfer(transferText(library, 'both', ['original'], [library.formats[2].id]));
  assert.deepEqual(file.formats.map(format => format.id), [library.formats[0].id, library.formats[2].id]);
  const formats = createTransfer(library, 'formats', ['original'], [library.formats[1].id]);
  assert.equal(formats.decks.length, 0); assert.equal(formats.formatRefs.length, 0); assert.equal(formats.formats.length, 1);
  assert.throws(() => createTransfer(library, 'decks', [], []), /Select at least one/);
});

test('bulk imports append decks with fresh IDs, preserving printings and destination preferences', () => {
  const destination = source(), snapshot = JSON.stringify(destination);
  const file = parseTransfer(transferText(destination, 'both', ['original', 'other'], []));
  const plan = planImport(destination, [file, file]); const result = applyImport(destination, [file, file], plan, {});
  assert.equal(result.decks.length, 6); assert.equal(result.formats.length, destination.formats.length);
  assert.equal(new Set(result.decks.map(deck => deck.id)).size, 6);
  const imported = result.decks[2]; assert.notEqual(imported.id, destination.decks[0].id);
  assert.notEqual(imported.cards[0].id, destination.decks[0].cards[0].id);
  assert.equal(imported.cards[0].info!.scryfallId, 'chosen-print'); assert.equal(imported.cards[1].info!.scryfallId, 'side-print');
  assert.equal(imported.views, undefined); assert.equal(imported.layout, undefined);
  assert.deepEqual(result.preferredPrintings, destination.preferredPrintings);
  assert.deepEqual(result.decks[0].layout, destination.decks[0].layout);
  assert.equal(JSON.stringify(destination), snapshot);
  assert.equal(parseLibrary(JSON.stringify(result)).decks.length, 6);
});

test('decks-only imports require a destination mapping and failure leaves the original intact', () => {
  const library = source(); const file = parseTransfer(transferText(library, 'decks', ['original'], []));
  const destination = createLibrary(); const plan = planImport(destination, [file]);
  assert.equal(plan.references.length, 1); assert.equal(plan.references[0].suggestedId, destination.formats[0].id);
  const snapshot = JSON.stringify(destination);
  assert.throws(() => applyImport(destination, [file], plan, {}), /Choose a format/);
  assert.throws(() => applyImport(destination, [file], plan, { [plan.references[0].key]: 'missing' }), /Choose a format/);
  assert.equal(JSON.stringify(destination), snapshot);
  const result = applyImport(destination, [file], plan, { [plan.references[0].key]: destination.formats[1].id });
  assert.equal(result.decks[0].formatId, destination.formats[1].id);
});

test('same-name formats with different rules are imported separately and decks follow them', () => {
  const library = source(); library.formats[0].copyLimit = 2;
  const file = parseTransfer(transferText(library, 'both', ['original'], []));
  const destination = createLibrary(); const plan = planImport(destination, [file]); const result = applyImport(destination, [file], plan, {});
  assert.equal(plan.newFormats.length, 1); assert.match(plan.newFormats[0].name, /\(imported\)/);
  assert.notEqual(plan.newFormats[0].id, library.formats[0].id);
  assert.equal(result.decks[0].formatId, plan.newFormats[0].id); assert.equal(destination.formats[0].copyLimit, null);
});

test('multiple files can supply decks and their formats separately', () => {
  const library = source(); library.formats[0] = { ...library.formats[0], id: 'custom', name: 'My rules' }; library.decks[0].formatId = 'custom';
  const files = [parseTransfer(transferText(library, 'decks', ['original'], [])), parseTransfer(transferText(library, 'formats', [], ['custom']))];
  const destination = createLibrary(), plan = planImport(destination, files);
  assert.equal(plan.references[0].suggestedId, plan.newFormats[0].id);
  const result = applyImport(destination, files, plan, mappingsFor(plan));
  assert.equal(result.decks[0].formatId, result.formats.at(-1)!.id);
});

test('full backups preserve future preferred printings and personal settings as well as chosen printings', () => {
  const library = source(); const restored = parseBackupText(backupText(library));
  assert.equal(restored.decks[0].cards[0].info!.scryfallId, 'chosen-print');
  assert.equal(restored.preferredPrintings!['lightning bolt'].scryfallId, 'future-default');
  assert.deepEqual(restored.decks[0].layout, library.decks[0].layout); assert.deepEqual(restored.decks[0].views, library.decks[0].views);
  assert.equal(parseBackupText(JSON.stringify(library)).decks.length, 2);
  assert.throws(() => parseTransfer(backupText(library)), /Restore backup/);
  assert.throws(() => parseBackupText(transferText(library, 'both', ['original'], [])), /full backup/);
});

test('portable import rejects invalid contents before any edits, and accepts legacy standalone formats', () => {
  const library = source(); const file = createTransfer(library, 'both', ['original'], []);
  const reject = (edit: (value: any) => void) => { const copy = structuredClone(file); edit(copy); assert.throws(() => parseTransfer(JSON.stringify(copy))); };
  reject(value => value.decks[0].cards[0].quantity = 0);
  reject(value => value.decks.push(value.decks[0]));
  reject(value => value.decks[0].cards[0].printing.set = 123);
  reject(value => value.decks[0].formatId = 'missing');
  reject(value => value.formats = []);
  reject(value => value.preferredPrintings = library.preferredPrintings);
  reject(value => value.decks[0].layout = { workspace: 70 });
  const legacy = parseTransfer(formatText(library.formats[0])); assert.equal(legacy.scope, 'formats'); assert.equal(legacy.formats.length, 1);
});
