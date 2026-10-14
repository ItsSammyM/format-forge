<script lang="ts">
  import ManaSymbols from './ManaSymbols.svelte';
  import { manaCostTokens, manaSymbolColor, manaSymbolLabel } from '../lib/mana-cost';
  let { cost }: { cost?: string } = $props();
  const tokens = $derived(manaCostTokens(cost ?? ''));
</script>
{#snippet part(symbol: string)}
  {#if ['W', 'U', 'B', 'R', 'G', 'C'].includes(symbol)}<ManaSymbols symbols={[symbol]} />
  {:else if symbol === 'P'}<svg class="phyrexian-symbol" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.5" /><path d="M12 1v22" stroke="currentColor" stroke-width="2.5" /></svg>
  {:else if symbol === 'S'}<svg class="snow-symbol" viewBox="0 0 24 24" aria-hidden="true">{#each [0, 60, 120] as angle}<path d="M12 2v20 M8 5l4 4 4-4 M8 19l4-4 4 4" transform={`rotate(${angle} 12 12)`} fill="none" stroke="currentColor" stroke-width="1.6" />{/each}</svg>
  {:else}<span class="mana-generic">{symbol}</span>{/if}
{/snippet}
<span class="mana-cost" aria-label={cost === undefined ? 'Mana cost unavailable' : cost ? `Mana cost ${cost}` : 'No mana cost'} title={cost === undefined ? 'Mana cost unavailable' : cost || 'No mana cost'}>
  {#if cost === undefined}<small>?</small>{/if}
  {#each tokens as token}
    {#if token.kind === 'separator'}<span class="mana-cost-separator" aria-label="other face">//</span>
    {:else}<span class="mana-cost-pip" class:hybrid={token.parts.length > 1} role="img" aria-label={manaSymbolLabel(token.symbol)} title={manaSymbolLabel(token.symbol)} style:background={token.parts.length > 1 ? `linear-gradient(135deg, ${manaSymbolColor(token.parts[0])} 50%, ${manaSymbolColor(token.parts[1])} 50%)` : manaSymbolColor(token.symbol)}>
      {#if token.parts.length > 1}{#each token.parts as symbol}<span class="hybrid-part" aria-hidden="true">{@render part(symbol)}</span>{/each}{:else}<span aria-hidden="true">{@render part(token.symbol)}</span>{/if}
    </span>{/if}
  {/each}
</span>
