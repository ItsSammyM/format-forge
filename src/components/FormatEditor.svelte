<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import CardSearch from './CardSearch.svelte';
  import CardDetails from './CardDetails.svelte';
  import ValuedListEditor from './ValuedListEditor.svelte';
  import BanListEditor from './BanListEditor.svelte';
  import { uniqueCardNames, normalizeTags, RARITIES, OFFICIAL_FORMAT_NAMES, ruleCardName, validReleaseDate, normalizeFormatLimits } from '../lib/model';
  import type { CardInfo, Format, OfficialFormat, Rarity } from '../lib/model';
  import { loadSets } from '../lib/scryfall';
  import type { ScryfallSet } from '../lib/scryfall';
  let { format, onchange, onback, readOnly = false }: { format: Format; readOnly?: boolean; onchange: (format?: Format) => void; onback: () => void } = $props();
  const initialFormat = untrack(() => format);
  let draft = $state(untrack(() => ({ ...initialFormat, allowedSets: [...initialFormat.allowedSets], banned: [...initialFormat.banned], allowedCards: [...initialFormat.allowedCards ?? []], normalOnly: initialFormat.normalOnly ?? true, allowUnCards: initialFormat.allowUnCards ?? false, banTournamentIllegal: initialFormat.banTournamentIllegal ?? (!initialFormat.whitelistOnly && !initialFormat.officialFormat && (initialFormat.normalOnly ?? true)), bannedRarities: [...initialFormat.bannedRarities ?? []] as Rarity[], pointed: (initialFormat.pointed ?? []).map(c => ({ ...c })), restricted: (initialFormat.restricted ?? []).map(c => ({ ...c })) })));
  let draftTags = $state(untrack(() => (initialFormat.tags ?? []).join(', ')));
  let poolMode = $state(untrack(() => initialFormat.whitelistOnly ? 'list' : initialFormat.officialFormat ?? 'rules')), pendingLegal = $state(false);
  const scryfallFormat = $derived(Object.hasOwn(OFFICIAL_FORMAT_NAMES, poolMode) ? poolMode as OfficialFormat : undefined);
  let eternal = $state(untrack(() => initialFormat.eternal ?? initialFormat.allowedSets.length === 0));
  let maximum = $state<number | undefined>(untrack(() => initialFormat.maxCards ?? undefined));
  let sideMaximum = $state<number | undefined>(untrack(() => initialFormat.maxSideboard ?? undefined));
  let releasedAfter = $state(untrack(() => initialFormat.releasedAfter ?? '')), releasedBefore = $state(untrack(() => initialFormat.releasedBefore ?? ''));
  let restrictedLimit = $state(1);
  let pointValue = $state(1);
  let pointMaximum = $state<number | undefined>(untrack(() => initialFormat.maxPoints));
  let pendingRestricted = $state(false), pendingPoints = $state(false);
  const formatActions = $derived([
    { label: '+ Ban', selectedLabel: 'Banned', disabled: (name: string) => draft.banned.some(n => ruleCardName(n) === ruleCardName(name)), onadd: (name: string) => draft.banned = uniqueCardNames([...draft.banned, name]) },
    ...(poolMode === 'list' ? [{ label: '+ Legal', selectedLabel: 'Legal', disabled: (name: string) => draft.allowedCards.some(n => ruleCardName(n) === ruleCardName(name)), onadd: (name: string) => draft.allowedCards = uniqueCardNames([...draft.allowedCards, name]) }] : []),
    { label: '+ Restrict', selectedLabel: 'Restricted', disabled: (name: string) => draft.restricted.some(c => ruleCardName(c.name) === ruleCardName(name)), onadd: (name: string) => addRestriction(name, 'restricted', restrictedLimit) },
    { label: '+ Points', selectedLabel: 'Pointed', disabled: (name: string) => draft.pointed.some(c => ruleCardName(c.name) === ruleCardName(name)), onadd: (name: string) => addRestriction(name, 'pointed', pointValue) },
  ]);
  function addRestriction(cardName: string, kind: 'restricted' | 'pointed', value: number) {
    const name = cardName.trim();
    if (!name || name.length > 200 || !Number.isInteger(value) || value < (kind === 'restricted' ? 1 : 0) || value > 999) { error = `Enter a card name and a value from ${kind === 'restricted' ? 1 : 0} to 999.`; return; }
    if (kind === 'restricted') draft.restricted = [...draft.restricted.filter(c => ruleCardName(c.name) !== ruleCardName(name)), { name, limit: value }];
    else draft.pointed = [...draft.pointed.filter(c => ruleCardName(c.name) !== ruleCardName(name)), { name, points: value }];  error = '';
  }
  let pendingBans = $state(false);
  let preview = $state<{ name: string; info?: CardInfo } | null>(null);
  let cardMetadata = $state<Record<string, CardInfo>>({});
  function recordCardInfo(name: string, info: CardInfo) { cardMetadata = { ...cardMetadata, [name.trim().toLocaleLowerCase('en-US')]: info }; }
  let setCodes = $state(''), setSearch = $state(''), setLimit = $state(50);
  let sets = $state<ScryfallSet[]>([]), loadingSets = $state(false), setError = $state(''), error = $state('');
  const matchedSets = $derived(sets.filter(s => `${s.name} ${s.code} ${s.released_at?.slice(0, 4) ?? ''}`.toLowerCase().includes(setSearch.toLowerCase())));
  onMount(() => { if (!readOnly || !eternal) void fetchSets(); });
  async function fetchSets() {
    loadingSets = true; setError = '';
    try { sets = await loadSets(); }
    catch (e) { setError = e instanceof Error ? e.message : 'Could not load sets.'; }
    finally { loadingSets = false; }
  }
  function addCodes() {
    const codes = setCodes.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const unknown = codes.filter(c => !/^[a-z0-9]{2,8}$/.test(c) || (sets.length && !sets.some(s => s.code === c)));
    if (unknown.length) { error = `Unknown set codes: ${unknown.join(', ')}.`; return; }
    draft.allowedSets = [...new Set([...draft.allowedSets, ...codes])]; setCodes = ''; error = '';
  }
  function buildFormat(): Format {
    const limits = normalizeFormatLimits({ ...draft, maxCards: maximum, maxSideboard: sideMaximum, maxPoints: pointMaximum });
    const { maxCards, maxSideboard, maxPoints } = limits;
    const tags = normalizeTags(draftTags.split(',')).filter(tag => tag.toLocaleLowerCase() !== 'default');
    return { ...draft, ...limits, tags, copyLimit: draft.copyLimit ?? null, releasedAfter: releasedAfter || undefined, releasedBefore: releasedBefore || undefined, officialFormat: Object.hasOwn(OFFICIAL_FORMAT_NAMES, poolMode) ? poolMode as OfficialFormat : undefined, maxPoints, whitelistOnly: poolMode === 'list', eternal, allowedSets: eternal ? [] : draft.allowedSets, name: draft.name.trim(), maxCards, maxSideboard, banned: uniqueCardNames(draft.banned) };
  }
  function validationError(): string | undefined {
    const { maxCards, maxSideboard, maxPoints, ...limits } = normalizeFormatLimits({ ...draft, maxCards: maximum, maxSideboard: sideMaximum, maxPoints: pointMaximum });
    if (!draft.name.trim()) return 'Enter a format name.';
    if ([draft.minCards, draft.minSideboard].some(n => !Number.isInteger(n) || n < 0 || n > 999) || (draft.copyLimit != null && (!Number.isInteger(draft.copyLimit) || draft.copyLimit < 1 || draft.copyLimit > 999))
      || (maxCards !== null && (!Number.isInteger(maxCards) || maxCards < draft.minCards || maxCards > 999))
      || (maxSideboard !== null && (!Number.isInteger(maxSideboard) || maxSideboard < draft.minSideboard || maxSideboard > 999))) return 'Check the size ranges. Each maximum must be at least its minimum.';
    if (poolMode === 'rules' && !eternal && !draft.allowedSets.length) return 'Choose at least one allowed set or select Eternal.';
    if (poolMode === 'rules' && setCodes.trim()) return 'Add the pasted set codes before saving.';
    if (draft.restricted.some(c => !Number.isInteger(c.limit) || c.limit < 1 || c.limit > 999)) return 'Restricted copy limits must be integers from 1 to 999.';
    if (pendingRestricted || pendingPoints) return 'Apply the pending restricted or pointed card list before saving.';
    if (draft.pointed.some(c => !Number.isInteger(c.points) || c.points < 0 || c.points > 999) || (maxPoints !== undefined && (!Number.isInteger(maxPoints) || maxPoints < 0 || maxPoints > 999))) return 'Points and the point limit must be whole numbers from 0 to 999.';
    if (pendingBans) return 'Import the pasted banned cards before saving.';
    if (draft.allowedCards.length > 50000) return 'Legal card lists support up to 50,000 names.';
    if (poolMode === 'list' && (pendingLegal || !draft.allowedCards.length)) return pendingLegal ? 'Import the pending legal cards before saving.' : 'Import at least one legal card.';
    for (const key of ['minCardPrice', 'maxCardPrice', 'minDeckPrice', 'maxDeckPrice'] as const) {
      const price = limits[key];
      if (price !== undefined && (!Number.isFinite(price) || price < 0 || price > 1000000000)) return 'Price limits must be nonnegative USD amounts.';
    }
    if (limits.minCardPrice !== undefined && limits.maxCardPrice !== undefined && limits.minCardPrice > limits.maxCardPrice || limits.minDeckPrice !== undefined && limits.maxDeckPrice !== undefined && limits.minDeckPrice > limits.maxDeckPrice) return 'Each maximum price must be at least its minimum.';
    if (releasedAfter && !validReleaseDate(releasedAfter) || releasedBefore && !validReleaseDate(releasedBefore) || releasedAfter && releasedBefore && releasedAfter > releasedBefore) return 'Enter valid release dates with the start on or before the end.';
    if (uniqueCardNames(draft.banned).some(n => n.length > 200)) return 'Banned card names must be 200 characters or fewer.';
    try { normalizeTags(draftTags.split(',')); } catch (e) { return e instanceof Error ? e.message : 'Invalid format tags.'; }
  }
  const currentValidationError = $derived(validationError());
  $effect(() => {
    if (readOnly) return;
    if (currentValidationError) return;
    try { const validFormat = buildFormat(); untrack(() => onchange(validFormat)); } catch { /* Keep the last valid saved format. */ }
  });
