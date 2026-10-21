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
{#if until}<div class="alert" role="status">Card search is paused until {new Date(until).toLocaleTimeString()}. Saved card results remain available. Try again after the pause.</div>{/if}
