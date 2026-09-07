<script lang="ts">
  import Agenda from "../cards/Agenda.svelte";
  import Camera from "../cards/Camera.svelte";
  import Clock from "../cards/Clock.svelte";
  import Floorplan from "../cards/Floorplan.svelte";
  import Gauges from "../cards/Gauges.svelte";
  import Indicators from "../cards/Indicators.svelte";
  import Notices from "../cards/Notices.svelte";
  import Toggles from "../cards/Toggles.svelte";
  import Transcript from "../cards/Transcript.svelte";
  import Visualizer from "../cards/Visualizer.svelte";
  import Weather from "../cards/Weather.svelte";
  import type { DashboardConfig } from "../lib/types";

  let { config }: { config: DashboardConfig } = $props();
</script>

<div class="dashboard">
  <header class="dashboard__header">
    <Indicators indicators={config.indicators} statusIndicators={config.status_indicators} />
  </header>

  <div class="dashboard__left">
    <Clock clock={config.clock} />
    <Notices notices={config.notices} title={config.labels.notices} />
    <Agenda
      agenda={config.agenda}
      title={config.labels.agenda}
      countEntities={config.item_count_entities}
    />
    <Toggles toggles={config.toggles} />
  </div>

  <div class="dashboard__center">
    <Floorplan floorplans={config.floorplans} initial={config.profile.floorplan} />
  </div>

  <div class="dashboard__right">
    {#if config.weather}
      <Weather weather={config.weather} />
    {/if}
    {#if config.camera}
      <Camera camera={config.camera} />
    {/if}
    <Gauges row={config.fuel} />
  </div>

  <footer class="dashboard__footer">
    {#if config.transcript}
      <Transcript transcript={config.transcript} />
    {/if}
  </footer>
</div>

{#if config.visualizer}
  <Visualizer visualizer={config.visualizer} mediaPlayer={config.profile.media_player} />
{/if}