</script>

<div class="format-editor-layout">
<section class="panel editor-panel">
  <div class="section-heading"><h2>{readOnly ? 'View format' : format.name ? 'Edit format' : 'New format'}</h2><button class="quiet" onclick={onback}>← Formats</button></div>
  {#if readOnly}<p class="help">Default format · read-only. Duplicate it from Formats to customize the rules.</p>{/if}
  {#if !readOnly}<p class="help">Changes save automatically.</p>{/if}
  <form onsubmit={(event) => event.preventDefault()}>
    <label>Format name<input disabled={readOnly} bind:value={draft.name} maxlength="200" required /></label>
    <label>Description<textarea disabled={readOnly} bind:value={draft.description} rows="2" placeholder="A brief description of your format"></textarea></label>
    <label>Tags<input disabled={readOnly} bind:value={draftTags} placeholder="casual, budget, team format" /><small class="help">Separate tags with commas.</small></label>
    <details class="format-rule-dropdown"><summary>Deck and sideboard sizes</summary><div class="rule-dropdown-content form-grid"><label>Minimum deck size<input disabled={readOnly} type="number" bind:value={draft.minCards} min="0" max="999" required /></label><label>Maximum deck size<input disabled={readOnly} type="number" bind:value={maximum} min={draft.minCards} max="999" placeholder="Unlimited" /></label><label>Minimum sideboard<input disabled={readOnly} type="number" bind:value={draft.minSideboard} min="0" max="999" required /></label><label>Maximum sideboard<input disabled={readOnly} type="number" bind:value={sideMaximum} min={draft.minSideboard} max="999" placeholder="Unlimited" /></label></div></details>
    <details class="format-rule-dropdown"><summary>Copy limits</summary><div class="rule-dropdown-content"><label>Copies per card<input disabled={readOnly} type="number" bind:value={draft.copyLimit} min="1" max="999" placeholder="Unlimited" /></label><label class="checkbox-label"><input disabled={readOnly} type="checkbox" bind:checked={draft.basicLandExemption} /> Basic lands ignore copy limit</label></div></details>
    <details class="format-rule-dropdown"><summary>Card pool{poolMode === 'list' ? ` · ${draft.allowedCards.length} cards` : ''}</summary><div class="rule-dropdown-content"><label>Card pool<select disabled={readOnly} bind:value={poolMode}><option value="rules">Sets and eligibility rules</option><option value="list">Legal card list</option>{#each Object.entries(OFFICIAL_FORMAT_NAMES) as [key, name]}<option value={key}>{name} card pool</option>{/each}</select></label>{#if poolMode === 'list'}<p class="help">Only listed cards are legal; bans, restrictions, and points still apply.</p><BanListEditor {readOnly} metadata={cardMetadata} onpreview={(name) => preview = { name }} kind="legal" banned={draft.allowedCards} onchange={(names) => draft.allowedCards = names} onpending={(pending) => pendingLegal = pending} />{:else if Object.hasOwn(OFFICIAL_FORMAT_NAMES, poolMode)}<p class="help">{OFFICIAL_FORMAT_NAMES[poolMode as OfficialFormat]} card pool, bans, and restrictions follow Scryfall legality data.</p>{:else}<label class="checkbox-label"><input disabled={readOnly} type="checkbox" bind:checked={eternal} /> Eternal: all sets</label>
    {#if !eternal}<fieldset class="set-picker"><legend>Allowed sets</legend><p class="help">Choose sets or enable Eternal to allow all sets. A card is legal if it appeared in any selected set, regardless of which printing you use.</p><div class="selected-sets">{#each draft.allowedSets as code}<button disabled={readOnly} class="set-chip" type="button" onclick={() => draft.allowedSets = draft.allowedSets.filter(c => c !== code)} aria-label={`Remove ${code.toUpperCase()} from allowed sets`}>{code.toUpperCase()} ×</button>{/each}{#if draft.allowedSets.length}<button disabled={readOnly} class="quiet" type="button" onclick={() => draft.allowedSets = []}>Clear</button>{/if}</div><label class="sr-only" for="set-search">Find sets</label><input disabled={readOnly} id="set-search" type="search" bind:value={setSearch} oninput={() => setLimit = 50} placeholder="Find a set by name or code" />{#if loadingSets}<p class="help" role="status">Loading sets…</p>{/if}{#if setError}<p class="error" role="alert">{setError}</p><button disabled={readOnly} class="secondary" type="button" onclick={fetchSets}>Retry sets</button>{/if}<div class="set-options">{#each matchedSets.slice(0, setLimit) as set (set.code)}<label class="checkbox-label"><input disabled={readOnly} type="checkbox" value={set.code} bind:group={draft.allowedSets} /><span>{set.name}</span><small>{set.code.toUpperCase()} · {set.released_at?.slice(0, 4) ?? 'Year unknown'}</small></label>{/each}{#if sets.length && !matchedSets.length}<p class="help">No sets match.</p>{/if}{#if matchedSets.length > setLimit}<button disabled={readOnly} class="quiet" type="button" onclick={() => setLimit += 50}>Show more sets</button>{/if}</div><details><summary>Paste set codes</summary><div class="set-code-input"><label class="sr-only" for="set-codes">Set codes</label><input disabled={readOnly} id="set-codes" bind:value={setCodes} placeholder="mh3, dmu, bro" /><button disabled={readOnly} class="secondary" type="button" onclick={addCodes}>Add sets</button></div></details></fieldset>{/if}
    {/if}</div></details>
    <details class="format-rule-dropdown"><summary>Release dates</summary><div class="rule-dropdown-content"><div class="form-grid"><label>Released on or after<input disabled={readOnly} type="date" bind:value={releasedAfter} max={releasedBefore || undefined} /></label><label>Released on or before<input disabled={readOnly} type="date" bind:value={releasedBefore} min={releasedAfter || undefined} /></label></div><p class="help">Dates are inclusive. A card needs a printing within this range and any allowed sets; any edition can be used. Applies to legal lists too. Leave either date blank for no limit.</p></div></details>
    <details class="format-rule-dropdown"><summary>Rarity rules · {draft.bannedRarities.length} banned</summary><div class="rule-dropdown-content"><div class="rarity-choices">{#each RARITIES as rarity}<label class="checkbox-label"><input type="checkbox" value={rarity} bind:group={draft.bannedRarities} disabled={readOnly || poolMode === 'list'} />{rarity[0].toUpperCase() + rarity.slice(1)}</label>{/each}</div><button class="secondary" type="button" disabled={readOnly || poolMode === 'list'} onclick={() => draft.bannedRarities = RARITIES.filter(r => r !== 'common')}>Common only</button><p class="help">{poolMode === 'list' ? 'Legal card lists replace rarity rules.' : 'Any allowed-rarity printing qualifies. Add named Pauper bans separately.'}</p></div></details>
    <details class="format-rule-dropdown"><summary>{scryfallFormat ? `Banned cards · Scryfall + ${draft.banned.length} custom` : `Banned cards · ${draft.banned.length}`}</summary><div class="rule-dropdown-content">{#if scryfallFormat}<p class="help">Scryfall’s {OFFICIAL_FORMAT_NAMES[scryfallFormat]} legality includes its official ban list. The list below adds custom bans.</p>{/if}<label class="checkbox-label"><input disabled={readOnly} type="checkbox" bind:checked={draft.banTournamentIllegal} /> Ban tournament-illegal cards</label><label class="checkbox-label"><input type="checkbox" bind:checked={draft.allowUnCards} disabled={readOnly || !draft.banTournamentIllegal} /> Allow Un-cards (silver border / acorn)</label><label class="checkbox-label"><input disabled={readOnly} type="checkbox" bind:checked={draft.gameplayOnly} /> Exclude noncards (ads, tokens, emblems, art cards)</label><p class="help">Keeps Vintage-legal and restricted cards. The Un-card exception excludes ads and tokens.</p><BanListEditor {readOnly} metadata={cardMetadata} onpreview={(name) => preview = { name }} banned={draft.banned} onchange={(names) => draft.banned = names} onpending={(pending) => pendingBans = pending} /></div></details>
    <details class="format-rule-dropdown"><summary>Restricted cards · {draft.restricted.length}</summary><div class="rule-dropdown-content"><ValuedListEditor {readOnly} metadata={cardMetadata} onpreview={(name) => preview = { name }} kind="restricted" cards={draft.restricted.map(c => ({ name: c.name, value: c.limit }))} onchange={(cards) => draft.restricted = cards.map(c => ({ name: c.name, limit: c.value }))} onpending={(pending) => pendingRestricted = pending} /><p class="help">Maximum copies across active sections; considering is excluded.</p></div></details>
    <details class="format-rule-dropdown"><summary>Points · {draft.pointed.length} cards</summary><div class="rule-dropdown-content"><label>Deck point limit<input disabled={readOnly} type="number" min="0" max="999" bind:value={pointMaximum} placeholder="Unlimited" /></label><ValuedListEditor {readOnly} metadata={cardMetadata} onpreview={(name) => preview = { name }} kind="pointed" cards={draft.pointed.map(c => ({ name: c.name, value: c.points }))} onchange={(cards) => draft.pointed = cards.map(c => ({ name: c.name, points: c.value }))} onpending={(pending) => pendingPoints = pending} /><p class="help">Per copy across active sections. Considering is excluded; unlisted cards cost 0.</p><button disabled={readOnly} type="button" class="secondary" onclick={() => { draft.minCards = 100; maximum = 100; draft.copyLimit = 1; draft.minSideboard = 0; sideMaximum = 0; pointMaximum = 10; draft.basicLandExemption = true; }}>100-card singleton / 10-point defaults</button><a href="https://canadianhighlander.ca/points-list/" target="_blank" rel="noreferrer">Canadian Highlander points ↗</a></div></details>
    <details class="format-rule-dropdown"><summary>Price limits</summary><div class="rule-dropdown-content"><p class="help">USD for the selected printing. Deck totals include sideboard and roles; considering is excluded. Missing prices stay unverified.</p><div class="form-grid"><label>Minimum card price<input disabled={readOnly} type="number" min="0" max="1000000000" step="0.01" bind:value={draft.minCardPrice} placeholder="No minimum" /></label><label>Maximum card price<input disabled={readOnly} type="number" min="0" max="1000000000" step="0.01" bind:value={draft.maxCardPrice} placeholder="No maximum" /></label><label>Minimum deck price<input disabled={readOnly} type="number" min="0" max="1000000000" step="0.01" bind:value={draft.minDeckPrice} placeholder="No minimum" /></label><label>Maximum deck price<input disabled={readOnly} type="number" min="0" max="1000000000" step="0.01" bind:value={draft.maxDeckPrice} placeholder="No maximum" /></label></div></div></details>
    <details class="format-rule-dropdown"><summary>Commander rules</summary><div class="rule-dropdown-content"><label class="checkbox-label"><input disabled={readOnly} type="checkbox" bind:checked={draft.commanderRules} /> Check commanders and color identity</label><label class="checkbox-label"><input disabled={readOnly} type="checkbox" checked={draft.checkCardRoles !== false} onchange={(event) => draft.checkCardRoles = event.currentTarget.checked} /> Check companion and conspiracy roles</label><button disabled={readOnly} class="secondary" type="button" onclick={() => { draft.commanderRules = true; draft.minCards = 100; maximum = 100; draft.minSideboard = 0; sideMaximum = 0; draft.copyLimit = 1; draft.basicLandExemption = true; }}>100-card singleton defaults</button></div></details>
    {#if error || currentValidationError}<p class="error" role="alert">{error || currentValidationError}</p>{/if}
  </form>
</section>

{#if !readOnly}<div class="format-ban-search"><div class="format-search-values"><label>Restrict to<input disabled={readOnly} type="number" min="1" max="999" bind:value={restrictedLimit} /><span>copies</span></label><label>Assign<input disabled={readOnly} type="number" min="0" max="999" bind:value={pointValue} /><span>points</span></label></div><CardSearch mode="ban" {formatActions} onadd={(name) => draft.banned = uniqueCardNames([...draft.banned, name])} onpreview={(name, info) => { recordCardInfo(name, info); preview = { name, info }; }} /></div>{/if}
</div>
{#if preview}<CardDetails card={preview} oninfo={(info) => recordCardInfo(preview!.name, info)} onclose={() => preview = null} />{/if}
