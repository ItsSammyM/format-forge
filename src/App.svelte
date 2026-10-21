<script lang="ts">
  import { onMount } from 'svelte';
  import ScryfallStatus from './components/ScryfallStatus.svelte';
  import LibraryTransfer from './components/LibraryTransfer.svelte';
  import { parseBackupText } from './lib/transfer';
  import DeckEditor from './components/DeckEditor.svelte';
  import FormatEditor from './components/FormatEditor.svelte';
  import LibraryToolbar from './components/LibraryToolbar.svelte';
  import LibraryCard from './components/LibraryCard.svelte';
  import { blankFormat, deckSize, sideboardSize, createLibrary, formatText, deckText, parseDeckText, parseFormatText, normalizeName, validateDeck } from './lib/model';
  import { addDefaultFormats, isDefaultFormat } from './lib/default-formats';
  import type { BoardView, Deck, Format } from './lib/model';
  import { download, loadLibrary, saveLibrary } from './lib/storage';
  import { DEFAULT_VIEW } from './lib/deck-view';
  import { authConfigured, loadAccountLibrary, loginWithDiscord, logout, saveAccountLibrary, startAuth } from './lib/auth';
  import type { AuthSession } from './lib/auth';

  const THEME_KEY = 'format-forge.theme';
  function readTheme(): 'dark' | 'light' {
    try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  }
  const loaded = loadLibrary();
  let library = $state(loaded.library);
  let writable = $state(loaded.writable);
  let storageError = $state(loaded.error);
  let recovery = $state(loaded.recovery);
  let notice = $state('');
  let authSession = $state<AuthSession | null>(null);
  let authStatus = $state<'checking' | 'local' | 'cloud' | 'error'>('checking');
  let accountSaveState = $state<'saved' | 'saving'>('saved');
  let authError = $state('');
  let cloudSaveTimer: ReturnType<typeof setTimeout> | undefined;
  let cloudSaveQueue: Promise<void> = Promise.resolve();
  let theme = $state<'dark' | 'light'>(readTheme());
  let transferOpen = $state(false);
  let page = $state<'home' | 'decks' | 'formats'>('home');
  let selectedId = $state<string | null>(null);
  let editing = $state<Format | null>(null);
  let search = $state('');
  let filter = $state(''), tagFilter = $state(''), deckSort = $state('updated'), deckDirection = $state<'asc' | 'desc'>('desc');
  const deckTags = $derived([...new Set(library.decks.flatMap(d => d.tags ?? []))].sort());
  let formatSearch = $state(''), formatTagFilter = $state(''), formatSort = $state('updated'), formatDirection = $state<'asc' | 'desc'>('desc'), formatGroup = $state('default');
  const formatTags = $derived([...new Set(library.formats.flatMap(f => f.tags ?? []))].sort());
  let creating = $state(false);
  let deckName = $state('');
  let newFormatId = $state('no-format');
  let importingDeck = $state(false), deckImportName = $state(''), deckImportText = $state(''), deckImportFormatId = $state('no-format'), deckImportError = $state('');
  let deckGroup = $state('none');
  const selected = $derived(library.decks.find(d => d.id === selectedId));
  const primaryFormatTag = (format: Format) => (format.tags ?? []).filter(tag => tag.toLocaleLowerCase() !== 'default').sort((a, b) => a.localeCompare(b))[0] ?? ((format.tags ?? []).some(tag => tag.toLocaleLowerCase() === 'default') ? 'Default' : '');
  const visibleDecks = $derived(library.decks.filter(d => `${d.name} ${(d.tags ?? []).join(' ')}`.toLowerCase().includes(search.toLowerCase()) && (!filter || d.formatId === filter) && (!tagFilter || d.tags?.includes(tagFilter))).sort((a, b) => {
    const result = deckSort === 'name' ? a.name.localeCompare(b.name)
      : deckSort === 'tag' ? (a.tags?.[0] ?? '').localeCompare(b.tags?.[0] ?? '') || a.name.localeCompare(b.name)
      : deckSort === 'format' ? (library.formats.find(f => f.id === a.formatId)?.name ?? '').localeCompare(library.formats.find(f => f.id === b.formatId)?.name ?? '') || a.name.localeCompare(b.name)
      : a.updatedAt.localeCompare(b.updatedAt);
    return (deckDirection === 'asc' ? 1 : -1) * result;
  }));
  const deckGroups = $derived.by(() => {
    if (deckGroup === 'none') return [{ name: '', decks: visibleDecks }];
    const groups = new Map<string, Deck[]>();
    for (const deck of visibleDecks) {
      const name = deckGroup === 'format' ? library.formats.find(f => f.id === deck.formatId)?.name ?? 'No format' : deck.tags?.[0] ?? 'Untagged';
      groups.set(name, [...(groups.get(name) ?? []), deck]);
    }
    return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, decks]) => ({ name, decks }));
  });
  const visibleFormats = $derived(library.formats.filter(f => `${f.name} ${f.description} ${(f.tags ?? []).join(' ')}`.toLocaleLowerCase().includes(formatSearch.toLocaleLowerCase()) && (!formatTagFilter || f.tags?.includes(formatTagFilter))).sort((a, b) => {
    const result = formatSort === 'updated' ? (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '') || a.name.localeCompare(b.name)
      : formatSort === 'decks' ? library.decks.filter(d => d.formatId === a.id).length - library.decks.filter(d => d.formatId === b.id).length || a.name.localeCompare(b.name)
      : formatSort === 'tag' ? primaryFormatTag(a).localeCompare(primaryFormatTag(b)) || a.name.localeCompare(b.name)
      : formatSort === 'default' ? Number(isDefaultFormat(a.id)) - Number(isDefaultFormat(b.id)) || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name);
    return (formatDirection === 'asc' ? 1 : -1) * result;
  }));
  const formatGroups = $derived.by(() => {
    if (formatGroup === 'none') return [{ name: '', formats: visibleFormats }];
    const groups = new Map<string, Format[]>();
    for (const format of visibleFormats) {
      const name = formatGroup === 'default' ? isDefaultFormat(format.id) ? 'Default' : 'Custom' : primaryFormatTag(format) || 'Untagged';
      groups.set(name, [...(groups.get(name) ?? []), format]);
    }
    return [...groups].sort(([a], [b]) => formatGroup === 'default'
      ? (a === b ? 0 : (a === 'Default' ? -1 : 1) * (formatDirection === 'asc' ? 1 : -1))
      : a.localeCompare(b)).map(([name, formats]) => ({ name, formats }));
  });

  $effect(() => {
    const snapshot = JSON.stringify(library);
    if ((authStatus === 'local' || authStatus === 'error') && writable) storageError = saveLibrary(JSON.parse(snapshot));
    if (authStatus === 'cloud' && authSession) {
      if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
      authError = '';
      accountSaveState = 'saving';
      cloudSaveTimer = setTimeout(() => {
        const currentSession = authSession;
        if (!currentSession) return;
        cloudSaveQueue = cloudSaveQueue.catch(() => undefined).then(() => saveAccountLibrary(currentSession, JSON.parse(snapshot)))
          .then(() => { if (authSession === currentSession) { authError = ''; accountSaveState = 'saved'; } })
          .catch((error: unknown) => { if (authSession === currentSession) authError = error instanceof Error ? error.message : 'Could not save your account library.'; });
      }, 700);
    }
  });
  $effect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* The current theme still applies for this tab. */ }
  });

  onMount(() => {
    let active = true;
    (async () => {
      try {
        const auth = await startAuth();
        if (!active) return;
        if (!auth.session) { authStatus = 'local'; return; }
        authSession = auth.session;
        const accountLibrary = await loadAccountLibrary(auth.session);
        if (!active) return;
        if (accountLibrary) {
          library = accountLibrary;
        } else {
          const firstAccountLibrary = addDefaultFormats(JSON.parse(JSON.stringify(library)));
          await saveAccountLibrary(auth.session, firstAccountLibrary);
          if (!active) return;
          library = firstAccountLibrary;
          notice = 'Your library is synced to your account. This device keeps a separate copy when you sign out.';
        }
        writable = true;
        authStatus = 'cloud';
      } catch (error) {
        if (!active) return;
        authError = error instanceof Error ? error.message : 'Could not connect to your account library.';
        authStatus = 'error';
      }
    })();
    return () => { active = false; if (cloudSaveTimer) clearTimeout(cloudSaveTimer); };
  });

  async function signIn() {
    authError = '';
    try { await loginWithDiscord(); }
    catch (error) { authError = error instanceof Error ? error.message : 'Could not start Discord sign-in.'; }
  }

  async function signOut() {
    try { await logout(); }
    catch (error) { authError = error instanceof Error ? error.message : 'Could not sign out.'; }
  }

  function navigate(next: 'home' | 'decks' | 'formats') { page = next; selectedId = null; editing = null; creating = false; notice = ''; }
  function updateViewPreferences(patch: Partial<BoardView>) { library.preferredView = { ...(library.preferredView ?? DEFAULT_VIEW), ...patch }; }
  function newFormat() {
    editing = blankFormat();
  }
  function autosaveFormat(format?: Format) {
    if (!format || isDefaultFormat(format.id)) return;
    const saved = { ...format, updatedAt: new Date().toISOString() };
    if (library.formats.some(f => f.id === saved.id)) library.formats = library.formats.map(f => f.id === saved.id ? saved : f);
    else library.formats = [...library.formats, saved];
  }
  function deleteFormat(format: Format) {
    if (isDefaultFormat(format.id)) { notice = 'Default formats cannot be deleted.'; return; }
    if (library.decks.some(d => d.formatId === format.id)) { notice = 'Change or delete the decks using this format before deleting it.'; return; }
    if (confirm(`Delete the format "${format.name}"?`)) library.formats = library.formats.filter(f => f.id !== format.id);
  }
  function duplicateFormat(format: Format) {
    const copy = { ...format, id: crypto.randomUUID(), name: `${format.name.slice(0, 193)} (copy)`, updatedAt: new Date().toISOString(), tags: (format.tags ?? []).filter(tag => tag.toLocaleLowerCase() !== 'default'), allowedSets: [...format.allowedSets], banned: [...format.banned] };
    library.formats = [...library.formats, copy]; notice = 'Format duplicated.';
  }
  function exportFormat(format: Format) { download(formatText(format), `${format.name.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'format'}.format.json`); }
  async function importFormat(event: Event) {
    const input = event.currentTarget as HTMLInputElement, file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose a format file smaller than 1 MB.');
      const formats = parseFormatText(await file.text()).map(f => ({ ...f, id: crypto.randomUUID(), updatedAt: new Date().toISOString(), tags: (f.tags ?? []).filter(tag => tag.toLocaleLowerCase() !== 'default') }));
      library.formats = [...library.formats, ...formats]; notice = 'Format imported.';
    } catch (e) { notice = e instanceof Error ? e.message : 'Could not import the format.'; }
    finally { input.value = ''; }
  }
  function startDeck() { newFormatId = 'no-format'; deckName = ''; creating = true; importingDeck = false; }
  function createDeck(event: SubmitEvent) {
    event.preventDefault();
    if (!deckName.trim() || !library.formats.some(f => f.id === newFormatId)) return;
    const deck: Deck = { id: crypto.randomUUID(), name: deckName.trim(), formatId: newFormatId, notes: '', cards: [], updatedAt: new Date().toISOString() };
    library.decks = [...library.decks, deck]; selectedId = deck.id; creating = false;
  }
  function updateDeck(deck: Deck) { library.decks = library.decks.map(d => d.id === deck.id ? deck : d); }
  function startDeckImport() { importingDeck = true; creating = false; deckImportName = ''; deckImportText = ''; deckImportFormatId = 'no-format'; deckImportError = ''; }
  async function loadDeckImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement, file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose a decklist smaller than 1 MB.');
      deckImportText = await file.text(); deckImportName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
      const specified = deckImportText.match(/^\s*Format\s*:\s*(.+)\s*$/im)?.[1]?.trim();
      const found = specified && library.formats.find(f => normalizeName(f.name) === normalizeName(specified));
      if (found) deckImportFormatId = found.id;
      deckImportError = '';
    } catch (e) { deckImportError = e instanceof Error ? e.message : 'Could not read the decklist.'; }
    finally { input.value = ''; }
  }
  function importDeck(event: SubmitEvent) {
    event.preventDefault(); deckImportError = '';
    try {
      const format = library.formats.find(f => f.id === deckImportFormatId);
      if (!format) throw new Error('Choose a deck format.');
      const list = deckImportText.replace(/^\s*Format\s*:\s*.+\s*$/im, '');
      const cards = parseDeckText(list);
      const deck: Deck = { id: crypto.randomUUID(), name: deckImportName.trim() || 'Imported deck', formatId: format.id, notes: '', cards, updatedAt: new Date().toISOString() };
      library.decks = [...library.decks, deck]; selectedId = deck.id; importingDeck = false;
    } catch (e) { deckImportError = e instanceof Error ? e.message : 'Could not import deck.'; }
  }
  function deleteDeck(deck: Deck) {
    if (!confirm(`Delete "${deck.name}" and its card list?`)) return;
    library.decks = library.decks.filter(d => d.id !== deck.id); selectedId = null; notice = 'Deck deleted.';
  }
  function duplicate(deck: Deck) {
    const copy = { ...deck, id: crypto.randomUUID(), name: `${deck.name.slice(0, 193)} (copy)`, cards: deck.cards.map(c => ({ ...c, id: crypto.randomUUID() })), updatedAt: new Date().toISOString() };
    library.decks = [...library.decks, copy]; selectedId = copy.id;
  }
  function exportDeck(deck: Deck) { download(deckText(deck), `${deck.name.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'deck'}.txt`, 'text/plain'); }
  function restoreBackup(raw: string, filename: string): boolean {
    const imported = parseBackupText(raw);
    if (!confirm(`Replace this library with ${imported.decks.length} decks and ${imported.formats.length} formats from "${filename}"? Export a full backup first if you want to keep your current library.`)) return false;
    library = imported; writable = true; recovery = ''; selectedId = null; editing = null; creating = false; filter = ''; tagFilter = ''; search = ''; notice = 'Full backup restored.';
    return true;
  }
  function resetStorage() {
    if (!confirm('Replace the unreadable saved data with a fresh library? Download the stored data first to keep a copy.')) return;
    library = createLibrary(); writable = true; recovery = ''; selectedId = null; editing = null; creating = false; filter = ''; search = '';
  }
