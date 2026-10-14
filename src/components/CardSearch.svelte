<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import SplitPane from './SplitPane.svelte';
  import AdvancedSearch from './AdvancedSearch.svelte';
  import { normalizeName, ruleCardName, ZONE_NAMES, ZONES } from '../lib/model';
  import type { CardInfo, Format, Zone } from '../lib/model';
  import { buildSearchQuery, cardInfo, emptyFilters, searchCards, filterFormatCards, searchLegalPool, legalPoolQuery } from '../lib/scryfall';
  import type { ScryfallCard, SearchOptions } from '../lib/scryfall';
  let { format, mode = 'deck', bannedNames = [], onadd, onpreview, oncarddrag, oncarddragend, onmanual, controlsSize, oncontrolresize, onclose, actionLabel = '+ Ban', selectedLabel = 'Banned', formatActions }: { format?: Format; mode?: 'deck' | 'ban'; bannedNames?: string[]; onadd: (name: string, info: CardInfo, zone: Zone) => void; onpreview: (name: string, info: CardInfo) => void; oncarddrag?: (event: DragEvent, name: string, info: CardInfo) => void; oncarddragend?: () => void; onmanual?: (name: string, quantity: number, zone: Zone) => void; controlsSize?: number; oncontrolresize?: (size: number) => void; onclose?: () => void; actionLabel?: string; selectedLabel?: string; formatActions?: { label: string; selectedLabel: string; disabled: (name: string) => boolean; onadd: (name: string, info: CardInfo) => void }[] } = $props();
  let workspace: HTMLDivElement, searchForm: HTMLFormElement, controlsContent: HTMLDivElement;
  let localControlsSize = $state<number | undefined>(), autoControlsSize = $state(25);
  const searchRatio = $derived(controlsSize ?? localControlsSize ?? autoControlsSize);
  function resizeControls(size: number) { if (oncontrolresize) oncontrolresize(size); else localControlsSize = size; }
  onMount(() => {
    // Match the compact form's natural height until the user chooses a split.
    const measure = () => {
      const height = workspace.getBoundingClientRect().height - 8;
      if (height <= 0) return;
      const style = getComputedStyle(searchForm);
      const desired = controlsContent.getBoundingClientRect().height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 1;
      autoControlsSize = Math.max(15, Math.min(55, desired / height * 100));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(workspace); observer.observe(controlsContent); measure();
    return () => observer.disconnect();
  });
  const uid = $props.id();
  let optionsButton: HTMLButtonElement;
  let optionsLeft = $state(8), optionsTop = $state(60);
  function positionOptions(event: ToggleEvent) { if (event.newState === 'open') { const r = optionsButton.getBoundingClientRect(); optionsLeft = Math.max(8, Math.min(r.right - 310, window.innerWidth - 318)); optionsTop = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 260)); } }
  let manualName = $state(''), manualQuantity = $state(1);
  let query = $state(''), filters = $state(emptyFilters()), onlyFormat = $state(true), order = $state('name');
  let unique = $state<'cards' | 'art' | 'prints'>('cards'), direction = $state<'auto' | 'asc' | 'desc'>('auto'), extras = $state(true);
  let imageSize = $state('220');
  let target = $state<Zone>('main'), results = $state<ScryfallCard[]>([]), total = $state(0), next = $state<string | undefined>();
  let loading = $state(false), error = $state(''), searched = $state(false), activeQuery = $state('');
  let activeOrder = 'name', activeOptions: SearchOptions = {}, controller: AbortController | undefined, generation = 0;
  let debounce: ReturnType<typeof setTimeout> | undefined, firstLoad = true;
  const poolFormat = $derived(mode === 'deck' && onlyFormat ? format : undefined);
  const exactQuery = $derived.by(() => { try { const base = buildSearchQuery(query, filters, poolFormat); return poolFormat?.whitelistOnly ? activeQuery || legalPoolQuery(base, (poolFormat.allowedCards ?? []).slice(0, 40)) : base; } catch (e) { return e instanceof Error ? e.message : 'Invalid query'; } });
  const banned = $derived(new Set(bannedNames.map(ruleCardName)));

  $effect(() => { const listPool = poolFormat?.whitelistOnly; untrack(() => { if (listPool) filters.normalOnly = false; }); });
  $effect(() => {
    // Search on initial load, filter changes, and clearing the query.
    try {
      buildSearchQuery(query, filters, mode === 'deck' && onlyFormat ? format : undefined);
      order; unique; direction; extras; poolFormat?.banned; poolFormat?.allowedCards;
      untrack(() => {
        controller?.abort(); generation++; clearTimeout(debounce);
        loading = true; error = ''; next = undefined; results = []; searched = false;
        debounce = setTimeout(() => { void search(); }, firstLoad ? 0 : 350);
        firstLoad = false;
      });
    } catch (e) {
      untrack(() => { clearTimeout(debounce); controller?.abort(); generation++; loading = false; next = undefined; results = []; error = e instanceof Error ? e.message : 'Invalid filters.'; });
    }
  });
  onDestroy(() => { clearTimeout(debounce); controller?.abort(); generation++; });
  async function search(more = false) {
    clearTimeout(debounce); controller?.abort();
    const requestController = new AbortController(); controller = requestController;
    const current = ++generation;
    try {
      if (!more) {
        activeQuery = buildSearchQuery(query, filters, mode === 'deck' && onlyFormat ? format : undefined);
        activeOrder = order; activeOptions = { unique, direction, extras }; results = []; next = undefined;
      }
      loading = true; error = '';
      const base = buildSearchQuery(query, filters, poolFormat);
      const page = poolFormat?.whitelistOnly ? await searchLegalPool(base, poolFormat, activeOrder, requestController.signal, more ? next : undefined, activeOptions, (sent) => { if (current === generation) activeQuery = sent; }) : await searchCards(activeQuery, activeOrder, requestController.signal, more ? next : undefined, activeOptions);
      if (current !== generation) return;
      const filtered = filterFormatCards(page.data, poolFormat);
      const cards = more ? [...results, ...filtered] : filtered;
      results = [...new Map(cards.map(c => [c.id, c])).values()];
      total = page.total_cards; next = page.has_more ? page.next_page : undefined; searched = true;
    } catch (e) { if (current === generation && !requestController.signal.aborted) { error = e instanceof Error ? e.message : 'Search failed.'; searched = true; } }
    finally { if (current === generation) loading = false; }
  }
