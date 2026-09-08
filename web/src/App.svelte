<script lang="ts">
  import CubeView from "./Cube.svelte";
  import { fetchConfig } from "./lib/api";
  import { ha } from "./lib/state.svelte";
  import type { DashboardConfig } from "./lib/types";

  const THEME_PROPERTIES: Record<string, keyof DashboardConfig["theme"]> = {
    "--color-background": "background",
    "--color-foreground": "foreground",
    "--color-muted": "muted",
    "--color-dim": "dim",
    "--color-faint": "faint",
    "--color-spent": "spent",
    "--color-accent": "accent",
  };

  let config = $state<DashboardConfig | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!config) {
      return;
    }

    for (const [property, key] of Object.entries(THEME_PROPERTIES)) {
      document.documentElement.style.setProperty(property, config.theme[key]);
    }
  });

  $effect(() => {
    fetchConfig()
      .then((loaded) => {
        config = loaded;
        ha.connect();
      })
      .catch((reason: Error) => {
        error = reason.message;
      });
  });
</script>

{#if config}
  <CubeView {config} />
  {#if !ha.connected}
    <div class="connection">Reconnecting</div>
  {/if}
{:else if error}
  <div class="blank-face">{error}</div>
{/if}
