<script lang="ts" module>
  import { fetchIcons } from "./api";

  /** Fetched once for the page; every icon reads the same map. */
  const custom = $state<{ paths: Record<string, string> }>({ paths: {} });

  fetchIcons().then((paths) => {
    custom.paths = paths;
  });
</script>

<script lang="ts">
  const MDI_PREFIX = "mdi:";
  const VIEWBOX = "0 0 24 24";

  let { name, color }: { name: string | null | undefined; color?: string | null } = $props();

  // Material icons come from the bundled webfont; anything else is looked up in the
  // installation's own set, which supplies a bare path on a 24-unit grid.
  const font = $derived(name?.startsWith(MDI_PREFIX) ? `mdi mdi-${name.slice(MDI_PREFIX.length)}` : null);
  const path = $derived(name && !font ? (custom.paths[name] ?? null) : null);
</script>

{#if font}
  <i class={font} style:color aria-hidden="true"></i>
{:else if path}
  <svg class="icon" viewBox={VIEWBOX} style:color aria-hidden="true"><path d={path} fill="currentColor" /></svg>
{/if}

<style>
  .icon {
    display: inline-block;
    width: 1em;
    height: 1em;
    vertical-align: -0.125em;
  }
</style>
