<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Library } from '../lib/model';
  import { isDefaultFormat } from '../lib/default-formats';
  import { createTransfer, transferText, parseTransfer, planImport, applyImport } from '../lib/transfer';
  import type { TransferScope, TransferFile, ImportPlan } from '../lib/transfer';
  import { download } from '../lib/storage';
  let { library, onimport, onclose }: { library: Library; onimport: (library: Library, message: string) => void; onclose: () => void } = $props();
  let dialog: HTMLDialogElement;
  let tab = $state<'export' | 'import'>('export'), scope = $state<TransferScope>('both');
  let deckIds = $state(untrack(() => library.decks.map(deck => deck.id))), formatIds = $state(untrack(() => library.formats.filter(format => !isDefaultFormat(format.id)).map(format => format.id)));
  let files = $state<TransferFile[]>([]), plan = $state<ImportPlan | undefined>(), mappings = $state<Record<string, string>>({});
  let error = $state(''), reading = $state(false), filenames = $state<string[]>([]);
  const exportableFormats = $derived(library.formats.filter(format => !isDefaultFormat(format.id)));
  const requiredFormats = $derived(new Set(scope === 'both' ? library.decks.filter(deck => deckIds.includes(deck.id)).map(deck => deck.formatId).filter(id => !isDefaultFormat(id)) : []));
  const choices = $derived([...library.formats, ...plan?.newFormats ?? []]);
  const summary = $derived.by(() => { try { const file = createTransfer(library, scope, deckIds, formatIds); return `${file.decks.length} decks · ${file.formats.length} formats`; } catch { return 'Choose items to export'; } });
  onMount(() => dialog.showModal());
  function select(ids: string[], id: string, checked: boolean) { return checked ? [...new Set([...ids, id])] : ids.filter(value => value !== id); }
  function exportSelection() { try { download(transferText(library, scope, deckIds, formatIds), `format-forge-${scope}-${new Date().toISOString().slice(0, 10)}.transfer.json`); error = ''; } catch (e) { error = e instanceof Error ? e.message : 'Could not export.'; } }
  async function readTransfers(event: Event) {
    const input = event.currentTarget as HTMLInputElement, selected = [...input.files ?? []]; if (!selected.length) return;
    reading = true; error = ''; files = []; plan = undefined; mappings = {};
    try {
      if (selected.reduce((sum, file) => sum + file.size, 0) > 40 * 1024 * 1024) throw new Error('Choose files smaller than 40 MB in total.');
      const parsed = await Promise.all(selected.map(async file => { try { return parseTransfer(await file.text()); } catch (e) { throw new Error(`${file.name}: ${e instanceof Error ? e.message : 'Invalid file'}`); } }));
      const prepared = planImport(library, parsed); files = parsed; plan = prepared; filenames = selected.map(file => file.name);
      mappings = Object.fromEntries(prepared.references.filter(ref => ref.suggestedId).map(ref => [ref.key, ref.suggestedId!]));
    } catch (e) { error = e instanceof Error ? e.message : 'Could not read the exports.'; }
    finally { reading = false; input.value = ''; }
  }
  function importSelection() {
    if (!plan) return;
    try { const result = applyImport(library, files, plan, mappings); onimport(result, `Imported ${plan.deckCount} decks and ${plan.newFormats.length} new formats.`); onclose(); }
    catch (e) { error = e instanceof Error ? e.message : 'Could not import.'; }
  }
</script>
<dialog bind:this={dialog} class="library-transfer-dialog" onclose={onclose}>
  <div class="section-heading"><h2>Library</h2><button class="section-close" aria-label="Close library import and export" onclick={onclose}>×</button></div>
  <div class="transfer-tabs" role="group" aria-label="Transfer action">{#each ['export', 'import'] as action}<button class="secondary" class:active={tab === action} aria-pressed={tab === action} onclick={() => { tab = action as typeof tab; error = ''; }}>{action === 'export' ? 'Export library' : 'Import library'}</button>{/each}{#if tab === 'export'}    <select class="transfer-scope" aria-label="Export decks, formats, or both" bind:value={scope}><option value="decks">Decks</option><option value="formats">Formats</option><option value="both">Decks + formats</option></select>{/if}</div>
  {#if tab === 'export'}

    <div class="transfer-selections">
      {#if scope !== 'formats'}<fieldset><legend>Decks · {deckIds.length} selected</legend><div class="selection-actions"><button class="quiet" onclick={() => deckIds = library.decks.map(deck => deck.id)}>All</button><button class="quiet" onclick={() => deckIds = []}>None</button></div><div class="transfer-item-list">{#each library.decks as deck}<label class="checkbox-label"><input type="checkbox" checked={deckIds.includes(deck.id)} onchange={(e) => deckIds = select(deckIds, deck.id, e.currentTarget.checked)} /><span>{deck.name}<small>{library.formats.find(format => format.id === deck.formatId)?.name}</small></span></label>{/each}{#if !library.decks.length}<p class="help">No decks yet.</p>{/if}</div></fieldset>{/if}
      {#if scope !== 'decks'}<fieldset><legend>Custom formats</legend><div class="selection-actions"><button class="quiet" onclick={() => formatIds = exportableFormats.map(format => format.id)}>All</button><button class="quiet" onclick={() => formatIds = []}>None</button></div><div class="transfer-item-list">{#each exportableFormats as format}<label class="checkbox-label"><input type="checkbox" checked={formatIds.includes(format.id) || requiredFormats.has(format.id)} disabled={requiredFormats.has(format.id)} onchange={(e) => formatIds = select(formatIds, format.id, e.currentTarget.checked)} /><span>{format.name}{#if requiredFormats.has(format.id)}<small>Used by a selected deck</small>{/if}</span></label>{/each}{#if !exportableFormats.length}<p class="help">No custom formats to export.</p>{/if}</div></fieldset>{/if}
    </div>
    <p class="help">Deck exports include each card’s chosen printing.</p>
    <div class="transfer-actions"><button class="primary" onclick={exportSelection}>Export library</button><span class="muted">{summary}</span></div>
  {:else if tab === 'import'}
    <label class="file-button secondary">Choose exports<input type="file" multiple accept=".json,application/json" onchange={readTransfers} disabled={reading} /></label>
    {#if reading}<p class="help" role="status">Reading exports…</p>{/if}
    {#if plan}<p>{plan.deckCount} decks · {plan.newFormats.length} new formats{plan.reusedFormats ? ` · ${plan.reusedFormats} matching formats reused` : ''}</p><p class="help">{filenames.join(', ')}</p>{#if plan.references.length}<div class="import-format-mappings"><h3>Deck formats</h3>{#each plan.references as ref}<label>{ref.name}<select value={mappings[ref.key] ?? ''} onchange={(e) => mappings = { ...mappings, [ref.key]: e.currentTarget.value }}><option value="">Choose a destination format</option>{#each choices as format}<option value={format.id}>{format.name}</option>{/each}</select></label>{/each}<p class="help">Confirm where decks-only exports belong.</p></div>{/if}<button class="primary" onclick={importSelection} disabled={plan.references.some(ref => !mappings[ref.key])}>Add to library</button>{/if}
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</dialog>
