<script lang="ts">
  import { untrack } from 'svelte';
  import type { CardEntry, CardInfo, Zone } from '../lib/model';
  import { ZONE_NAMES, ZONES, normalizeTags } from '../lib/model';
  import { cardInfo, latestOracle, loadPrintings } from '../lib/scryfall';
  import type { ScryfallCard } from '../lib/scryfall';
  let { card, preferred, cardSize = 170, onclose, onquantity, onmove, ontags, onremove, onprinting, ondefault, oninfo }: {
    card: CardEntry | { name: string; info?: CardInfo }; preferred?: CardInfo; cardSize?: number; onclose: () => void;
    onquantity?: (delta: number) => void; onmove?: (zone: Zone, quantity: number) => void; ontags?: (id: string, tags: string[]) => void;
    onremove?: () => void; onprinting?: (info: CardInfo) => void; ondefault?: (info: CardInfo | undefined) => void; oninfo?: (info: CardInfo) => void;
  } = $props();
  let root: HTMLElement;
  let taggingId: string | undefined, savedTagText = '';
  export function savePendingTags(): boolean {
    if (!taggingId || tagText === savedTagText) return true;
    try { const tags = normalizeTags(tagText.split(',')); ontags?.(taggingId, tags); savedTagText = tagText; error = ''; return true; }
    catch (e) { error = e instanceof Error ? e.message : 'Could not save tags.'; return false; }
  }
  function close() { if (savePendingTags()) onclose(); }
  let flipped = $state(false), moveQuantity = $state(1), moveTarget = $state<Zone>('side'), tagText = $state('');
  let oracle = $state<CardInfo | null>(null), editions = $state<ScryfallCard[]>([]), loading = $state(false), error = $state('');
  let editionInfo = $state<CardInfo | null>(null), requestVersion = 0;
  const entry = $derived('id' in card ? card : undefined);
  const printing = $derived(editionInfo ?? card.info ?? oracle);
  const scryfallUrl = $derived(printing?.set && printing.collectorNumber
    ? `https://scryfall.com/card/${encodeURIComponent(printing.set)}/${encodeURIComponent(printing.collectorNumber)}`
    : `https://scryfall.com/search?q=${encodeURIComponent(card.name)}`);
  const cardKey = $derived(`${'id' in card ? card.id : 'search'}:${card.name}`);
  $effect(() => {
    cardKey;
    untrack(() => { const name = card.name; flipped = false; moveQuantity = 1; moveTarget = entry?.zone === 'main' ? 'side' : 'main'; taggingId = entry?.id; tagText = (entry?.tags ?? []).join(', '); savedTagText = tagText; oracle = null; editions = []; editionInfo = null; error = ''; void fetchOracle(name); });
    return () => { savePendingTags(); requestVersion++; };
  });
  async function fetchOracle(name: string) {
    const version = ++requestVersion; loading = true;
    try { const result = await latestOracle(name); if (version === requestVersion) { oracle = result; oninfo?.(result); } }
    catch (e) { if (version === requestVersion) error = e instanceof Error ? e.message : 'Could not load Oracle text.'; }
    finally { if (version === requestVersion) loading = false; }
  }
  async function fetchEditions() {
    const version = requestVersion; loading = true; error = '';
    try { const result = await loadPrintings(card.name, printing?.oracleId); if (version === requestVersion) editions = result; }
    catch (e) { if (version === requestVersion) error = e instanceof Error ? e.message : 'Could not load printings.'; }
    finally { if (version === requestVersion) loading = false; }
  }
  function choosePrinting(id: string) {
    const edition = editions.find(e => e.id === id); if (!edition) return;
    editionInfo = cardInfo(edition); flipped = false; onprinting?.(editionInfo);
  }
  function outside(event: PointerEvent) {
    if (!(event.target instanceof Node) || root?.contains(event.target)) return;
    // A second card click switches the panel directly instead of closing it first.
    if (event.target instanceof Element && event.target.closest('[data-card-open]')) return;
    close();
  }
