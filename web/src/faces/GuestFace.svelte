<script lang="ts">
  import AlarmClock from "../cards/AlarmClock.svelte";
  import Clock from "../cards/Clock.svelte";
  import Forecast from "../cards/Forecast.svelte";
  import Indicators from "../cards/Indicators.svelte";
  import LightDial from "../cards/LightDial.svelte";
  import Sliders from "../cards/Sliders.svelte";
  import TemperatureRange from "../cards/TemperatureRange.svelte";
  import Toggles from "../cards/Toggles.svelte";
  import Transcript from "../cards/Transcript.svelte";
  import Visualizer from "../cards/Visualizer.svelte";
  import Weather from "../cards/Weather.svelte";
  import WeatherExtremes from "../cards/WeatherExtremes.svelte";
  import WeatherSummary from "../cards/WeatherSummary.svelte";
  import Wifi from "../cards/Wifi.svelte";
  import { faceVisibility } from "../lib/cube.svelte";
  import { forecast } from "../lib/forecast.svelte";
  import type { DashboardConfig, GuestFaceOptions } from "../lib/types";

  /*
   * A guest room's front: what a guest needs and nothing of the household's.
   *
   * It is laid out on the dashboard's grid, so the header, the clock, and the weather are where
   * they are on the dashboard. The left is the clock, how to join the network, and the alarm; the
   * middle is the room, its light large and its bars and chips under it; the right is the weather
   * and its forecast in words, today's range, and the forecast. A guest face shows no notices,
   * agenda, or floorplan: those are the household's.
   *
   * The announcement and its overlay are here as on the dashboard, since this is the face a guest
   * is looking at when the house speaks.
   */

  let { config, options }: { config: DashboardConfig; options: GuestFaceOptions } = $props();

  const visibility = faceVisibility();

  /* The forecast is fetched per panel, so only while this face is being looked at. */
  $effect(() => {
    if (!visibility.showing || !config.weather) {
      return;
    }

    forecast.start();

    return () => forecast.stop();
  });
</script>

<div class="dashboard guest-face">
  <header class="dashboard__header">
    <Indicators indicators={config.indicators} statusIndicators={config.status_indicators} />
  </header>

  <div class="dashboard__left">
    <Clock clock={config.clock} />
    {#if options.wifi}
      <Wifi wifi={options.wifi} labels={config.labels} />
    {/if}
    {#if options.alarm}
      <AlarmClock alarm={options.alarm} labels={config.labels} />
    {/if}
  </div>

  <div class="dashboard__center guest-face__center">
    {#if options.light}
      <LightDial light={options.light} defaultXy={config.light.default_xy} labels={config.labels} />
    {/if}
    {#if options.sliders?.length}
      <Sliders sliders={options.sliders} />
    {/if}
    {#if options.toggles?.length}
      <Toggles toggles={options.toggles} />
    {/if}
  </div>

  <div class="dashboard__right guest-face__right">
    {#if config.weather}
      <div class="dashboard__conditions">
        <Weather weather={config.weather} />
        <WeatherExtremes weather={config.weather} />
      </div>
      <WeatherSummary weather={config.weather} />
      <div class="guest-face__range">
        <TemperatureRange weather={config.weather} days={forecast.days} />
      </div>
      <Forecast weather={config.weather} labels={config.labels} days={forecast.days} hours={forecast.hours} />
    {/if}
  </div>

  {#if config.transcript}
    <Transcript transcript={config.transcript} mediaPlayer={config.profile.media_player} />
  {/if}
</div>

{#if config.visualizer && visibility.showing}
  <Visualizer visualizer={config.visualizer} mediaPlayer={config.profile.media_player} />
{/if}
