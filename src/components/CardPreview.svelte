<script lang="ts">
  import type { CardInfo } from '../lib/model';
  let { preview, onclose }: { preview: { name: string; info: CardInfo } | null; onclose: () => void } = $props();
  let dialog: HTMLDialogElement;
  let flipped = $state(false);
  $effect(() => {
    if (preview && dialog) { flipped = false; if (!dialog.open) dialog.showModal(); }
    else if (dialog?.open) dialog.close();
  });
</script>
<dialog bind:this={dialog} class="card-preview" onclose={onclose} onclick={(e) => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } }} onkeydown={(e) => { if (e.key === 'Escape') dialog.close(); }}>
  {#if preview}<div class="section-heading"><h2>{preview.name}</h2><button class="icon-button" aria-label="Close card preview" onclick={() => dialog.close()}>×</button></div><div class="preview-content">{#if preview.info.image}<div><img src={flipped ? preview.info.backImage : preview.info.image} alt={preview.name} />{#if preview.info.backImage}<button class="secondary" onclick={() => flipped = !flipped}>Flip card</button>{/if}</div>{/if}<div><p>{preview.info.manaCost}</p><p>{preview.info.typeLine}</p><h3>Oracle text</h3><p class="oracle-text">{preview.info.oracleText}</p><p class="muted">{preview.info.setName ?? preview.info.set.toUpperCase()} · {preview.info.collectorNumber} · {preview.info.rarity ?? 'Rarity unavailable'}</p></div></div>{/if}
</dialog>
