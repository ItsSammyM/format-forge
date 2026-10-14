<script lang="ts">
  import type { Snippet } from 'svelte';
  let { first, second, value = 50, defaultValue = 50, orientation = 'horizontal', label, onresize, hideFirst = false, hideSecond = false }: { first: Snippet; second: Snippet; value?: number; defaultValue?: number; orientation?: 'horizontal' | 'vertical'; label: string; onresize: (value: number) => void; hideFirst?: boolean; hideSecond?: boolean } = $props();
  let root: HTMLDivElement;
  let draft = $state<number | null>(null);
  const ratio = $derived(draft ?? value);
  const uid = $props.id();
  function update(event: PointerEvent) {
    const bounds = root.getBoundingClientRect();
    const fraction = orientation === 'horizontal' ? (event.clientX - bounds.left) / bounds.width : (event.clientY - bounds.top) / bounds.height;
    draft = Math.max(15, Math.min(85, fraction * 100));
  }
  function start(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault(); (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); update(event);
  }
  function finish() { if (draft !== null) { onresize(Math.round(draft)); draft = null; } }
  function keyboard(event: KeyboardEvent) {
    const decrease = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp', increase = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    if (![decrease, increase, 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    onresize(event.key === 'Home' ? 15 : event.key === 'End' ? 85 : Math.max(15, Math.min(85, value + (event.key === decrease ? -1 : 1) * (event.shiftKey ? 5 : 1))));
  }
</script>
<div bind:this={root} class="split-pane" class:vertical={orientation === 'vertical'} style:grid-template-columns={!hideFirst && !hideSecond && orientation === 'horizontal' ? `minmax(0, ${ratio}fr) 8px minmax(0, ${100 - ratio}fr)` : 'minmax(0, 1fr)'} style:grid-template-rows={!hideFirst && !hideSecond && orientation === 'vertical' ? `minmax(0, ${ratio}fr) 8px minmax(0, ${100 - ratio}fr)` : 'minmax(0, 1fr)'}>
  <div class="split-content" hidden={hideFirst} id={`${uid}-first`}>{@render first()}</div>
  <!-- WAI-ARIA's window splitter pattern is a focusable separator with arrow-key resizing. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="resize-handle" hidden={hideFirst || hideSecond} role="separator" tabindex="0" aria-label={label} aria-orientation={orientation === 'horizontal' ? 'vertical' : 'horizontal'} aria-valuemin="15" aria-valuemax="85" aria-valuenow={Math.round(ratio)} aria-controls={`${uid}-first ${uid}-second`} onpointerdown={start} onpointermove={(e) => { if (draft !== null) update(e); }} onpointerup={finish} onpointercancel={() => draft = null} onkeydown={keyboard} ondblclick={() => onresize(defaultValue)} title={`${label}. Double-click to reset.`}></div>
  <div class="split-content" hidden={hideSecond} id={`${uid}-second`}>{@render second()}</div>
</div>
