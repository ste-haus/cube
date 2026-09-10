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
  import { agenda } from "../lib/agenda.svelte";
  import { faceVisibility } from "../lib/cube.svelte";
  import type { DashboardConfig } from "../lib/types";

  let { config }: { config: DashboardConfig } = $props();

  const visibility = faceVisibility();

  /* Calendars are fetched per panel, so a face turned away should not be asking for them. The
   * poll loads once on the way back, which is sooner than the interval would have come round
   * anyway. */
  $effect(() => {
    if (!visibility.showing) {
      return;
    }

    agenda.start();

    return () => agenda.stop();
  });
</script>

<div class="dashboard">
  <header class="dashboard__header">
    <Indicators indicators={config.indicators} statusIndicators={config.status_indicators} />
  </header>

  <div class="dashboard__left">
    <Clock clock={config.clock} />
    <Notices notices={config.notices} title={config.labels.notices} calendars={config.agenda.calendars} />
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

<!-- The overlay is a picture of a sound, and there is nobody in front of it to see one while
     the cube is turned elsewhere. Gating it here keeps a hidden face from pulling the
     announcement audio down and animating it to a screen that is not being painted. -->
{#if config.visualizer && visibility.showing}
  <Visualizer visualizer={config.visualizer} mediaPlayer={config.profile.media_player} />
{/if}
