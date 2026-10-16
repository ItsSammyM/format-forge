<script lang="ts">
  import { deckPrice, deckPoints } from '../lib/model';
  import type { Deck, Format } from '../lib/model';
  import { deckStats, MANA_COLORS, openingHandStats, handFilterOptions } from '../lib/deck-stats';
  import type { HandFilterKind } from '../lib/deck-stats';
  import ManaSymbols from './ManaSymbols.svelte';
  let { deck, format, open = true, onclose }: { deck: Deck; format: Format; open?: boolean; onclose?: () => void } = $props();
  let handSize = $state(7);
  let selected = $state('type:Land');
  let comparison = $state<'=' | '<=' | '>='>('=');
  const options = $derived(handFilterOptions(deck, format));
  let numericValue = $state<number | undefined>(0);
  const kind = $derived(selected.slice(0, selected.indexOf(':')) as HandFilterKind);
  const numericFilter = $derived(kind === 'manaValue' || kind === 'points' || kind === 'price');
  const comparable = $derived(numericFilter || kind === 'rarity' && ['common', 'uncommon', 'rare', 'mythic'].includes(selected.slice(selected.indexOf(':') + 1)));
  const filter = $derived({ kind, value: numericFilter ? String(numericValue ?? '') : selected.slice(selected.indexOf(':') + 1), comparison: comparable ? comparison : '=' as const });
  const selectedLabel = $derived(options.groups.flatMap(group => group.options).find(option => `${option.kind}:${option.value}` === selected)?.label ?? filter.value);
  const opening = $derived(openingHandStats(deck, handSize, filter, format));
  const stats = $derived(deckStats(deck, handSize));
  const price = $derived(deckPrice(deck));
  const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  const peak = $derived(Math.max(1, ...stats.curve.map(b => b.count)));
  const number = (n: number) => Number(n.toFixed(2)).toString();
</script>
<section hidden={!open} class="panel deck-stats" aria-label="Deck statistics">
  <div class="section-heading stats-heading"><h2>Deck stats</h2><div class="stats-price-summary"><span>Total deck price</span><strong>{money(price.total)}</strong><span>Total points</span><strong>{deckPoints(deck, format)}</strong>{#if price.missing}<span class="help" role="status">Subtotal · {price.missing} {price.missing === 1 ? 'copy unpriced' : 'copies unpriced'}</span>{/if}</div>{#if onclose}<button class="section-close" aria-label="Close deck stats" onclick={onclose}>×</button>{/if}</div>

  <div class="stats-grid">
    <div><h2>Mana curve</h2><div class="mana-curve" role="img" aria-label={`Nonland cards by mana value: ${stats.curve.map(b => `${b.label}: ${b.count}`).join(', ')}`}>
      {#each stats.curve as bucket}<div class="curve-column"><span>{bucket.count}</span><div class="curve-track"><div class="curve-bar" style:height={`${bucket.count / peak * 100}%`}></div></div><span>{bucket.label}</span></div>{/each}
    </div>{#if stats.curveUnknown}<p class="help">Mana value unknown: {stats.curveUnknown} copies.</p>{/if}</div>
    <div><h2>Mana pips</h2><table class="pip-table"><thead><tr><th>Color</th><th>Pips</th><th>Share</th></tr></thead><tbody>{#each MANA_COLORS as color}<tr><td><ManaSymbols symbols={[color]} /></td><td>{number(stats.pips[color])}</td><td>{stats.totalColored ? (100 * stats.pips[color] / stats.totalColored).toFixed(1) : '0.0'}%</td></tr>{/each}{#if stats.pips.C}<tr><td><ManaSymbols symbols={['C']} /></td><td>{number(stats.pips.C)}</td><td>—</td></tr>{/if}</tbody></table><p class="help">By casting cost. Hybrid pips split; generic excluded.</p></div>
    <div><h2>Opening hand</h2><div class="hand-controls"><label>Count<select aria-label="Cards to count" bind:value={selected}>{#each options.groups as group}<optgroup label={group.label}>{#each group.options as option}<option value={`${option.kind}:${option.value}`}>{option.label}</option>{/each}</optgroup>{/each}</select></label><label>Hand size<input type="number" min="0" max="999" bind:value={handSize} /></label>{#if comparable}<div class="hand-numeric-controls"><label class="sr-only" for="hand-comparison">Comparison</label><select id="hand-comparison" aria-label="Count comparison" bind:value={comparison}><option value="=">Exactly</option><option value="<=">At most</option><option value=">=">At least</option></select>{#if numericFilter}<label class="sr-only" for="hand-threshold">{kind === 'price' ? 'Price in USD' : kind === 'manaValue' ? 'Mana value' : 'Points per copy'}</label><input id="hand-threshold" aria-label={kind === 'price' ? 'Price in USD' : kind === 'manaValue' ? 'Mana value' : 'Points per copy'} type="number" min="0" step={kind === 'price' ? '0.01' : kind === 'manaValue' ? 'any' : '1'} bind:value={numericValue} />{/if}</div>{/if}</div><p class="expected-lands"><strong>{opening.expected.toFixed(2)}</strong> average matching cards</p><p class="help">{kind === 'colorIdentity' ? 'Identity: ' : kind === 'colors' ? 'Color: ' : ''}{kind === 'rarity' && comparable ? `Rarity ${comparison === '<=' ? '≤' : comparison === '>=' ? '≥' : '='} ${selectedLabel.toLowerCase()}` : selectedLabel}{numericFilter ? ` ${comparison === '<=' ? '≤' : comparison === '>=' ? '≥' : '='} ${numericValue == null ? '…' : kind === 'price' ? money(numericValue) : numericValue}` : ''}</p>{#if kind === 'price' || kind === 'rarity' || kind === 'set'}<p class="help">Selected printings{kind === 'price' ? ' · cached USD prices' : ''}</p>{/if}<p class="help">{opening.matches} of {opening.size} cards · before mulligans</p>{#if opening.unresolved}<p class="help">Selected property unknown for {opening.unresolved} copies.</p>{/if}<a href="https://stattrek.com/online-calculator/hypergeometric" target="_blank" rel="noreferrer">Hypergeometric calculator ↗</a><details class="calculator-help"><summary>Calculator inputs</summary><p class="help">Population: {opening.size}. Successes: {opening.matches}. Sample: {opening.hand}. P(X ≥ 1) gives the chance of at least one.</p></details></div>
  </div>
  {#if stats.unresolved}<p class="help" role="status">Card data missing for {stats.unresolved} copies.</p>{/if}
</section>