</script>

<section class="search-pane" aria-label={mode === 'ban' ? 'Format card search' : 'Card search'}>
  {#if onclose}<div class="search-pane-heading"><h2>Search</h2><button class="section-close" aria-label="Close search" title="Close search" onclick={onclose}>×</button></div>{/if}
  <div class="search-options-popover" id={`${uid}-options`} popover="auto" onbeforetoggle={positionOptions} style:left={`${optionsLeft}px`} style:top={`${optionsTop}px`}>
    <label>Card images<select aria-label="Card image size" bind:value={imageSize}><option value="220">Large images</option><option value="180">Medium images</option><option value="140">Small images</option></select></label>
    <label class="checkbox-label"><input type="checkbox" bind:checked={filters.includeTokens} /> Include tokens</label>
    {#if mode === 'deck'}<label>Add to<select bind:value={target}><optgroup label="Boards">{#each ZONES.filter(z => ['main', 'side', 'considering'].includes(z)) as z}<option value={z}>{ZONE_NAMES[z]}</option>{/each}</optgroup><optgroup label="Card roles">{#each ZONES.filter(z => !['main', 'side', 'considering'].includes(z)) as z}<option value={z}>{ZONE_NAMES[z]}</option>{/each}</optgroup></select></label>{/if}
    {#if onmanual}<details class="manual-search-add"><summary>Add by name</summary><form class="manual-add" onsubmit={(e) => { e.preventDefault(); onmanual?.(manualName, manualQuantity, target); manualName = ''; }}><input aria-label="Card name" bind:value={manualName} required maxlength="200" placeholder="Exact card name" /><input aria-label="Copies" type="number" min="1" max="999" bind:value={manualQuantity} required /><button class="secondary" type="submit">Add</button></form></details>{/if}
  </div>
  <div bind:this={workspace} class="search-workspace">
    <SplitPane orientation="vertical" value={searchRatio} defaultValue={autoControlsSize} label="Resize search controls and card results" onresize={resizeControls}>
      {#snippet first()}
  <form bind:this={searchForm} class="search-controls" onsubmit={(e) => { e.preventDefault(); search(); }}>
    <div bind:this={controlsContent} class="search-control-content">
    <div class="search-input-row"><label class="sr-only" for={`${uid}-query`}>Scryfall search</label><input id={`${uid}-query`} bind:value={query} placeholder="Search cards or use Scryfall syntax…" type="search" /><button class="primary" type="submit">Search</button></div>
    <div class="search-pool-controls">{#if mode === 'deck' && format}<label class="checkbox-label"><input type="checkbox" bind:checked={onlyFormat} /> Format card pool</label>{/if}<label class="checkbox-label" title="Uses cards legal or restricted in Vintage, without applying Vintage copy limits"><input type="checkbox" checked={filters.normalOnly || !!(poolFormat?.normalOnly && !poolFormat.whitelistOnly)} disabled={!!(poolFormat?.normalOnly && !poolFormat.whitelistOnly)} onchange={(e) => filters.normalOnly = e.currentTarget.checked} /> Tournament-legal cards only{(poolFormat?.normalOnly && !poolFormat.whitelistOnly) ? ' (format rule)' : ''}</label></div>
    <div class="search-tools"><label class="search-sort">Sort<select aria-label="Sort results" bind:value={order}><option value="name">Name</option><option value="cmc">Mana value</option><option value="color">Color</option><option value="rarity">Rarity</option><option value="released">Release date</option><option value="usd">Price</option><option value="edhrec">Popularity</option><option value="power">Power</option><option value="toughness">Toughness</option><option value="artist">Artist</option><option value="set">Set</option></select></label><button class="secondary search-options-button" bind:this={optionsButton} type="button" popovertarget={`${uid}-options`}>Options</button><button class="quiet search-clear" type="button" onclick={() => { query = ''; filters = emptyFilters(); unique = 'cards'; direction = 'auto'; extras = true; }}>Clear</button></div>
    <AdvancedSearch bind:filters bind:unique bind:direction {exactQuery} excludedNames={poolFormat?.banned ?? []} legalList={!!poolFormat?.whitelistOnly} />
    </div>
  </form>
      {/snippet}
      {#snippet second()}
  <div class="search-results" aria-busy={loading}>
    {#if error}<p class="error" role="alert">{error}</p><button class="secondary" onclick={() => search(!!results.length && !!next)}>Retry</button>{/if}
    {#if searched && !error}<p class="result-count" role="status">{total} {poolFormat?.banned.length && !poolFormat.whitelistOnly ? 'matches before named bans' : total === 1 ? 'card' : 'cards'}</p>{/if}
    {#if searched && !results.length && !error && !loading}<p class="search-empty">{next ? 'No allowed cards on this page. Load more to continue.' : 'No cards match this search.'}</p>{/if}
    <div class="search-card-grid" style:--card-min={`${imageSize}px`}>{#each results as card (card.id)}{@const info = cardInfo(card)}<article class="search-card"><button type="button" class="card-image-button" data-card-open={card.id} draggable={!!oncarddrag} ondragstart={(e) => oncarddrag?.(e, card.name, info)} ondragend={oncarddragend} onclick={() => onpreview(card.name, info)} aria-label={`View ${card.name}`}>{#if info.image}<img src={info.image} alt={card.name} loading="lazy" draggable="false" />{:else}<span class="missing-image">{card.name}</span>{/if}</button><span class="result-card-name">{card.name}</span>{#if mode === 'ban' && formatActions}<div class="quick-add-actions">{#each formatActions as action}<button type="button" class="secondary" disabled={action.disabled(card.name)} onclick={() => action.onadd(card.name, info)}>{action.disabled(card.name) ? action.selectedLabel : action.label}</button>{/each}</div>{:else if mode === 'ban'}<button type="button" class="secondary add-result" disabled={banned.has(ruleCardName(card.name))} onclick={() => onadd(card.name, info, target)}>{banned.has(ruleCardName(card.name)) ? selectedLabel : actionLabel}</button>{:else}<div class="quick-add-actions">{#each ['main', 'side', 'considering'] as z}<button class="secondary" onclick={() => onadd(card.name, info, z as Zone)}>+ {ZONE_NAMES[z as Zone]}</button>{/each}</div>{#if !['main', 'side', 'considering'].includes(target)}<button class="secondary" onclick={() => onadd(card.name, info, target)}>+ {ZONE_NAMES[target]}</button>{/if}{/if}</article>{/each}</div>
    {#if loading}<p class="result-count" role="status">Loading cards…</p>{/if}
    {#if next}<button type="button" class="secondary load-more" disabled={loading} onclick={() => search(true)}>Load more</button>{/if}
  </div>
      {/snippet}
    </SplitPane>
  </div>
  <p class="scryfall-credit">Card data and images from <a href="https://scryfall.com" target="_blank" rel="noreferrer">Scryfall</a>.</p>
</section>
