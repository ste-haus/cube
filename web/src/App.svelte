<script lang="ts">
  import BoundaryFallback from "./BoundaryFallback.svelte";
  import CubeView from "./Cube.svelte";
  import { fetchConfig } from "./lib/api";
  import { keepTrying } from "./lib/retry";
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

  const COLOR_PROPERTIES: Record<string, keyof DashboardConfig["colors"]> = {
    "--color-primary": "primary",
    "--color-secondary": "secondary",
    "--color-day": "day",
    "--color-night": "night",
    "--color-twilight": "twilight",
    "--color-sun": "sun",
    "--color-sun-below": "sun_below",
  };

  let config = $state<DashboardConfig | null>(null);

  $effect(() => {
    if (!config) {
      return;
    }

    for (const [property, key] of Object.entries(THEME_PROPERTIES)) {
      document.documentElement.style.setProperty(property, config.theme[key]);
    }

    for (const [property, key] of Object.entries(COLOR_PROPERTIES)) {
      document.documentElement.style.setProperty(property, config.colors[key]);
    }
  });

  $effect(() =>
    keepTrying(fetchConfig, (loaded) => {
      config = loaded;
      ha.connect();
    }),
  );
</script>

<!-- Nobody is going to reload this. A thrown render keeps the last frame on the glass and
     tries again, rather than leaving a black rectangle on the wall until someone notices. -->
<svelte:boundary onerror={(error) => console.error(error)}>
  {#if config}
    <CubeView {config} />
    {#if !ha.connected}
      <div class="connection">Reconnecting</div>
    {/if}
  {/if}

  {#snippet failed(_error, reset)}
    <BoundaryFallback {reset} />
  {/snippet}
</svelte:boundary>
