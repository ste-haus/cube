<script lang="ts">
  import Icon from "../lib/Icon.svelte";
  import WeatherIcon from "./WeatherIcon.svelte";
  import { ha } from "../lib/state.svelte";
  import type { Extreme, Weather } from "../lib/types";

  const DEGREE = "°";
  const SCALE_STEP = 10;
  const SCALE_PER_STEP = 0.05;

  let { weather }: { weather: Weather } = $props();

  const SUN_UP = "above_horizon";

  const condition = $derived(ha.state(weather.entity_id));
  const sunState = $derived(ha.state(weather.sun_entity_id));
  // With no sun entity configured there is nothing to distinguish, so draw the daytime icon.
  const daytime = $derived(sunState === null || sunState === SUN_UP);
  const temperature = $derived(ha.attribute<number>(weather.entity_id, "temperature"));
  const summary = $derived(ha.state(weather.summary_entity_id));

  // A wordier forecast is set smaller so it still fits the panel rather than overrunning it.
  const summaryScale = $derived.by(() => {
    if (!summary) {
      return weather.summary_max_scale;
    }

    const overflow = summary.length - weather.summary_max_length;
    if (overflow <= 0) {
      return weather.summary_max_scale;
    }

    const reduced = weather.summary_max_scale - Math.round(overflow / SCALE_STEP) * SCALE_PER_STEP;

    return Math.max(reduced, weather.summary_min_scale);
  });

  function hoursLabel(extreme: Extreme | null): string | null {
    if (!extreme?.hours_attribute) {
      return null;
    }

    const hours = ha.attribute<number>(extreme.entity_id, extreme.hours_attribute);
    if (hours === null || hours === 0) {
      return null;
    }

    return `${hours > 0 ? "+" : ""}${hours}h`;
  }
</script>

<section class="weather">
  <div class="weather__now">
    <WeatherIcon {condition} {daytime} />
    {#if temperature !== null}
      <span class="weather__temperature">{Math.round(temperature)}{DEGREE}</span>
    {/if}

    <div class="weather__extremes">
      {#each [{ extreme: weather.high, arrow: "mdi:arrow-up" }, { extreme: weather.low, arrow: "mdi:arrow-down" }] as row (row.arrow)}
        {@const value = ha.reading(row.extreme)}
        {#if value !== null}
          {@const hours = hoursLabel(row.extreme)}
          <div class="weather__extreme">
            <span class="weather__extreme-value">{value}{DEGREE}</span>
            <span class="weather__arrow"><Icon name={row.arrow} /></span>
            {#if hours}<span class="weather__hours">{hours}</span>{/if}
          </div>
        {/if}
      {/each}
    </div>
  </div>

  {#if summary}
    <p class="weather__summary" style:font-size="calc(var(--weather-summary-size) * {summaryScale})">
      {summary}
    </p>
  {/if}
</section>

<style>
  /* The glyph's box carries a wide transparent border for its animation to move within. The
   * layout should not pay for that twice, so it is pulled back out here. */
  .weather__now {
    margin-top: -2rem;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.9rem;
    font-size: var(--weather-icon-size);
    font-weight: var(--weight-thin);
    color: var(--color-muted);
  }

  .weather__temperature {
    color: var(--color-foreground);
    font-size: var(--weather-temp-size);
    font-weight: var(--weight-thin);
  }

  .weather__extremes {
    display: flex;
    flex-direction: column;
    gap: 0.45em;
    font-size: 1.75rem;
    /* The extremes stand off the right edge rather than sitting flush against it. */
    margin-right: 2rem;
  }

  .weather__extreme-value {
    color: var(--color-foreground);
  }

  .weather__arrow {
    color: var(--color-dim);
  }

  .weather__extreme {
    display: flex;
    align-items: center;
    gap: 0.3em;
    white-space: nowrap;
  }

  .weather__hours {
    color: var(--color-dim);
    font-size: 0.8em;
  }

  .weather__summary {
    margin: 0.8em 0 0 0;
    font-weight: var(--weight-light);
    line-height: 1.55;
  }
</style>
