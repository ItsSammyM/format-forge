<script lang="ts">
  type Option = { value: string; label: string };

  let {
    search = $bindable(''),
    searchId,
    searchPlaceholder,
    filter = $bindable(''),
    filterOptions = [],
    filterLabel = 'Format',
    filterAllLabel = 'All',
    tags = [],
    tagFilter = $bindable(''),
    sort = $bindable(''),
    sortOptions,
    direction = $bindable<'asc' | 'desc'>('desc'),
    group = $bindable(''),
    groupOptions
  }: {
    search: string;
    searchId: string;
    searchPlaceholder: string;
    filter?: string;
    filterOptions?: Option[];
    filterLabel?: string;
    filterAllLabel?: string;
    tags: string[];
    tagFilter: string;
    sort: string;
    sortOptions: Option[];
    direction: 'asc' | 'desc';
    group: string;
    groupOptions: Option[];
  } = $props();
</script>

<div class="library-toolbar">
  <label for={searchId}>Search<input id={searchId} type="search" bind:value={search} placeholder={searchPlaceholder} /></label>
  {#if filterOptions.length}<label>{filterLabel}<select bind:value={filter}><option value="">{filterAllLabel}</option>{#each filterOptions as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</select></label>{/if}
  <label>Tag<select aria-label="Filter by tag" bind:value={tagFilter}><option value="">All tags</option>{#each tags as tag (tag)}<option value={tag}>{tag}</option>{/each}</select></label>
  <label>Sort<select aria-label="Sort items" bind:value={sort}>{#each sortOptions as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</select></label>
  <label>Order<select aria-label="Sort order" bind:value={direction}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
  <label>Group<select aria-label="Group items" bind:value={group}>{#each groupOptions as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</select></label>
</div>