</script>

<div class="app-shell" data-theme={theme}>
  <header class="app-header">
    <nav aria-label="Main navigation"><button class:active={page === 'home'} onclick={() => navigate('home')}>Home</button><button class:active={page === 'formats'} onclick={() => navigate('formats')}>Formats <span>{library.formats.length}</span></button><button class:active={page === 'decks'} onclick={() => navigate('decks')}>Decks <span>{library.decks.length}</span></button></nav>
    <div class="header-actions"><span class="save-status" class:storage-failed={!!storageError || !!authError}>{authStatus === 'checking' ? 'Checking…' : authStatus === 'cloud' ? (authError ? 'Sync issue' : accountSaveState === 'saving' ? 'Saving…' : 'Saved to account') : authStatus === 'error' ? 'Sign-in issue' : storageError ? 'Save issue' : 'Saved on this device'}</span>{#if authSession}<span class="account-label" title={authSession.user.email ?? authSession.user.name ?? 'Signed in'}>{authSession.user.email ?? authSession.user.name ?? 'Signed in'}</span><button class="secondary" onclick={signOut}>Sign out</button>{/if}<button class="secondary" popovertarget="display-settings">Settings</button><div id="display-settings" popover="auto" class="header-settings-popover"><h2>Settings</h2><label class="settings-select">Appearance<select value={theme} onchange={(e) => theme = e.currentTarget.value as 'dark' | 'light'}><option value="dark">Dark</option><option value="light">Light</option></select></label><label class="card-zoom-control">Card size · {library.preferredView?.cardSize ?? DEFAULT_VIEW.cardSize}px<input aria-label="Card image size" type="range" min="100" max="320" step="10" value={library.preferredView?.cardSize ?? DEFAULT_VIEW.cardSize} oninput={(e) => updateViewPreferences({ cardSize: Number(e.currentTarget.value) })} /></label><label class="checkbox-label"><input type="checkbox" checked={library.preferredView?.alwaysShowCardNames ?? false} onchange={(e) => updateViewPreferences({ alwaysShowCardNames: e.currentTarget.checked })} />Always show card names</label></div><button class="secondary library-transfer-button" title="Import or export decks and formats, or back up the full library" onclick={() => transferOpen = true}>Library import / export</button></div>
  </header>
  <main class:builder-main={!!selected}>
    {#if authStatus === 'checking'}<section class="auth-loading" aria-live="polite"><span class="loading-dot"></span>Connecting…</section>{:else}
    <ScryfallStatus />
    {#if storageError}<div class="alert" role="alert"><p>{storageError}</p>{#if recovery}<div class="alert-actions"><button class="secondary" onclick={() => download(recovery, 'format-forge-recovery.json')}>Download stored data</button><button class="quiet" onclick={resetStorage}>Start fresh</button></div>{/if}</div>{/if}
    {#if authError}<div class="alert account-alert" role="alert"><p>{authError}</p>{#if authSession}<div class="alert-actions"><button class="secondary" onclick={signOut}>Sign out and use this browser</button></div>{/if}</div>{/if}
    {#if notice}<div class="notice" role="status">{notice}<button class="icon-button" onclick={() => notice = ''} aria-label="Dismiss message">×</button></div>{/if}
    {#if selected}
      <h1 class="sr-only">{selected.name}</h1>
      {#key selected.id}<DeckEditor deck={selected} formats={library.formats} preferredPrintings={library.preferredPrintings ?? {}} preferredView={library.preferredView} onpreferredView={(view) => library.preferredView = view} onpreferred={(name, info) => { const preferences = { ...library.preferredPrintings }; if (info) preferences[normalizeName(name)] = info; else delete preferences[normalizeName(name)]; library.preferredPrintings = preferences; }} onchange={updateDeck} onback={() => selectedId = null} onduplicate={() => { if (selected) duplicate(selected); }} ondelete={() => { if (selected) deleteDeck(selected); }} />{/key}
    {:else if page === 'home'}
      <section class="landing-page"><h1>Format Forge</h1><p class="landing-intro">Deck building and card search for custom Magic formats.</p>{#if authSession}<div class="account-welcome"><strong>Signed in as {authSession.user.email ?? authSession.user.name ?? 'your Discord account'}</strong><span>Your decks, formats and preferences sync to your account.</span></div>{:else}<div class="account-welcome"><strong>Save your library to your Discord account</strong><span>Sign-in is optional. Without an account, your library stays on this device.</span>{#if authConfigured}<button class="primary" onclick={signIn}>Continue with Discord</button>{:else}<small>Account sign-in is unavailable right now.</small>{/if}</div>{/if}<div class="transfer-actions"><button class="primary" onclick={() => navigate('decks')}>Your decks</button><button class="secondary" onclick={() => navigate('formats')}>Browse formats</button><a href="https://github.com/ItsSammyM/format-forge" target="_blank" rel="noreferrer">GitHub ↗</a></div><p class="help">{authStatus === 'cloud' ? 'Your library syncs across devices when you sign in. This device keeps its own copy when you sign out.' : 'Your decks and preferences are saved on this device. Use Library import / export to move your collection or keep a backup.'}</p></section>
    {:else if page === 'decks'}
      <div class="page-heading"><h1>Decks</h1><div class="page-actions"><button class="secondary" onclick={startDeckImport}>Import deck</button><button class="primary" onclick={startDeck} disabled={!library.formats.length}>+ New deck</button></div></div>
      {#if creating}<section class="panel create-deck"><form onsubmit={createDeck}><label>Deck name<input bind:value={deckName} required maxlength="200" /></label><label>Format<select bind:value={newFormatId}>{#each library.formats as f}<option value={f.id}>{f.name}</option>{/each}</select></label><button class="primary" type="submit">Create deck</button><button class="quiet" type="button" onclick={() => creating = false}>Cancel</button></form></section>{/if}
      {#if importingDeck}<section class="panel deck-import-panel"><div class="section-heading"><h2>Import deck</h2><button class="section-close" aria-label="Close deck import" onclick={() => importingDeck = false}>×</button></div><form onsubmit={importDeck}><div class="deck-import-options"><label>Deck name<input bind:value={deckImportName} maxlength="200" placeholder="Imported deck" /></label><label>Format<select bind:value={deckImportFormatId}>{#each library.formats as f}<option value={f.id}>{f.name}</option>{/each}</select></label><label class="file-button secondary">Load .txt<input type="file" accept=".txt,text/plain" onchange={loadDeckImport} /></label></div><label>Decklist<textarea bind:value={deckImportText} rows="8" placeholder="4 Lightning Bolt&#10;20 Mountain&#10;&#10;Sideboard&#10;2 Abrade"></textarea></label>{#if deckImportError}<p class="error" role="alert">{deckImportError}</p>{/if}<div class="transfer-actions"><button class="primary" type="submit">Import deck</button><button class="quiet" type="button" onclick={() => importingDeck = false}>Close</button></div></form></section>{/if}
      <LibraryToolbar searchId="deck-search" searchPlaceholder="Name or tag" bind:search filterLabel="Format" filterAllLabel="All formats" filterOptions={library.formats.map(f => ({ value: f.id, label: f.name }))} bind:filter tags={deckTags} bind:tagFilter bind:sort={deckSort} sortOptions={[{ value: 'updated', label: 'Recently edited' }, { value: 'name', label: 'Name' }, { value: 'format', label: 'Format' }, { value: 'tag', label: 'Tag' }]} bind:direction={deckDirection} bind:group={deckGroup} groupOptions={[{ value: 'none', label: 'No grouping' }, { value: 'format', label: 'By format' }, { value: 'tag', label: 'By tag' }]} />
      {#if library.decks.length === 0}<section class="empty-state"><p>No decks yet.</p>{#if !library.formats.length}<button class="primary" onclick={() => { navigate('formats'); newFormat(); }}>Create a format</button>{/if}</section>
      {:else if visibleDecks.length === 0}<section class="empty-state"><p>No matching decks.</p><button class="secondary" onclick={() => { search = ''; filter = ''; tagFilter = ''; }}>Clear filters</button></section>
      {:else}{#each deckGroups as group (group.name)}{#if group.name}<h2 class="format-group-heading">{group.name}</h2>{/if}<div class="deck-grid">{#each group.decks as deck (deck.id)}{@const format = library.formats.find(f => f.id === deck.formatId)!}{@const ruleIssues = validateDeck(deck, format)}{@const same = library.decks.filter(item => normalizeName(item.name) === normalizeName(deck.name) && item.formatId === deck.formatId)}<LibraryCard cardClass="deck-card" actionsClass="deck-card-footer" onopen={() => selectedId = deck.id}>{#snippet children()}<h2 class="deck-card-title"><span class="deck-title-text">{deck.name}{#if same.length > 1}<small class="duplicate-number">#{same.findIndex(item => item.id === deck.id) + 1}</small>{/if}</span>{#if ruleIssues.length}<span class="deck-rule-warning" role="img" title={ruleIssues.join('\n')} aria-label={`${ruleIssues.length} saved rule issues`}><svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14"><path d="M12 3 22 21H2Z" fill="none" stroke="currentColor" stroke-width="2" /><path d="M12 9v5m0 3v1" stroke="currentColor" stroke-width="2" /></svg><span>{ruleIssues.length}</span></span>{/if}</h2>{#if deck.tags?.length}<span class="library-tag-list">{#each deck.tags as tag}<span class="library-tag">{tag}</span>{/each}</span>{/if}<span>{format.name}</span><span>{deckSize(deck)} deck · {sideboardSize(deck, format)} sideboard</span>{/snippet}{#snippet actions()}<button class="quiet" onclick={() => duplicate(deck)} aria-label={`Duplicate ${deck.name}`}>Duplicate</button><button class="quiet" onclick={() => exportDeck(deck)} aria-label={`Export ${deck.name}`}>Export</button><button class="quiet danger" onclick={() => deleteDeck(deck)} aria-label={`Delete ${deck.name}`}>Delete</button>{/snippet}</LibraryCard>{/each}</div>{/each}{/if}
    {:else}
      <div class="page-heading"><h1>Formats</h1><div class="format-page-actions"><label class="file-button secondary">Import format<input type="file" accept=".json,application/json" onchange={importFormat} /></label><button class="primary" onclick={newFormat}>+ New format</button></div></div>
      {#if editing}{#key editing.id}<FormatEditor readOnly={isDefaultFormat(editing.id)} format={editing} preferredView={library.preferredView} onchange={autosaveFormat} onback={() => editing = null} />{/key}
      {:else}<LibraryToolbar searchId="format-search" searchPlaceholder="Name, description, tag" bind:search={formatSearch} tags={formatTags} bind:tagFilter={formatTagFilter} bind:sort={formatSort} sortOptions={[{ value: 'updated', label: 'Recently edited' }, { value: 'name', label: 'Name' }, { value: 'decks', label: 'Deck count' }, { value: 'tag', label: 'Tag' }, { value: 'default', label: 'Default first' }]} bind:direction={formatDirection} bind:group={formatGroup} groupOptions={[{ value: 'none', label: 'No grouping' }, { value: 'tag', label: 'By tag' }, { value: 'default', label: 'Default / custom' }]} />
        {#if library.formats.length === 0}<section class="empty-state"><p>No formats yet.</p></section>
        {:else if !visibleFormats.length}<section class="empty-state"><p>No matching formats.</p><button class="secondary" onclick={() => { formatSearch = ''; formatTagFilter = ''; }}>Clear filters</button></section>
        {:else}{#each formatGroups as group (group.name)}{#if group.name}<h2 class="format-group-heading">{group.name}</h2>{/if}<div class="format-grid">{#each group.formats as format (format.id)}{@const used = library.decks.filter(d => d.formatId === format.id).length}{@const same = library.formats.filter(item => normalizeName(item.name) === normalizeName(format.name))}{@const visibleTags = (format.tags ?? []).filter(tag => tag.toLocaleLowerCase() !== 'default')}<LibraryCard cardClass="panel format-card" actionsClass="format-card-actions" onopen={() => editing = format}>{#snippet children()}<div class="section-heading"><h2>{format.name}{#if same.length > 1}<small class="duplicate-number">#{same.findIndex(item => item.id === format.id) + 1}</small>{/if}{#if isDefaultFormat(format.id)}<small class="library-tag default-format-badge">Default</small>{/if}</h2>{#if used > 0}<span class="format-deck-count">{used} {used === 1 ? 'deck' : 'decks'}</span>{/if}</div>{#if format.description}<p class="format-description">{format.description}</p>{/if}{#if visibleTags.length}<div class="format-tags">{#each visibleTags as tag}<span class="library-tag">{tag}</span>{/each}</div>{/if}{/snippet}{#snippet actions()}<button class="quiet" onclick={() => duplicateFormat(format)}>Duplicate</button>{#if !isDefaultFormat(format.id)}<button class="quiet" onclick={() => exportFormat(format)}>Export</button>{/if}<button class="quiet danger" disabled={isDefaultFormat(format.id) || used > 0} title={isDefaultFormat(format.id) ? 'Default formats cannot be deleted' : used > 0 ? 'Move or delete linked decks first' : 'Delete this format'} onclick={() => deleteFormat(format)}>Delete</button>{/snippet}</LibraryCard>{/each}</div>{/each}{/if}{/if}
    {/if}
    {/if}
  </main>
</div>

{#if transferOpen}<LibraryTransfer {library} onclose={() => transferOpen = false} onbackup={restoreBackup} onimport={(next, message) => { library = next; notice = message; }} />{/if}
