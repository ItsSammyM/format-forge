<script lang="ts">
  import ManaCost from './ManaCost.svelte';
  import ManaSymbols from './ManaSymbols.svelte';
  import { cardPoints, countCards, CARD_SORTS, CARD_DETAILS, normalizeName, setLegality, deckCardStatuses, ZONE_NAMES } from '../lib/model';
  import type { BoardView, CardEntry, CardSort, Deck, Format, Zone } from '../lib/model';
  import { boardView, groupCards, SORT_LABELS } from '../lib/deck-view';
  import { frontLandCount, mdfcLandCount } from '../lib/card-types';
  let { deck, format, zone, defaultView, cardSize = 170, alwaysShowCardNames = false, highlighted = false, height, onheight, onclose, onview, onedit, onquantity, onpreview, ondragstart, ondragend, ondragover, ondragleave, ondrop, onpointerstart, consumeDragClick }: {
    deck: Deck; format: Format; zone: Zone; defaultView?: BoardView; cardSize?: number; alwaysShowCardNames?: boolean; highlighted?: boolean; height?: number;
    onheight?: (height: number) => void; onclose: () => void; onview: (view: BoardView) => void; onedit: (card: CardEntry) => void; onquantity: (card: CardEntry, delta: number) => void; onpreview: (card: CardEntry) => void;
    ondragstart: (event: DragEvent, card: CardEntry) => void; ondragend: () => void;
    ondragover: (event: DragEvent, zone: Zone) => void; ondragleave: (event: DragEvent) => void; ondrop: (event: DragEvent) => void;
    onpointerstart: (event: PointerEvent, card: CardEntry) => void; consumeDragClick: () => boolean;
  } = $props();
  let viewButton: HTMLButtonElement, menu: HTMLDivElement;
  let menuLeft = $state(0), menuTop = $state(0);
  function positionMenu(event: ToggleEvent) { if (event.newState === 'open') { const rect = viewButton.getBoundingClientRect(); menuLeft = Math.max(8, Math.min(rect.left, window.innerWidth - 280)); menuTop = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 250)); } }
  const uid = $props.id();
  let root: HTMLElement, resizing = $state<number | null>(null), startY = 0, startHeight = 0;
  const view = $derived({ ...boardView(deck.views?.[zone] ?? defaultView), cardSize, alwaysShowCardNames });
  const details = $derived((view.details ?? ['manaCost', 'tags']).map(k => k === 'colors' ? 'manaCost' : k));
  const statuses = $derived(deckCardStatuses(deck, format));
  const zoneCards = $derived(deck.cards.filter(c => c.zone === zone));
  const zoneMdfcs = $derived(mdfcLandCount(zoneCards));
  const zoneLands = $derived(frontLandCount(zoneCards));
  const groups = $derived(groupCards(deck.cards.filter(c => c.zone === zone), view, format));
  function resizeStart(event: PointerEvent) {
    event.preventDefault(); (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    startY = event.clientY; startHeight = root.getBoundingClientRect().height; resizing = startHeight;
  }
</script>
<section bind:this={root} class="board" class:compact-board={view.display === 'compact'} class:image-board={view.display === 'cards'} class:show-card-names={alwaysShowCardNames} class:drop-highlight={highlighted} data-zone={zone} aria-label={ZONE_NAMES[zone]} style:--deck-card-size={`${cardSize}px`} style:height={height === undefined ? '100%' : `${resizing ?? height}px`} ondragover={(e) => ondragover(e, zone)} ondragleave={ondragleave} ondrop={ondrop}>
  <div class="board-heading"><h2>{ZONE_NAMES[zone]}</h2><button class="zone-view-button" bind:this={viewButton} popovertarget={`${uid}-view`}>View ▾</button><span class="zone-count">{countCards(deck, zone)}</span><button class="section-close" aria-label={`Close ${ZONE_NAMES[zone]}`} title={`Close ${ZONE_NAMES[zone]}`} onclick={onclose}>×</button></div>
  <div bind:this={menu} id={`${uid}-view`} popover="auto" class="board-view-popover" onbeforetoggle={positionMenu} style:left={`${menuLeft}px`} style:top={`${menuTop}px`}><label>Display<select value={view.display ?? 'compact'} onchange={(e) => onview({ ...view, display: e.currentTarget.value as BoardView['display'] })}><option value="compact">Super compact</option><option value="cards">Card grid</option></select></label><div class="board-view-controls"><label>Sort<select value={view.sort} onchange={(e) => onview({ ...view, sort: e.currentTarget.value as CardSort })}>{#each CARD_SORTS as key}<option value={key}>{SORT_LABELS[key]}</option>{/each}</select></label><label>Group<select value={view.group} onchange={(e) => onview({ ...view, group: e.currentTarget.value as BoardView['group'] })}><option value="none">No grouping</option>{#each CARD_SORTS as key}<option value={key}>{SORT_LABELS[key]}</option>{/each}</select></label><label>Direction<select value={view.direction} onchange={(e) => onview({ ...view, direction: e.currentTarget.value as BoardView['direction'] })}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label></div><fieldset><legend>Show in card list</legend>{#each CARD_DETAILS as key}<label class="checkbox-label"><input type="checkbox" checked={details.includes(key)} onchange={(e) => { const current = details; onview({ ...view, details: e.currentTarget.checked ? [...new Set([...current, key])] : current.filter(k => k !== key) }); }} />{key === 'manaCost' ? 'Mana cost' : key === 'points' ? 'Points per copy' : SORT_LABELS[key]}</label>{/each}<label class="checkbox-label"><input type="checkbox" checked={view.showPrintings ?? false} onchange={(e) => onview({ ...view, showPrintings: e.currentTarget.checked })} />Printing details</label></fieldset></div>
  <div class="board-cards"><div class="board-groups">
    {#if !groups.length}<p class="board-empty">No cards</p>{/if}
    {#each groups as group (group.key)}
      <div class="board-group">
      {#if view.group !== 'none'}<div class="card-group-heading"><span>{#if view.group === 'type' && group.label === 'Land'}Lands{:else if group.symbols}<ManaSymbols symbols={group.symbols} />{:else}{group.label}{/if}</span><span>{#if view.group === 'type' && group.label === 'Land'}{zoneLands}{#if zoneMdfcs} (+{zoneMdfcs} MDFCs){/if}{:else}{group.count}{/if}</span></div>{/if}
      <div class="deck-list" class:deck-image-grid={view.display === 'cards'}>
      {#each group.cards as card (card.id)}
        <div class="deck-row" class:illegal={!!statuses.get(card.id)?.illegal.length} class:over-limit={!!statuses.get(card.id)?.limits.length} title={[...statuses.get(card.id)?.illegal ?? [], ...statuses.get(card.id)?.limits ?? []].join(' · ')}>
          <span class="row-quantity-buttons"><button aria-label={`Remove one ${card.name}`} title="Remove one copy" onclick={() => onquantity(card, -1)}>−</button><button aria-label={`Add one ${card.name}`} title="Add one copy" disabled={card.quantity >= 999} onclick={() => onquantity(card, 1)}>+</button></span>
          <button class="deck-card-name" draggable="true" ondragstart={(e) => ondragstart(e, card)} ondragend={ondragend} data-card-open={card.id} onclick={() => { if (!consumeDragClick()) onedit(card); }} title={card.info?.typeLine || 'Card data not resolved'}>{#if view.display === 'cards'}{#if card.info?.image}<img class="deck-grid-image" src={card.info.image} alt={card.name} draggable="false" loading="lazy" />{:else}<span class="deck-grid-image missing-image">{card.name}</span>{/if}{/if}<span class="entry-count">{card.quantity}</span><span class="card-label"><span class="card-text">{card.name}</span>{#if (view.details ?? ['manaCost', 'tags']).includes('tags') && card.tags?.length}<span class="card-tags">{#each card.tags as tag}<span>{tag}</span>{/each}</span>{/if}</span><span class="card-list-details">{#if view.details?.includes('manaValue')}<small title="Mana value">MV {card.info?.manaValue ?? '?'}</small>{/if}{#if details.includes('manaCost')}<ManaCost cost={card.info?.manaCost} />{/if}{#if view.details?.includes('colorIdentity')}<span title="Color identity"><ManaSymbols symbols={card.info?.colorIdentity ?? []} /></span>{/if}{#if view.details?.includes('points')}<small title={`${cardPoints(card, format)} points per copy · ${cardPoints(card, format) * card.quantity} total`}>{cardPoints(card, format)} pts</small>{/if}{#if view.details?.includes('price')}<small>{card.info?.priceUSD != null ? `$${card.info.priceUSD.toFixed(2)}` : 'Price ?'}</small>{/if}{#if view.details?.includes('type')}<small>{card.info?.typeLine ?? 'Type ?'}</small>{/if}{#if view.details?.includes('rarity')}<small>{card.info?.rarity ?? 'Rarity ?'}</small>{/if}{#if view.showPrintings}<small>{card.info?.set.toUpperCase() ?? '?'} {card.info?.collectorNumber ?? ''}</small>{/if}</span></button>
        </div>
      {/each}
      </div>
      </div>
    {/each}
  </div></div>
  {#if height !== undefined}<button class="zone-height-handle" aria-label={`Resize ${ZONE_NAMES[zone]}`} onpointerdown={resizeStart} onpointermove={(e) => { if (resizing !== null) resizing = Math.max(70, Math.min(1000, startHeight + e.clientY - startY)); }} onpointerup={() => { if (resizing !== null) onheight?.(Math.round(resizing)); resizing = null; }} onpointercancel={() => resizing = null} onkeydown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onheight?.(Math.max(70, Math.min(1000, height! + (e.key === 'ArrowUp' ? -10 : 10)))); } }} title="Drag to resize this zone">⋯</button>{/if}
</section>
