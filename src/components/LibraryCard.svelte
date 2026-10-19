<script lang="ts">
  import type { Snippet } from 'svelte';

  let { cardClass, actionsClass, onopen, children, actions }: {
    cardClass: string;
    actionsClass: string;
    onopen: () => void;
    children: Snippet;
    actions: Snippet;
  } = $props();
</script>

<article class={`library-card ${cardClass}`}>
  <button type="button" class="library-card-open" onclick={onopen}>
    {@render children()}
  </button>
  <div class={`library-card-actions ${actionsClass}`}>
    {@render actions()}
  </div>
</article>
