<script lang="ts">
  import Icon from "../lib/Icon.svelte";
  import { ha } from "../lib/state.svelte";
  import type { Extreme, Weather } from "../lib/types";

  /** Home Assistant's weather conditions, mapped onto icons. */
  const CONDITION_ICONS: Record<string, string> = {
    "clear-night": "mdi:weather-night",
    cloudy: "mdi:weather-cloudy",
    exceptional: "mdi:alert-circle-outline",
    fog: "mdi:weather-fog",
    hail: "mdi:weather-hail",
    lightning: "mdi:weather-lightning",
    "lightning-rainy": "mdi:weather-lightning-rainy",
    partlycloudy: "mdi:weather-partly-cloudy",
    pouring: "mdi:weather-pouring",
    rainy: "mdi:weather-rainy",
    snowy: "mdi:weather-snowy",
    "snowy-rainy": "mdi:weather-snowy-rainy",
    sunny: "mdi:weather-sunny",
    windy: "mdi:weather-windy",
    "windy-variant": "mdi:weather-windy-variant",
  };

  const FALLBACK_ICON = "mdi:weather-cloudy";
  const DEGREE = "°";
  const SCALE_STEP = 10;
  const SCALE_PER_STEP = 0.05;

  let { weather }: { weather: Weather } = $props();

  const condition = $derived(ha.state(weather.entity_id));
  const icon = $derived(condition ? (CONDITION_ICONS[condition] ?? FALLBACK_ICON) : FALLBACK_ICON);
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
    if (hours === null) {
      return null;
    }

    return `${hours > 0 ? "+" : ""}${hours}h`;
  }
</script>

<section class="weather">
  <div class="weather__now">
    <Icon name={icon} />
    {#if temperature !== null}
      <span class="weather__temperature">{Math.round(temperature)}{DEGREE}</span>
    {/if}

    <div class="weather__extremes">
      {#each [{ extreme: weather.high, arrow: "mdi:arrow-up" }, { extreme: weather.low, arrow: "mdi:arrow-down" }] as row (row.arrow)}
        {@const value = ha.reading(row.extreme)}
        {#if value !== null}
          {@const hours = hoursLabel(row.extreme)}
          <div class="weather__extreme">
            <span>{value}{DEGREE}</span>
            <Icon name={row.arrow} />
            {#if hours}<span class="weather__hours">{hours}</span>{/if}
          </div>
        {/if}
      {/each}
    </div>
  </div>

  {#if summary}
    <p class="weather__summary" style:font-size="{summaryScale}rem">{summary}</p>
  {/if}
</section>

<style>
  .weather__now {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5em;
    font-size: 2rem;
    font-weight: var(--weight-thin);
  }

  .weather__temperature {
    font-size: 2.5rem;
  }

  .weather__extremes {
    display: flex;
    flex-direction: column;
    font-size: 1rem;
  }

  .weather__extreme {
    display: flex;
    align-items: center;
    gap: 0.2em;
    white-space: nowrap;
  }

  .weather__hours {
    color: var(--color-dim);
    font-size: 0.75em;
  }

  .weather__summary {
    margin: 0.4em 0 0 0;
    text-align: center;
    font-weight: var(--weight-light);
  }
</style>
