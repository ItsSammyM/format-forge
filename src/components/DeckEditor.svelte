<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { DeckHistory } from '../lib/deck-history';
  import SplitPane from './SplitPane.svelte';
  import DeckBoard from './DeckBoard.svelte';
  import CardSearch from './CardSearch.svelte';
  import CardDetails from './CardDetails.svelte';
  import DeckStats from './DeckStats.svelte';
  import LandsPanel from './LandsPanel.svelte';
  import { DEFAULT_VIEW } from '../lib/deck-view';
  import { addCard, countCards, deckSize, sideboardSize, deckText, moveCard, normalizeName, parseDeckText, setLegality, validateDeck, visibleZones, setCardTags, replaceDeckText, changePrinting, deckPoints, isPointerDrag, normalizeTags, tournamentOnly, tournamentEligibility, officialLegality, hasReleaseRange, OFFICIAL_FORMAT_NAMES, ZONE_NAMES, ZONES } from '../lib/model';
  import type { BoardView, CardEntry, CardInfo, Deck, DeckLayout, ExportStyle, Format, Zone, UISection } from '../lib/model';
  import { resolveCard } from '../lib/scryfall';
  import { download } from '../lib/storage';
  let { deck, formats, onchange, onback, onduplicate, ondelete, preferredPrintings = {}, onpreferred, preferredView, onpreferredView }: { deck: Deck; formats: Format[]; onchange: (deck: Deck) => void; onback: () => void; onduplicate: () => void; ondelete: () => void; preferredPrintings?: Record<string, CardInfo>; onpreferred: (name: string, info?: CardInfo) => void; preferredView?: BoardView; onpreferredView: (view: BoardView) => void } = $props();
  const history = new DeckHistory();
  let historyVersion = $state(0);
  const canUndo = $derived.by(() => { historyVersion; return history.canUndo; });
  const canRedo = $derived.by(() => { historyVersion; return history.canRedo; });
  function commit(next: Deck, group = '') { history.record(deck, next, group); historyVersion++; onchange(next); }
  function undo(redo = false) { if (cardDetails && !cardDetails.savePendingTags()) return; editingCardId = null; preview = null; const next = redo ? history.redo(deck) : history.undo(deck); if (next) { attempts.clear(); retry++; onchange(next); historyVersion++; error = ''; } }
  function undoKey(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'z') return;
    if (event.target instanceof Element && event.target.closest('input,textarea,[contenteditable="true"]')) return;
    event.preventDefault(); undo(event.shiftKey);
  }
  let cardDetails = $state<{ savePendingTags: () => boolean } | undefined>();
  let stats = $state(false), primerOpen = $state(false);
  let error = $state(''), lookupError = $state(''), resolving = $state(0), retry = $state(0);
  type DeckTextMode = 'edit' | 'add-deck' | 'export-plain' | 'export-moxfield' | 'export-arena' | 'export-mtgo' | 'export-extended';
  let transfer = $state(false), importText = $state(''), textMode = $state<DeckTextMode>('export-plain');
  let printings = $state(false), copied = $state(false);
  let preview = $state<{ name: string; info: CardInfo } | null>(null);
  let editingCardId = $state<string | null>(null);
  let compact = $state(false), hoveredZone = $state<Zone | null>(null);
  type Dragged = { source: 'deck'; card: CardEntry; quantity: number; pointerId?: number; x?: number; y?: number; startX?: number; startY?: number } | { source: 'search'; name: string; info: CardInfo; quantity: number };
  let dragged = $state<Dragged | null>(null), movedPointer = $state(false), suppressDragClick = false;
  onMount(() => { const media = window.matchMedia('(max-width: 1000px)'); compact = media.matches; const change = () => compact = media.matches; media.addEventListener('change', change); return () => media.removeEventListener('change', change); });
  const editingCard = $derived(deck.cards.find(c => c.id === editingCardId));
  const format = $derived(formats.find(f => f.id === deck.formatId)!);
  const sharedCardSize = $derived(preferredView?.cardSize ?? DEFAULT_VIEW.cardSize ?? 170);
  const sharedShowCardNames = $derived(preferredView?.alwaysShowCardNames ?? false);
  const issues = $derived(validateDeck(deck, format));
  const hidden = $derived(deck.layout?.hiddenZones ?? []);
  const mainOpen = $derived(!hidden.includes('main'));
  const searchOpen = $derived(!hidden.includes('search'));
  const landsOpen = $derived(deck.layout?.landsOpen ?? false);
  const auxiliary = $derived(visibleZones(deck).filter(zone => zone !== 'main' && !hidden.includes(zone)));
  const closed = $derived([...(landsOpen ? [] : ['lands' as UISection]), ...(['main', 'search', ...visibleZones(deck).filter(zone => zone !== 'main')] as UISection[]).filter(zone => hidden.includes(zone))]);
  function toggleZone(zone: UISection) { if (zone === 'lands') { layout({ landsOpen: !landsOpen }); return; } layout({ hiddenZones: hidden.includes(zone) ? hidden.filter(z => z !== zone) : [...hidden, zone] }); }
  const boards = $derived(visibleZones(deck));
  const allTags = $derived([...new Set(deck.cards.flatMap(c => c.tags ?? []))].sort());
  const isExportMode = $derived(textMode.startsWith('export-'));
  const exportStyle = $derived((textMode === 'export-moxfield' ? 'moxfield' : textMode === 'export-arena' ? 'arena' : textMode === 'export-mtgo' ? 'mtgo' : textMode === 'export-extended' ? 'extended' : 'plain') as ExportStyle);
  const exported = $derived(deckText(deck, exportStyle, printings));
  const attempts = new Set<string>();
  const metadataController = new AbortController();
  let disposed = false;
  onDestroy(() => { disposed = true; metadataController.abort(); });
  $effect(() => {
    retry;
    const needsSets = hasReleaseRange(format) || !format.whitelistOnly && (!format.eternal && format.allowedSets.length > 0 || !!format.bannedRarities?.length);
    const hasPriceLimits = [format.minCardPrice, format.maxCardPrice, format.minDeckPrice, format.maxDeckPrice].some(n => n !== undefined);
    const needsRarityHistory = !format.whitelistOnly && !!format.bannedRarities?.length;
    const jobs = deck.cards.filter(card => {
      const info = card.info;
      if (!info?.scryfallId) return true;
      const stale = !info.checkedAt || Date.now() - Date.parse(info.checkedAt) > 86400000;
      const needsHistory = needsSets && (setLegality(card, format) === 'unknown' || needsRarityHistory || info.setsComplete && stale);
      return format.gameplayOnly && info.isGameCard === undefined
        || tournamentOnly(format) && tournamentEligibility(card, format) === 'unknown'
        || !!format.officialFormat && !format.whitelistOnly && (!officialLegality(card, format) || stale)
        || hasPriceLimits && stale || needsRarityHistory && !info.printRarities
        || info.manaValue === undefined || info.colors === undefined || info.priceUSD === undefined || info.rarity === undefined
        || needsHistory && (hasReleaseRange(format) && info.printReleases === undefined || !info.setsComplete || stale);
    });
    for (const entry of jobs) {
      if (resolving >= 4) break;
      const key = `${entry.id}:${entry.info?.scryfallId}:${needsSets}:${!!format.gameplayOnly}:${format.officialFormat ?? ''}:${format.releasedAfter ?? ''}:${format.releasedBefore ?? ''}:${retry}`;
      if (attempts.has(key)) continue;
      attempts.add(key);
      // Read a snapshot so async work never captures a mutable Svelte proxy.
      const snapshot: CardEntry = JSON.parse(JSON.stringify(entry));
      untrack(() => { void enrich(snapshot, needsSets); });
    }
  });
  async function enrich(entry: CardEntry, needsSets: boolean) {
    resolving++;
    try {
      const info = await resolveCard(entry, needsSets, metadataController.signal, format);
      if (!disposed && deck.cards.some(c => c.id === entry.id)) { history.refreshMetadata(entry.id, entry.info, info); onchange({ ...deck, cards: deck.cards.map(c => c.id === entry.id && normalizeName(c.name) === normalizeName(entry.name) && c.info?.scryfallId === entry.info?.scryfallId ? { ...c, info } : c) }); }
    } catch (e) { if (!disposed) lookupError = `${entry.name}: ${e instanceof Error ? e.message : 'Card data could not be resolved.'}`; }
    finally { if (!disposed) resolving--; }
  }
  function layout(patch: DeckLayout) { onchange({ ...deck, layout: { ...deck.layout, ...patch } }); }
  function view(zone: Zone, value: BoardView) { onchange({ ...deck, views: { ...deck.views, [zone]: value } }); onpreferredView(value); }
  function edit(card: CardEntry) { if (cardDetails && !cardDetails.savePendingTags()) return; preview = null; editingCardId = card.id; error = ''; }
  function closeCard() { if (cardDetails && !cardDetails.savePendingTags()) return; preview = null; editingCardId = null; }
  function dragEnd() { dragged = null; hoveredZone = null; }
  function nativeStart(event: DragEvent, card: CardEntry) {
    dragged = { source: 'deck', card, quantity: event.shiftKey ? card.quantity : 1 };
    event.dataTransfer?.setData('application/x-format-forge-card', JSON.stringify({ deckId: deck.id, id: card.id }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  function searchStart(event: DragEvent, name: string, info: CardInfo) {
    dragged = { source: 'search', name, info, quantity: 1 };
    event.dataTransfer?.setData('application/x-format-forge-card', 'search');
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }
  function nativeOver(event: DragEvent, target: Zone) { if (dragged) { event.preventDefault(); hoveredZone = target; if (event.dataTransfer) event.dataTransfer.dropEffect = dragged.source === 'search' ? 'copy' : 'move'; } }
  function nativeLeave(event: DragEvent) { if (!(event.relatedTarget instanceof Node) || !(event.currentTarget as HTMLElement).contains(event.relatedTarget)) hoveredZone = null; }
  function drop(target: Zone) {
    if (!dragged) return;
    try {
      commit(dragged.source === 'deck' ? moveCard(deck, dragged.card.id, target, dragged.quantity) : addCard(deck, dragged.name, 1, target, preferredPrintings[normalizeName(dragged.name)] ?? dragged.info));
      error = '';
    } catch (e) { error = e instanceof Error ? e.message : 'Could not move the card.'; }
    dragEnd();
  }
  function nativeDrop(event: DragEvent) {
    // Read the destination from the receiving board to avoid losing a forwarded zone argument.
    const target = (event.currentTarget as HTMLElement).dataset.zone;
    if (dragged && ZONES.includes(target as Zone)) { event.preventDefault(); drop(target as Zone); }
  }
  function pointerStart(event: PointerEvent, card: CardEntry) {
    if (event.pointerType === 'mouse') return;
    event.preventDefault(); (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    movedPointer = false;
    dragged = { source: 'deck', card, quantity: event.shiftKey ? card.quantity : 1, pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
  }
  function pointerMove(event: PointerEvent) {
    if (dragged?.source !== 'deck' || dragged.pointerId !== event.pointerId) return;
    movedPointer ||= Math.hypot(event.clientX - dragged.startX!, event.clientY - dragged.startY!) > 6;
    if (!movedPointer) return;
    event.preventDefault(); dragged = { ...dragged, x: event.clientX, y: event.clientY };
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-zone]')?.dataset.zone;
    hoveredZone = ZONES.includes(target as Zone) ? target as Zone : null;
  }
  function pointerFinish(event: PointerEvent) {
    if (dragged?.source !== 'deck' || dragged.pointerId !== event.pointerId) return;
    if (movedPointer) { suppressDragClick = true; setTimeout(() => suppressDragClick = false, 250); }
    if (movedPointer && hoveredZone) drop(hoveredZone); else dragEnd();
  }
  function consumeDragClick() { if (!suppressDragClick) return false; suppressDragClick = false; return true; }
  function update(patch: Partial<Deck>, group = '') { commit({ ...deck, ...patch, updatedAt: new Date().toISOString() }, group); }
  function add(name: string, count: number, target: Zone, info?: CardInfo) {
    try { commit(addCard(deck, name, count, target, preferredPrintings[normalizeName(name)] ?? info)); error = ''; }
    catch (e) { error = e instanceof Error ? e.message : 'Could not add the card.'; }
  }
  function changeQuantity(id: string, delta: number) {
    const entry = deck.cards.find(c => c.id === id)!;
    if (entry.quantity + delta > 999) return;
    update({ cards: deck.cards.map(c => c.id === id ? { ...c, quantity: c.quantity + delta } : c).filter(c => c.quantity > 0) });
  }
  function move(id: string, target: Zone, count: number) {
    try { commit(moveCard(deck, id, target, count)); error = ''; closeCard(); }
    catch (e) { error = e instanceof Error ? e.message : 'Could not move the card.'; }
  }
  function changeTextMode(mode: DeckTextMode) {
    textMode = mode;
    importText = mode === 'edit' ? deckText(deck, 'extended', true) : '';
    copied = false; error = '';
  }
  function openTransfer() { transfer = true; textMode = 'export-plain'; importText = ''; copied = false; error = ''; }
  function importList() {
    try {
      if (isExportMode) return;
      let next = textMode === 'edit' ? replaceDeckText(deck, importText, preferredPrintings) : { ...deck, cards: [...deck.cards] };
      if (textMode === 'add-deck') for (const card of parseDeckText(importText)) next = addCard(next, card.name, card.quantity, card.zone, card.info ?? preferredPrintings[normalizeName(card.name)]);
      commit(next); importText = ''; textMode = 'export-plain'; error = ''; transfer = false;
    } catch (e) { error = e instanceof Error ? e.message : 'Could not import the decklist.'; }
  }
  async function readList(event: Event) {
    const input = event.currentTarget as HTMLInputElement, file = input.files?.[0];
    if (!file) return;
    try { if (file.size > 1024 * 1024) throw new Error('Choose a decklist smaller than 1 MB.'); importText = await file.text(); }
    catch (e) { error = e instanceof Error ? e.message : 'Could not read file.'; }
    finally { input.value = ''; }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(exported); copied = true; }
    catch { error = 'Clipboard unavailable. Select the export text below or download the file.'; }
  }
</script>

<div class="deck-toolbar"><button class="quiet" onclick={onback}>← Decks</button><label class="sr-only" for="deck-name">Deck name</label><input id="deck-name" class="deck-title-input" value={deck.name} maxlength="200" oninput={(e) => { if (e.currentTarget.value.trim()) update({ name: e.currentTarget.value }, 'name'); }} /><label class="sr-only" for="deck-format">Deck format</label><select id="deck-format" value={deck.formatId} onchange={(e) => update({ formatId: e.currentTarget.value })}>{#each formats as f}<option value={f.id}>{f.name}</option>{/each}</select><details class="format-check" class:has-issues={issues.length > 0}><summary><span>{deckSize(deck)} deck · {sideboardSize(deck, format)} sideboard · {countCards(deck, 'considering')} considering</span><span>{resolving ? `Checking ${resolving}…` : issues.length ? `${issues.length} rule ${issues.length === 1 ? 'issue' : 'issues'}` : 'Rules met'}</span></summary><div class="check-content">{#if format.officialFormat}<p class="help">Scryfall provides {OFFICIAL_FORMAT_NAMES[format.officialFormat]} legality, including its official bans.</p>{/if}{#if format.pointed?.length || format.maxPoints !== undefined}<p>{deckPoints(deck, format)} / {format.maxPoints ?? '∞'} points</p>{/if}<p>Deck {format.minCards}–{format.maxCards ?? '∞'} · Sideboard {format.minSideboard}–{format.maxSideboard ?? '∞'} · {format.copyLimit ?? '∞'} copies · {format.whitelistOnly ? `${format.allowedCards?.length ?? 0} legal cards` : format.allowedSets.length ? `${format.allowedSets.length} allowed sets` : 'All sets'}</p>{#if issues.length}<ul>{#each issues as issue}<li>{issue}</li>{/each}</ul>{/if}{#if lookupError}<p class="error">{lookupError}</p><button class="secondary" disabled={resolving > 0} onclick={() => { lookupError = ''; retry++; }}>Retry card data</button>{/if}<p class="help">Commanders count toward deck size. Companions count toward the sideboard except in commander formats. Considering cards are excluded from rule checks.</p></div></details>{#if closed.length || !stats || !transfer || !primerOpen}<details class="deck-actions-menu panels-menu"><summary class="secondary">Panels</summary><div>{#each closed as zone}<button class="secondary" onclick={(event) => { toggleZone(zone); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{zone === 'search' ? 'Search' : zone === 'lands' ? 'Lands' : ZONE_NAMES[zone]}</button>{/each}{#if !stats}<button class="secondary" onclick={(event) => { stats = true; event.currentTarget.closest('details')?.removeAttribute('open'); }}>Stats</button>{/if}{#if !transfer}<button class="secondary" onclick={(event) => { openTransfer(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Deck import / export</button>{/if}{#if !primerOpen}<button class="secondary" onclick={(event) => { primerOpen = true; event.currentTarget.closest('details')?.removeAttribute('open'); }}>Primer</button>{/if}</div></details>{/if}<details class="deck-actions-menu"><summary class="secondary">Deck actions</summary><div><button class="secondary" disabled={!canUndo} onclick={() => undo()}>Undo</button><button class="secondary" disabled={!canRedo} onclick={() => undo(true)}>Redo</button><button class="secondary" onclick={onduplicate}>Duplicate deck</button><button class="danger" onclick={ondelete}>Delete deck</button><button class="quiet" onclick={() => layout({ workspace: 46, boards: 55, auxiliary: 50, searchControls: undefined, hiddenZones: [], landsOpen: false, special: {}, zoneSplits: {} })}>Reset zone sizes</button><label>Deck tags<input value={(deck.tags ?? []).join(', ')} placeholder="aggro, favorites" onchange={(e) => (() => { try { update({ tags: normalizeTags(e.currentTarget.value.split(',')) }); error = ''; } catch (e) { error = e instanceof Error ? e.message : 'Could not save deck tags.'; } })()} /></label></div></details></div>
{#if error}<p class="error action-error" role="alert">{error}</p>{/if}
{#if transfer}
  <section class="transfer-panel panel deck-transfer">
    <div class="section-heading"><h2>Import / export / edit this deck</h2><button class="section-close" aria-label="Close deck import and export" onclick={() => transfer = false}>×</button></div>
    <div class="deck-transfer-column">
      <div class="deck-transfer-toolbar">
        <label class="sr-only" for="deck-text-mode">Deck text action</label>
        <select id="deck-text-mode" value={textMode} onchange={(e) => changeTextMode(e.currentTarget.value as DeckTextMode)}>
          <option value="edit">Edit</option><option value="add-deck">Add to Deck</option><option value="export-plain">Plaintext</option><option value="export-moxfield">Moxfield</option><option value="export-arena">Arena</option><option value="export-mtgo">MTGO</option><option value="export-extended">All Sections</option>
        </select>
        {#if !isExportMode}<label class="file-button secondary">Load .txt<input type="file" accept=".txt,text/plain" onchange={readList} /></label>{:else}<label class="checkbox-label"><input type="checkbox" bind:checked={printings} /> Printings</label>{/if}
        {#if isExportMode}<div class="deck-transfer-export-actions"><button class="secondary" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button><button class="primary" onclick={() => download(exported, `${deck.name.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'deck'}.txt`, 'text/plain')}>Download</button></div>{:else}<button class="primary transfer-submit" onclick={importList}>{textMode === 'edit' ? 'Apply edits' : 'Add cards'}</button>{/if}
      </div>
      <label class="sr-only" for="deck-text">{isExportMode ? 'Exported decklist' : textMode === 'edit' ? 'Edit deck as text' : 'Import decklist'}</label>
      <textarea id="deck-text" value={isExportMode ? exported : importText} readonly={isExportMode} oninput={(e) => importText = e.currentTarget.value} rows="10" placeholder={textMode === 'edit' ? 'Deck\n4 Lightning Bolt\n20 Mountain\n\nSideboard\n2 Abrade' : 'Deck\n4 Lightning Bolt\n20 Mountain\n\nSideboard\n2 Abrade\n\nConsidering\n1 Opt'}></textarea>
      {#if textMode === 'add-deck'}<p class="help">Cards are added to this deck. Use Sideboard and Considering headers to split sections.</p>{/if}
    </div>
  </section>
{/if}
<DeckStats {deck} {format} open={stats} onclose={() => stats = false} />


{#snippet renderBoard(board: Zone, special = false)}
  <DeckBoard {deck} {format} defaultView={preferredView} cardSize={sharedCardSize} alwaysShowCardNames={sharedShowCardNames} zone={board} onclose={() => toggleZone(board)} highlighted={hoveredZone === board} height={special ? deck.layout?.special?.[board] ?? 160 : undefined} onheight={(height) => layout({ special: { ...deck.layout?.special, [board]: height } })} onview={(value) => view(board, value)} onedit={edit} onquantity={(card, delta) => changeQuantity(card.id, delta)} onpreview={(card) => { if (card.info?.scryfallId) preview = { name: card.name, info: card.info }; }} ondragstart={nativeStart} ondragend={dragEnd} ondragover={nativeOver} ondragleave={nativeLeave} ondrop={nativeDrop} onpointerstart={pointerStart} {consumeDragClick} />
{/snippet}
<svelte:window onkeydown={undoKey} onpointermove={pointerMove} onpointerup={pointerFinish} onpointercancel={(event) => { if (dragged?.source === 'deck' && isPointerDrag(dragged, event.pointerId)) dragEnd(); }} />
{#snippet deckWorkspace()}
  <div class="boards-pane"><div class="primary-boards">
    {#snippet stackedZones(zones: Zone[])}
      {#if zones.length === 1}{@render renderBoard(zones[0])}{:else}<SplitPane orientation="vertical" value={deck.layout?.zoneSplits?.[zones[0]] ?? (zones.length === 2 && zones[0] === 'side' ? deck.layout?.auxiliary : undefined) ?? 100 / zones.length} defaultValue={100 / zones.length} label={`Resize ${ZONE_NAMES[zones[0]]} and remaining zones`} onresize={(ratio) => layout({ zoneSplits: { ...deck.layout?.zoneSplits, [zones[0]]: ratio } })}>
        {#snippet first()}{@render renderBoard(zones[0])}{/snippet}
        {#snippet second()}{@render stackedZones(zones.slice(1))}{/snippet}
      </SplitPane>{/if}
    {/snippet}
    {#snippet auxiliaryStack()}<div class="auxiliary-stack">{@render stackedZones(auxiliary)} </div>{/snippet}
    {#if mainOpen && auxiliary.length}<SplitPane orientation={compact ? 'vertical' : 'horizontal'} value={deck.layout?.boards ?? 55} defaultValue={55} label="Resize deck and auxiliary boards" onresize={(boards) => layout({ boards })}>
      {#snippet first()}{@render renderBoard('main')}{/snippet}
      {#snippet second()}{@render auxiliaryStack()}{/snippet}
    </SplitPane>{:else if mainOpen}{@render renderBoard('main')}{:else if auxiliary.length}{@render auxiliaryStack()}{:else}<div class="closed-workspace"><p>Deck windows are closed.</p><button class="secondary" onclick={() => toggleZone('main')}>Reopen deck</button></div>{/if}
  </div></div>
{/snippet}
{#snippet searchWorkspace()}<CardSearch {format} cardSize={sharedCardSize} alwaysShowCardNames={sharedShowCardNames} onclose={() => toggleZone('search')} controlsSize={deck.layout?.searchControls} oncontrolresize={(searchControls) => layout({ searchControls })} onadd={(name, info, target) => add(name, 1, target, info)} onmanual={add} onpreview={(name, info) => { if (cardDetails && !cardDetails.savePendingTags()) return; editingCardId = null; preview = { name, info }; }} oncarddrag={searchStart} oncarddragend={dragEnd} />{/snippet}
<div class="builder-layout resizable-builder">
  <SplitPane hideFirst={!mainOpen && !auxiliary.length && searchOpen} hideSecond={!searchOpen} value={deck.layout?.workspace ?? 46} defaultValue={46} label="Resize deck and search" onresize={(workspace) => layout({ workspace })}>
    {#snippet first()}{@render deckWorkspace()}{/snippet}
    {#snippet second()}{@render searchWorkspace()}{/snippet}
  </SplitPane>
</div>
{#if primerOpen}<section class="primer-window" aria-label="Deck primer"><div class="section-heading"><h2>Primer</h2><button class="section-close" aria-label="Close primer" onclick={() => primerOpen = false}>×</button></div><label class="sr-only" for="deck-primer">Deck primer</label><textarea id="deck-primer" value={deck.notes} oninput={(e) => update({ notes: e.currentTarget.value }, 'primer')} placeholder="Strategy, matchups, and card choices"></textarea></section>{/if}
{#if landsOpen}<LandsPanel {format} cardSize={sharedCardSize} alwaysShowCardNames={sharedShowCardNames} onclose={() => toggleZone('lands')} onadd={(name, info, zone) => add(name, 1, zone, info)} onpreview={(name, info) => { if (cardDetails && !cardDetails.savePendingTags()) return; editingCardId = null; preview = { name, info }; }} />{/if}
{#if dragged?.source === 'deck' && dragged.pointerId !== undefined && movedPointer}<div class="drag-ghost" style:left={`${dragged.x! + 10}px`} style:top={`${dragged.y! + 10}px`}>{dragged.quantity} {dragged.card.name}</div>{/if}
{#if editingCard || preview}
  <CardDetails bind:this={cardDetails} card={editingCard ?? preview!} cardSize={sharedCardSize} preferred={preferredPrintings[normalizeName((editingCard ?? preview!).name)]} onclose={closeCard} ondefault={(info) => onpreferred((editingCard ?? preview!).name, info)} onquantity={editingCard ? (delta) => changeQuantity(editingCard.id, delta) : undefined} onmove={editingCard ? (target, count) => move(editingCard.id, target, count) : undefined} ontags={editingCard ? (id, tags) => commit(setCardTags(deck, id, tags)) : undefined} onprinting={editingCard ? (info) => commit(changePrinting(deck, editingCard.id, info)) : undefined} onremove={editingCard ? () => { update({ cards: deck.cards.filter(c => c.id !== editingCard.id) }); closeCard(); } : undefined} />
{/if}
