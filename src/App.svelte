<script lang="ts">
  import LibraryTransfer from './components/LibraryTransfer.svelte';
  import { parseBackupText } from './lib/transfer';
  import DeckEditor from './components/DeckEditor.svelte';
  import FormatEditor from './components/FormatEditor.svelte';
  import { blankFormat, deckSize, sideboardSize, createLibrary, formatText, parseFormatText, normalizeName } from './lib/model';
  import { addDefaultFormats } from './lib/default-formats';
  import type { Deck, Format } from './lib/model';
  import { download, loadLibrary, saveLibrary } from './lib/storage';

  const loaded = loadLibrary();
  let library = $state(loaded.library);
  let writable = $state(loaded.writable);
  let storageError = $state(loaded.error);
  let recovery = $state(loaded.recovery);
  let notice = $state('');
  let transferOpen = $state(false);
  let page = $state<'decks' | 'formats'>('decks');
  let selectedId = $state<string | null>(null);
  let editing = $state<Format | null>(null);
  let search = $state('');
  let filter = $state(''), tagFilter = $state(''), deckSort = $state('updated');
  const deckTags = $derived([...new Set(library.decks.flatMap(d => d.tags ?? []))].sort());
  let creating = $state(false);
  let deckName = $state('');
  let newFormatId = $state(loaded.library.formats[0]?.id ?? '');
  const selected = $derived(library.decks.find(d => d.id === selectedId));
  const visibleDecks = $derived(library.decks.filter(d => d.name.toLowerCase().includes(search.toLowerCase()) && (!filter || d.formatId === filter) && (!tagFilter || d.tags?.includes(tagFilter))).sort((a, b) => deckSort === 'name' ? a.name.localeCompare(b.name) : deckSort === 'tag' ? (a.tags?.[0] ?? '').localeCompare(b.tags?.[0] ?? '') || a.name.localeCompare(b.name) : deckSort === 'format' ? (library.formats.find(f => f.id === a.formatId)?.name ?? '').localeCompare(library.formats.find(f => f.id === b.formatId)?.name ?? '') || a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt)));

  $effect(() => {
    const snapshot = JSON.stringify(library);
    if (writable) storageError = saveLibrary(JSON.parse(snapshot));
  });

  function navigate(next: 'decks' | 'formats') { page = next; selectedId = null; editing = null; creating = false; notice = ''; }
  function newFormat() {
    editing = blankFormat();
  }
  function saveFormat(format: Format) {
    if (library.formats.some(f => f.id === format.id)) library.formats = library.formats.map(f => f.id === format.id ? format : f);
    else library.formats = [...library.formats, format];
    editing = null; notice = 'Format saved.';
  }
  function deleteFormat(format: Format) {
    if (library.decks.some(d => d.formatId === format.id)) { notice = 'Change or delete the decks using this format before deleting it.'; return; }
    if (confirm(`Delete the format "${format.name}"?`)) library.formats = library.formats.filter(f => f.id !== format.id);
  }
  function duplicateFormat(format: Format) {
    const copy = { ...format, id: crypto.randomUUID(), name: `${format.name.slice(0, 193)} (copy)`, allowedSets: [...format.allowedSets], banned: [...format.banned] };
    library.formats = [...library.formats, copy]; notice = 'Format duplicated.';
  }
  function exportFormat(format: Format) { download(formatText(format), `${format.name.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'format'}.format.json`); }
  async function importFormat(event: Event) {
    const input = event.currentTarget as HTMLInputElement, file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose a format file smaller than 1 MB.');
      const formats = parseFormatText(await file.text()).map(f => ({ ...f, id: crypto.randomUUID() }));
      library.formats = [...library.formats, ...formats]; notice = 'Format imported.';
    } catch (e) { notice = e instanceof Error ? e.message : 'Could not import the format.'; }
    finally { input.value = ''; }
  }
  function startDeck() { newFormatId = library.formats[0]?.id ?? ''; deckName = ''; creating = true; }
  function createDeck(event: SubmitEvent) {
    event.preventDefault();
    if (!deckName.trim() || !library.formats.some(f => f.id === newFormatId)) return;
    const deck: Deck = { id: crypto.randomUUID(), name: deckName.trim(), formatId: newFormatId, notes: '', cards: [], updatedAt: new Date().toISOString() };
    library.decks = [...library.decks, deck]; selectedId = deck.id; creating = false;
  }
  function updateDeck(deck: Deck) { library.decks = library.decks.map(d => d.id === deck.id ? deck : d); }
  function deleteDeck(deck: Deck) {
    if (!confirm(`Delete "${deck.name}" and its card list?`)) return;
    library.decks = library.decks.filter(d => d.id !== deck.id); selectedId = null; notice = 'Deck deleted.';
  }
  function duplicate(deck: Deck) {
    const copy = { ...deck, id: crypto.randomUUID(), name: `${deck.name.slice(0, 193)} (copy)`, cards: deck.cards.map(c => ({ ...c, id: crypto.randomUUID() })), updatedAt: new Date().toISOString() };
    library.decks = [...library.decks, copy]; selectedId = copy.id;
  }
  function restoreBackup(raw: string, filename: string): boolean {
    const imported = parseBackupText(raw);
    if (!confirm(`Replace this library with ${imported.decks.length} decks and ${imported.formats.length} formats from "${filename}"? Export a full backup first if you want to keep your current library.`)) return false;
    library = addDefaultFormats(imported); writable = true; recovery = ''; selectedId = null; editing = null; creating = false; filter = ''; tagFilter = ''; search = ''; notice = 'Full backup restored.';
    return true;
  }
  function resetStorage() {
    if (!confirm('Replace the unreadable saved data with a fresh library? Download the stored data first to keep a copy.')) return;
    library = createLibrary(); writable = true; recovery = ''; selectedId = null; editing = null; creating = false; filter = ''; search = '';
  }
