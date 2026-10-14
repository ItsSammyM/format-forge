<script lang="ts">
  import { parseCardNames, uniqueCardNames } from '../lib/model';
  import { download } from '../lib/storage';
  let { banned, onchange, onpending, onpreview, kind = 'banned' }: { banned: string[]; onchange: (names: string[]) => void; onpending: (pending: boolean) => void; onpreview: (name: string) => void; kind?: 'banned' | 'legal' } = $props();
  let listLimit = $state(100);
  let input = $state(''), mode = $state('append'), exportStyle = $state('names'), error = $state(''), copied = $state(false);
  const text = $derived(banned.map(n => `${exportStyle === 'quantity' ? '1 ' : ''}${n}`).join('\n') + (banned.length ? '\n' : ''));
  const uid = $props.id();
  $effect(() => { onpending(input.trim().length > 0); });
  $effect(() => { text; copied = false; });
  function apply() {
    try { const names = mode === 'replace' && !input.trim() ? [] : parseCardNames(input); onchange(mode === 'replace' ? names : uniqueCardNames([...banned, ...names])); input = ''; error = ''; }
    catch (e) { error = e instanceof Error ? e.message : 'Could not read the card list.'; }
  }
  async function readFile(event: Event) {
    const field = event.currentTarget as HTMLInputElement, file = field.files?.[0];
    if (!file) return;
    try { if (file.size > 1024 * 1024) throw new Error('Choose a list smaller than 1 MB.'); input = await file.text(); }
    catch (e) { error = e instanceof Error ? e.message : 'Could not read file.'; }
    finally { field.value = ''; }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(text); copied = true; }
    catch { error = 'Clipboard unavailable. Select the export text or download the list.'; }
  }
</script>
<fieldset class="ban-list-editor"><legend>{kind === 'legal' ? 'Legal cards' : 'Banned cards'} · {banned.length}</legend><div class="banned-card-list">{#each banned.slice(0, listLimit) as name}<div class="rule-card-row"><button type="button" class="rule-card-name" data-card-open={name} onclick={() => onpreview(name)} aria-label={`View ${name}`}>{name}</button><button type="button" class="quiet danger" aria-label={`${kind === 'legal' ? 'Remove' : 'Unban'} ${name}`} onclick={() => onchange(banned.filter(n => n !== name))}>Remove</button></div>{/each}{#if banned.length > listLimit}<button class="quiet" type="button" onclick={() => listLimit += 100}>Show more cards</button>{/if}{#if !banned.length}<p class="help">No {kind} cards.</p>{/if}</div><details open={kind === 'legal'}><summary>Import / edit / export</summary><label>Card list<textarea bind:value={input} rows="5" placeholder="Lightning Bolt&#10;1 Sol Ring (CMM) 396"></textarea></label><div class="transfer-actions"><label class="file-button secondary">Load .txt<input type="file" accept=".txt,text/plain" onchange={readFile} /></label><select aria-label={`${kind} card list import mode`} bind:value={mode}><option value="append">Add / update</option><option value="replace">Replace list</option></select><button type="button" class="secondary" onclick={() => { input = text; mode = 'replace'; }}>Edit current list</button><button type="button" class="primary" onclick={apply}>Apply list</button></div><label class="ban-export-style">Export format<select bind:value={exportStyle} onchange={() => copied = false}><option value="names">Card names</option><option value="quantity">Quantity and name</option></select></label><label class="sr-only" for={`${uid}-export`}>Exported {kind} cards</label><textarea id={`${uid}-export`} value={text} readonly rows="4"></textarea><div class="transfer-actions"><button type="button" class="secondary" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button><button type="button" class="secondary" onclick={() => download(text, `${kind}-cards.txt`, 'text/plain')}>Download</button></div></details>{#if error}<p class="error" role="alert">{error}</p>{/if}</fieldset>
