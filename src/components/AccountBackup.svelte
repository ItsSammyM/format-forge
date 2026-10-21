<script lang="ts">
  import { onMount } from 'svelte';
  import type { Library } from '../lib/model';
  import { backupText } from '../lib/transfer';
  import { download } from '../lib/storage';

  let { library, onrestore, onclose }: {
    library: Library;
    onrestore: (raw: string, filename: string) => boolean;
    onclose: () => void;
  } = $props();
  let dialog: HTMLDialogElement;
  let error = $state('');

  onMount(() => dialog.showModal());

  async function restore(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 40 * 1024 * 1024) throw new Error('Choose a backup smaller than 40 MB.');
      if (onrestore(await file.text(), file.name)) onclose();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not restore the account backup.';
    } finally {
      input.value = '';
    }
  }
</script>

<dialog bind:this={dialog} class="library-transfer-dialog" onclose={onclose}>
  <div class="section-heading"><h2>Account backup</h2><button class="section-close" aria-label="Close account backup" onclick={onclose}>×</button></div>
  <p class="help">Includes your library, preferred printings, and settings.</p>
  <div class="transfer-actions">
    <button class="primary" onclick={() => download(backupText(library), `format-forge-account-${new Date().toISOString().slice(0, 10)}.backup.json`)}>Back up account</button>
    <label class="file-button secondary">Restore account backup<input type="file" accept=".json,application/json" onchange={restore} /></label>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</dialog>
