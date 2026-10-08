<script lang="ts">
  import Camera from "../cards/Camera.svelte";
  import Clock from "../cards/Clock.svelte";
  import Forecast from "../cards/Forecast.svelte";
  import Gauges from "../cards/Gauges.svelte";
  import IncidentBanner from "../cards/IncidentBanner.svelte";
  import Indicators from "../cards/Indicators.svelte";
  import Transcript from "../cards/Transcript.svelte";
  import TravelTimes from "../cards/TravelTimes.svelte";
  import Visualizer from "../cards/Visualizer.svelte";
  import Weather from "../cards/Weather.svelte";
  import WeatherExtremes from "../cards/WeatherExtremes.svelte";
  import { faceVisibility } from "../lib/cube.svelte";
  import { forecast } from "../lib/forecast.svelte";
  import { DEFAULT_CRITICAL_COLOUR } from "../lib/incidents";
  import { ha } from "../lib/state.svelte";
  import { shownMap } from "../lib/travel";
  import type { DashboardConfig, DepartureFaceOptions } from "../lib/types";

  /*
   * What to look at on the way out: the traffic, how long the trips under way will take, and
   * how much fuel there is to take them on.
   *
   * The clock, the header's indicators, and the weather now with today's high and low are where
   * they are on the dashboard, so turning between the two moves none of them.
   *
   * Under them, the map and, beside it, the travel times with the dashboard's own fuel
   * gauges straight under them and the forecast under those stand together as one block, against
   * the top and centred across the face. While there are traffic incidents, a band naming their
   * roads drops down between the map's heading and the map. The map is the first of `map` whose
   * `visible_when` is on, else the last; a swap rebuilds the camera, so the one swapped out stops
   * fetching and the one swapped in fetches at once.
   *
   * The announcement and its overlay are here as on the dashboard, since the house speaks to
   * whoever is looking at the panel, whichever face that is.
   */

  let { config, options }: { config: DashboardConfig; options: DepartureFaceOptions } = $props();

  const visibility = faceVisibility();
  const map = $derived(shownMap(options.map, (entityId) => ha.isOn(entityId)));

  /* The forecast is fetched per panel, so only while this face is being looked at. */
  $effect(() => {
    if (!visibility.showing || !config.weather) {
      return;
    }

    forecast.start();

    return () => forecast.stop();
  });
</script>

<div class="dashboard departure-face">
  <header class="dashboard__header">
    <Indicators indicators={config.indicators} statusIndicators={config.status_indicators} />
  </header>

  <div class="dashboard__left">
    <Clock clock={config.clock} />
  </div>

  {#if config.weather}
    <div class="departure-face__weather">
      <div class="dashboard__conditions">
        <Weather weather={config.weather} />
        <WeatherExtremes weather={config.weather} />
      </div>
    </div>
  {/if}

  <div class="departure-face__main">
    <div class="departure-face__map">
      {#key map.entity_id}
        <Camera camera={map}>
          {#snippet banner()}
            {#if options.incidents_entity_id}
              <IncidentBanner
                entityId={options.incidents_entity_id}
                criticalColour={config.mcw?.warning_color ?? DEFAULT_CRITICAL_COLOUR}
                labels={config.labels}
              />
            {/if}
          {/snippet}
        </Camera>
      {/key}
    </div>

    <div class="departure-face__rail">
      <TravelTimes {options} labels={config.labels} />
      <Gauges row={config.fuel} />
      {#if config.weather}
        <section class="departure-face__forecast">
          <h2 class="panel-title panel-title--right">{config.labels.forecast}</h2>
          <Forecast weather={config.weather} labels={config.labels} days={forecast.days} hours={forecast.hours} />
        </section>
      {/if}
    </div>
  </div>

  {#if config.transcript}
    <Transcript transcript={config.transcript} mediaPlayer={config.profile.media_player} />
  {/if}
</div>

{#if config.visualizer && visibility.showing}
  <Visualizer visualizer={config.visualizer} mediaPlayer={config.profile.media_player} />
{/if}