</script>
<svelte:window onpointerdown={outside} onkeydown={(e) => { if (e.key === 'Escape') close(); }} />
<div bind:this={root} tabindex="-1" class="card-details-panel" role="dialog" aria-modal="false" aria-label={card.name} style:--card-image-size={`${cardSize}px`}>
  <div class="section-heading"><h2>Card details</h2><button class="icon-button" aria-label="Close card details" onclick={close}>×</button></div>
  <div class="card-details-layout">
    <div class="card-details-image">{#if printing?.image}<img src={flipped ? printing.backImage : printing.image} alt={`${card.name}, ${printing.set.toUpperCase()} printing`} />{:else}<p class="muted">Printing image unavailable</p>{/if}{#if printing?.backImage}<button class="secondary" onclick={() => flipped = !flipped}>Flip printing</button>{/if}<p class="muted">{printing?.setName ?? printing?.set.toUpperCase() ?? ''} · {printing?.collectorNumber ?? ''} · {printing?.rarity ?? 'Rarity unavailable'}</p></div>
    <div class="card-details-rules"><p class="printing-metadata">{printing?.setName ?? printing?.set.toUpperCase() ?? 'Set unavailable'} · {printing?.rarity ?? 'Rarity unavailable'}</p><h3><a href={scryfallUrl} target="_blank" rel="noreferrer">{card.name}</a></h3>{#if oracle}<p>{oracle.manaCost}</p><p>{oracle.typeLine}</p><p class="oracle-text">{oracle.oracleText}</p>{:else if loading}<p class="muted" role="status">Loading current Oracle text…</p>{:else}<p class="muted">Current Oracle text could not be verified.</p>{#if card.info}<p class="oracle-text">{card.info.oracleText}</p><small>Saved Oracle text, awaiting refresh.</small>{/if}{/if}  <details class="printing-picker"><summary>{ondefault ? 'Printing and default edition' : 'Printings'}</summary><button class="secondary" disabled={loading} onclick={fetchEditions}>Load all printings</button>{#if editions.length}<label>Edition<select value={printing?.scryfallId} onchange={(e) => choosePrinting(e.currentTarget.value)}>{#each editions as edition}<option value={edition.id}>{edition.set_name ?? edition.set.toUpperCase()} · {edition.collector_number} · {edition.released_at ?? ''}</option>{/each}</select></label>{/if}{#if ondefault}<div class="transfer-actions"><button class="secondary" disabled={!printing?.scryfallId} onclick={() => { if (printing) ondefault?.(printing); }}>Use this printing in future decks</button>{#if preferred}<button class="secondary" onclick={() => ondefault?.(undefined)}>Clear default printing</button>{/if}</div>{#if preferred}<p class="help">Default: {preferred.set.toUpperCase()} {preferred.collectorNumber}</p>{/if}{/if}</details></div>
  </div>
  {#if entry}
    <div class="card-detail-controls"><div class="quantity-field"><span>Quantity</span><div class="quantity-control"><button class="icon-button" aria-label="Remove one copy" onclick={() => onquantity?.(-1)}>−</button><span>{entry.quantity}</span><button class="icon-button" disabled={entry.quantity >= 999} aria-label="Add one copy" onclick={() => onquantity?.(1)}>+</button></div></div>
    <form class="move-card-form" onsubmit={(e) => { e.preventDefault(); if (savePendingTags()) onmove?.(moveTarget, moveQuantity); }}><div class="form-grid"><label class="move-count-label">Copies to move<input type="number" bind:value={moveQuantity} min="1" max={entry.quantity} required /></label><label>Move to<select bind:value={moveTarget}>{#each ZONES as zone}<option value={zone} disabled={zone === entry.zone}>{ZONE_NAMES[zone]}</option>{/each}</select></label></div><div class="move-buttons"><button type="submit" class="secondary">{entry.quantity === 1 ? 'Move card' : `Move ${moveQuantity} ${moveQuantity === 1 ? 'copy' : 'copies'}`}</button>{#if entry.quantity > 1}<button type="button" class="secondary" onclick={() => { if (savePendingTags()) onmove?.(moveTarget, entry.quantity); }}>Move all {entry.quantity}</button>{/if}</div></form></div>
    <form class="tag-editor" onsubmit={(e) => { e.preventDefault(); savePendingTags(); }}><label>Card tags<input bind:value={tagText} onblur={savePendingTags} placeholder="ramp, removal, win condition" /></label><button class="secondary" type="submit">Save tags</button><small>Saved when you leave this field or close the panel.</small></form>
  {/if}

  {#if loading}<p class="help" role="status">Loading card data…</p>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if entry}<button class="danger" onclick={onremove}>Remove card</button>{/if}
</div>
