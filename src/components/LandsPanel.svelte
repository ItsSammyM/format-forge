<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { CardInfo, Format, Zone } from '../lib/model';
  import { ZONE_NAMES } from '../lib/model';
  import { buildSearchQuery, cardInfo, emptyFilters, filterFormatCards, searchCards } from '../lib/scryfall';
  import type { ScryfallCard } from '../lib/scryfall';

  let { format, cardSize = 170, alwaysShowCardNames = false, onclose, onadd, onpreview }: { format: Format; cardSize?: number; alwaysShowCardNames?: boolean; onclose: () => void; onadd: (name: string, info: CardInfo, zone: Zone) => void; onpreview: (name: string, info: CardInfo) => void } = $props();
  const cycles = [
    { id: 'basic', label: 'Basic', query: 't:basic t:land -t:snow' },
    { id: 'snow-basic', label: 'Snow-covered basics', query: 't:basic t:snow t:land' },
    { id: 'all-cycles', label: 'All known land cycles', query: 't:land otag:cycle' },
    { id: 'channel', label: 'Channel', query: 't:land o:channel' },
    { id: 'legends', label: 'Legends cycle', query: `!"Karakas" or !"Tolaria" or !"Urborg" or !"Hammerheim" or !"Pendelhaven"` },
    { id: 'urza-saga', label: "Urza's Saga cycle", query: `!"Gaea's Cradle" or !"Serra's Sanctum" or !"Tolarian Academy" or !"Phyrexian Tower" or !"Shivan Gorge"` },
    { id: 'ixalan-dfc', label: 'Ixalan transforming', query: 'set:xln is:transform t:land' },
    { id: 'rivals-dfc', label: 'Rivals of Ixalan transforming', query: 'set:rix is:transform t:land' },
    { id: 'time-spiral-storage', label: 'Time Spiral storage', query: 'set:tsp is:storageland' },
    { id: 'future-sight', label: 'Future Sight future-shifted', query: `!"River of Tears" or !"Grove of the Burnwillows" or !"Horizon Canopy" or !"Nimbus Maze" or !"Graven Cairns"` },
    { id: 'surveil', label: 'Surveil', query: 't:land is:surveilland' },
    { id: 'fetch', label: 'Fetch', query: 't:land is:fetchland' },
    { id: 'shock', label: 'Shock', query: 't:land is:shockland' },
    { id: 'dual', label: 'Original dual', query: 't:land is:dual' },
    { id: 'temple', label: 'Temples / scrylands', query: 't:land is:scryland' },
    { id: 'gain', label: 'Gain', query: 't:land is:gainland' },
    { id: 'bounce', label: 'Bounce', query: 't:land is:bounceland' },
    { id: 'check', label: 'Check', query: 't:land is:checkland' },
    { id: 'pain', label: 'Pain', query: 't:land is:painland' },
    { id: 'fast', label: 'Fast', query: 't:land is:fastland' },
    { id: 'slow', label: 'Slow', query: 't:land is:slowland' },
    { id: 'filter', label: 'Filter', query: 't:land is:filterland' },
    { id: 'bond', label: 'Bond', query: 't:land is:bondland' },
    { id: 'shadow', label: 'Shadow', query: 't:land is:shadowland' },
    { id: 'triome', label: 'Triomes', query: 't:land is:triland' },
    { id: 'canopy', label: 'Canopy', query: 't:land is:canopyland' },
    { id: 'battle', label: 'Battle', query: 't:land is:tangoland' },
    { id: 'manland', label: 'Creature', query: 't:land is:creatureland' },
    { id: 'storage', label: 'Storage', query: 't:land is:storageland' },
    { id: 'bicycle', label: 'Bicycle', query: 't:land is:bikeland' },
    { id: 'cycling', label: 'Cycling', query: 't:land o:cycling' },
  ] as const;

  let selected = $state('basic');
  let cards = $state<ScryfallCard[]>([]), next = $state<string | undefined>();
  let loading = $state(false), error = $state(''), searched = $state(false);
  let controller: AbortController | undefined, generation = 0;

  async function load(more = false) {
    if (!more) {
      controller?.abort(); controller = new AbortController(); generation++;
      cards = []; next = undefined; error = ''; searched = false;
    }
    if (!controller) return;
    const current = generation, signal = controller.signal;
    const cycle = cycles.find(item => item.id === selected) ?? cycles[0];
    try {
      loading = true; error = '';
      const query = buildSearchQuery(cycle.query, emptyFilters(), format, 'main');
      const page = await searchCards(query, 'color', signal, more ? next : undefined, { unique: 'cards', direction: 'asc', extras: false });
      if (current !== generation) return;
      const filtered = filterFormatCards(page.data, format, 'main');
      cards = more ? [...cards, ...filtered] : filtered;
      next = page.has_more ? page.next_page : undefined; searched = true;
    } catch (e) {
      if (current === generation && !signal.aborted) { error = e instanceof Error ? e.message : 'Could not load lands.'; searched = true; }
    } finally { if (current === generation) loading = false; }
  }

  $effect(() => {
    selected; format;
    void load();
  });
  onDestroy(() => { controller?.abort(); generation++; });
</script>

<section class="lands-window panel" class:hide-card-names={!alwaysShowCardNames} aria-label="Land search">
  <div class="section-heading"><h2>Lands</h2><button class="section-close" aria-label="Close lands" onclick={onclose}>×</button></div>
  <label class="land-cycle-select">Land cycle<select bind:value={selected}>{#each cycles as cycle}<option value={cycle.id}>{cycle.label}</option>{/each}</select></label>
  <div class="land-results" aria-busy={loading}>
    {#if error}<p class="error" role="alert">{error}</p><button class="secondary" onclick={() => load()}>Retry</button>{/if}
    {#if searched && !error}<p class="result-count">{cards.length} lands loaded</p>{/if}
    {#if loading && !cards.length}<p class="muted" role="status">Loading lands…</p>{/if}
    {#if searched && !cards.length && !loading && !error}<p class="muted">No lands found for this cycle in the selected format.</p>{/if}
    <div class="search-card-grid land-card-grid" style:--card-min={`${cardSize}px`}>
        {#each cards as card (card.id)}{@const info = cardInfo(card)}
          <article class="search-card land-card"><button type="button" class="card-image-button" data-card-open={card.id} onclick={() => onpreview(card.name, info)} aria-label={`View ${card.name}`}>{#if info.image}<img src={info.image} alt={card.name} loading="lazy" draggable="false" />{:else}<span class="missing-image">{card.name}</span>{/if}</button><span class="result-card-name">{card.name}</span><div class="quick-add-actions">{#each ['main', 'side', 'considering'] as zone}<button class="secondary" title={`Add ${card.name} to ${ZONE_NAMES[zone as Zone]}`} onclick={() => onadd(card.name, info, zone as Zone)}>+ {ZONE_NAMES[zone as Zone]}</button>{/each}</div></article>
        {/each}
    </div>
    {#if next}<button class="secondary load-more" disabled={loading} onclick={() => load(true)}>{loading ? 'Loading…' : 'Load more'}</button>{/if}
  </div>
  <p class="scryfall-credit">Card data from <a href="https://scryfall.com" target="_blank" rel="noreferrer">Scryfall</a>.</p>
</section>
