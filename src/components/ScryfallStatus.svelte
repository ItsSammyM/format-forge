<script lang="ts">
  import { onMount } from 'svelte';
  import { scryfallClient } from '../lib/scryfall-client';
  let until = $state(0);
  onMount(() => {
    const update = () => until = scryfallClient.cooldownUntil;
    update(); const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  });
</script>
{#if until}<div class="alert" role="status">Scryfall requests are paused until {new Date(until).toLocaleTimeString()}. Cached cards remain available. Retry after the pause.</div>{/if}
