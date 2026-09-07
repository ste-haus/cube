<script lang="ts">
  import CubeView from "./Cube.svelte";
  import { fetchConfig } from "./lib/api";
  import { ha } from "./lib/state.svelte";
  import type { DashboardConfig } from "./lib/types";

  let config = $state<DashboardConfig | null>(null);
  let error = $state<string | null>(null);

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