</script>

<div class="app-shell">
  <header class="app-header">
    <nav aria-label="Main navigation"><button class:active={page === 'decks'} onclick={() => navigate('decks')}>Decks <span>{library.decks.length}</span></button><button class:active={page === 'formats'} onclick={() => navigate('formats')}>Formats <span>{library.formats.length}</span></button></nav>
    <div class="header-actions"><span class="save-status" class:storage-failed={!!storageError}>{storageError ? 'Storage error' : 'Saved locally'}</span><button class="secondary library-transfer-button" onclick={() => transferOpen = true}>Import / export</button></div>
  </header>
  <main class:builder-main={!!selected}>
    {#if storageError}<div class="alert" role="alert"><p>{storageError}</p>{#if recovery}<div class="alert-actions"><button class="secondary" onclick={() => download(recovery, 'format-forge-recovery.json')}>Download stored data</button><button class="quiet" onclick={resetStorage}>Start fresh</button></div>{/if}</div>{/if}
    {#if notice}<div class="notice" role="status">{notice}<button class="icon-button" onclick={() => notice = ''} aria-label="Dismiss message">×</button></div>{/if}
    {#if selected}
      <h1 class="sr-only">{selected.name}</h1>
      {#key selected.id}<DeckEditor deck={selected} formats={library.formats} preferredPrintings={library.preferredPrintings ?? {}} onpreferred={(name, info) => { const preferences = { ...library.preferredPrintings }; if (info) preferences[normalizeName(name)] = info; else delete preferences[normalizeName(name)]; library.preferredPrintings = preferences; }} onchange={updateDeck} onback={() => selectedId = null} onduplicate={() => { if (selected) duplicate(selected); }} ondelete={() => { if (selected) deleteDeck(selected); }} />{/key}
    {:else if page === 'decks'}
      <div class="page-heading"><h1>Decks</h1><button class="primary" onclick={startDeck} disabled={!library.formats.length}>+ New deck</button></div>
      {#if creating}<section class="panel create-deck"><form onsubmit={createDeck}><label>Deck name<input bind:value={deckName} required maxlength="200" /></label><label>Format<select bind:value={newFormatId}>{#each library.formats as f}<option value={f.id}>{f.name}</option>{/each}</select></label><button class="primary" type="submit">Create deck</button><button class="quiet" type="button" onclick={() => creating = false}>Cancel</button></form></section>{/if}
      <div class="library-toolbar"><label class="sr-only" for="deck-search">Search decks</label><input id="deck-search" type="search" bind:value={search} placeholder="Search decks" /><label class="sr-only" for="format-filter">Filter by format</label><select id="format-filter" bind:value={filter}><option value="">All formats</option>{#each library.formats as f}<option value={f.id}>{f.name}</option>{/each}</select><select aria-label="Filter decks by tag" bind:value={tagFilter}><option value="">All tags</option>{#each deckTags as tag}<option>{tag}</option>{/each}</select><select aria-label="Sort decks" bind:value={deckSort}><option value="updated">Recently updated</option><option value="name">Name</option><option value="format">Format</option><option value="tag">Tag</option></select></div>
      {#if library.decks.length === 0}<section class="empty-state"><p>No decks yet.</p>{#if !library.formats.length}<button class="primary" onclick={() => { navigate('formats'); newFormat(); }}>Create a format</button>{/if}</section>
      {:else if visibleDecks.length === 0}<section class="empty-state"><p>No matching decks.</p><button class="secondary" onclick={() => { search = ''; filter = ''; tagFilter = ''; }}>Clear filters</button></section>
      {:else}<div class="deck-grid">{#each visibleDecks as deck (deck.id)}{@const format = library.formats.find(f => f.id === deck.formatId)!}<article class="deck-card"><button class="deck-open" onclick={() => selectedId = deck.id}><h2>{deck.name}</h2>{#if deck.tags?.length}<span>{deck.tags.join(' · ')}</span>{/if}<span>{format.name}</span><span>{deckSize(deck)} deck · {sideboardSize(deck, format)} sideboard</span></button><div class="deck-card-footer"><button class="quiet" onclick={() => duplicate(deck)} aria-label={`Duplicate ${deck.name}`}>Duplicate</button><button class="quiet danger" onclick={() => deleteDeck(deck)} aria-label={`Delete ${deck.name}`}>Delete</button></div></article>{/each}</div>{/if}
    {:else}
      <div class="page-heading"><h1>Formats</h1><div class="format-page-actions"><label class="file-button secondary">Import format<input type="file" accept=".json,application/json" onchange={importFormat} /></label><button class="primary" onclick={newFormat}>+ New format</button></div></div>
      {#if editing}{#key editing.id}<FormatEditor format={editing} onsave={saveFormat} oncancel={() => editing = null} />{/key}
      {:else}<div class="format-grid">{#each library.formats as format (format.id)}{@const used = library.decks.filter(d => d.formatId === format.id).length}<article class="panel format-card"><div class="section-heading"><h2>{format.name}</h2><span class="muted">{used} {used === 1 ? 'deck' : 'decks'}</span></div>{#if format.description}<p class="format-description">{format.description}</p>{/if}<dl class="rule-summary"><div><dt>Deck size</dt><dd>{format.minCards}–{format.maxCards ?? '∞'}</dd></div><div><dt>Sideboard</dt><dd>{format.minSideboard}–{format.maxSideboard ?? '∞'}</dd></div><div><dt>Copies</dt><dd>{format.copyLimit}{format.basicLandExemption ? ' · basics exempt' : ''}</dd></div><div><dt>Sets</dt><dd>{format.whitelistOnly ? `${format.allowedCards?.length ?? 0} legal cards` : format.allowedSets.length ? `${format.allowedSets.length} sets` : 'All sets'}</dd></div><div><dt>Banned cards</dt><dd>{format.banned.length}</dd></div>{#if format.commanderRules}<div><dt>Commander rules</dt><dd>Enabled</dd></div>{/if}</dl><div class="format-card-actions"><button class="secondary" onclick={() => editing = format}>Edit</button><button class="quiet" onclick={() => duplicateFormat(format)}>Duplicate</button><button class="quiet" onclick={() => exportFormat(format)}>Export</button><button class="quiet danger" disabled={used > 0} title={used > 0 ? 'Move or delete linked decks first' : 'Delete this format'} onclick={() => deleteFormat(format)}>Delete</button></div></article>{/each}</div>{#if !library.formats.length}<section class="empty-state"><p>No formats yet.</p></section>{/if}{/if}
    {/if}
  </main>
</div>

{#if transferOpen}<LibraryTransfer {library} onclose={() => transferOpen = false} onbackup={restoreBackup} onimport={(next, message) => { library = next; notice = message; }} />{/if}
