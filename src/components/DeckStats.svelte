<script lang="ts">
  import type { Deck } from '../lib/model';
  import { deckStats, MANA_COLORS, openingHandStats, handFilterOptions } from '../lib/deck-stats';
  import ManaSymbols from './ManaSymbols.svelte';
  let { deck, open = true, onclose }: { deck: Deck; open?: boolean; onclose?: () => void } = $props();
  let handSize = $state(7);
  let selected = $state('type:Land');
  const options = $derived(handFilterOptions(deck));
  const filter = $derived({ kind: selected.startsWith('tag:') ? 'tag' as const : 'type' as const, value: selected.slice(selected.indexOf(':') + 1) });
  const opening = $derived(openingHandStats(deck, handSize, filter));
  const stats = $derived(deckStats(deck, handSize));
  const peak = $derived(Math.max(1, ...stats.curve.map(b => b.count)));
  const number = (n: number) => Number(n.toFixed(2)).toString();
</script>
<section hidden={!open} class="panel deck-stats" aria-label="Deck statistics">
  <div class="section-heading"><h2>Deck stats</h2>{#if onclose}<button class="section-close" aria-label="Close deck stats" onclick={onclose}>×</button>{/if}</div>
  <div class="stats-grid">
    <div><h2>Mana curve</h2><div class="mana-curve" role="img" aria-label={`Nonland cards by mana value: ${stats.curve.map(b => `${b.label}: ${b.count}`).join(', ')}`}>
      {#each stats.curve as bucket}<div class="curve-column"><span>{bucket.count}</span><div class="curve-track"><div class="curve-bar" style:height={`${bucket.count / peak * 100}%`}></div></div><span>{bucket.label}</span></div>{/each}
    </div><p class="help">Main + commanders · nonlands</p>{#if stats.curveUnknown}<p class="help">Mana value unknown: {stats.curveUnknown} copies.</p>{/if}</div>
    <div><h2>Mana pips</h2><table class="pip-table"><thead><tr><th>Color</th><th>Pips</th><th>Share</th></tr></thead><tbody>{#each MANA_COLORS as color}<tr><td><ManaSymbols symbols={[color]} /></td><td>{number(stats.pips[color])}</td><td>{stats.totalColored ? (100 * stats.pips[color] / stats.totalColored).toFixed(1) : '0.0'}%</td></tr>{/each}{#if stats.pips.C}<tr><td><ManaSymbols symbols={['C']} /></td><td>{number(stats.pips.C)}</td><td>—</td></tr>{/if}</tbody></table><p class="help">By casting cost. Hybrid pips split; generic excluded.</p></div>
    <div><h2>Opening hand</h2><div class="hand-controls"><label>Count<select bind:value={selected}><optgroup label="Card types">{#each options.types as type}<option value={`type:${type}`}>{type}</option>{/each}</optgroup>{#if options.tags.length}<optgroup label="Card tags">{#each options.tags as tag}<option value={`tag:${tag}`}>Tag: {tag}</option>{/each}</optgroup>{/if}</select></label><label>Hand size<input type="number" min="0" max="999" bind:value={handSize} /></label></div><p class="expected-lands"><strong>{opening.expected.toFixed(2)}</strong> average {filter.kind === 'tag' ? `“${filter.value}” cards` : filter.value.toLowerCase() + ' cards'}</p><p class="help">{opening.matches} of {opening.size} cards · before mulligans</p>{#if opening.unresolved}<p class="help">Type unknown for {opening.unresolved} copies.</p>{/if}<a href="https://stattrek.com/online-calculator/hypergeometric" target="_blank" rel="noreferrer">Hypergeometric calculator ↗</a><details class="calculator-help"><summary>Calculator inputs</summary><p class="help">Population: {opening.size}. Successes: {opening.matches}. Sample: {opening.hand}. P(X ≥ 1) gives the chance of at least one.</p></details></div>
  </div>
  {#if stats.unresolved}<p class="help" role="status">Card data missing for {stats.unresolved} copies.</p>{/if}
</section>
