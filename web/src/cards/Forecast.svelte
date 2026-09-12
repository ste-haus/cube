<script lang="ts">
  import ForecastChart from "./ForecastChart.svelte";
  import { swipeable, type Direction } from "../lib/cube.svelte";
  import { hourChart, minimumSpread, weekChart } from "../lib/forecast.svelte";
  import { nextLevel } from "../lib/levels";
  import { Lapsing, PANE_RESET_MS } from "../lib/panes.svelte";
  import { ha } from "../lib/state.svelte";
  import type { ForecastDay, ForecastHour, Labels, Weather } from "../lib/types";

  /*
   * The next hours, and the week a swipe away.
   *
   * The two sit side by side and slide, the way the floorplan's storeys do, and the card goes back
   * to the hours a minute after it was last swiped, the way the floorplan goes back to its own
   * storey. Only a sideways swipe is the card's; an upward or downward one still turns the cube.
   * A weather that forecasts no hours leaves the week on its own, with nothing to swipe to.
   */

  const HOURS_PANE = "hours";
  const WEEK_PANE = "week";
  const PERCENT = 100;

  const LATITUDE_ATTRIBUTE = "latitude";
  const LONGITUDE_ATTRIBUTE = "longitude";
  const TEMPERATURE_ATTRIBUTE = "temperature";
  const TEMPERATURE_UNIT_ATTRIBUTE = "temperature_unit";
  const SUN_UP = "above_horizon";

  let {
    weather,
    labels,
    days,
    hours,
  }: { weather: Weather; labels: Labels; days: ForecastDay[]; hours: ForecastHour[] } = $props();

  const latitude = $derived(ha.attribute<number>(weather.zone_entity_id, LATITUDE_ATTRIBUTE));
  const longitude = $derived(ha.attribute<number>(weather.zone_entity_id, LONGITUDE_ATTRIBUTE));

  /* The weather as it is now, which the hours open on in place of the forecast's: the same
   * temperature, sky, and day or night the rest of the face shows. */
  const live = $derived.by(() => {
    const reading = Number(ha.attribute<number>(weather.entity_id, TEMPERATURE_ATTRIBUTE) ?? Number.NaN);
    const sun = ha.state(weather.sun_entity_id);

    return {
      temperature: Number.isFinite(reading) ? reading : null,
      condition: ha.state(weather.entity_id),
      daytime: sun === null ? null : sun === SUN_UP,
    };
  });

  const spread = $derived(minimumSpread(ha.attribute<string>(weather.entity_id, TEMPERATURE_UNIT_ATTRIBUTE)));

  const hourly = $derived(hourChart(hours, latitude, longitude, labels.now, live, spread));
  const weekly = $derived(weekChart(days, spread));

  const panes = $derived(hours.length > 0 ? [HOURS_PANE, WEEK_PANE] : [WEEK_PANE]);

  const choice = new Lapsing<string>(PANE_RESET_MS);
  const current = $derived(choice.chosen !== null && panes.includes(choice.chosen) ? choice.chosen : panes[0]);
  const index = $derived(panes.indexOf(current));

  function step(direction: Direction): void {
    choice.choose(nextLevel(panes, current, direction));
  }
</script>

<section class="forecast-card" use:swipeable={{ onSwipe: step, axes: "horizontal", exclusive: true }}>
  <div class="forecast-card__track" style:transform="translateX({-index * PERCENT}%)">
    {#each panes as pane (pane)}
      {@const chart = pane === HOURS_PANE ? hourly : weekly}
      <div class="forecast-card__pane">
        <ForecastChart columns={chart.columns} lines={chart.lines} span={chart.span} snow={chart.snow} />
      </div>
    {/each}
  </div>
</section>

<style>
  .forecast-card {
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  /* The floorplan's own slide, so the two cards move alike. */
  .forecast-card__track {
    display: flex;
    height: 100%;
    transition: transform var(--floorplan-slide-duration) ease-in-out;
  }

  /* Clipped, so the week's first rule, which sits on the seam between the two, does not show as a
   * hairline down the edge of the hours. */
  .forecast-card__pane {
    flex: 0 0 100%;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }</style>
