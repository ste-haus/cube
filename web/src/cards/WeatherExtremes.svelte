<script lang="ts">
  import Icon from "../lib/Icon.svelte";
  import { turningPoint, turningPointHours } from "../lib/format";
  import { ha } from "../lib/state.svelte";
  import type { Extreme, TurningPoint, Weather } from "../lib/types";

  /*
   * The high and the low still to come, each with the hours to its turning point when the sensor
   * gives one. It sits beside `Weather`, the sky and the temperature now.
   */

  const DEGREE = "°";
  const UP = "mdi:arrow-up";
  const DOWN = "mdi:arrow-down";

  let { weather }: { weather: Weather } = $props();

  function turningPointOf(extreme: Extreme | null): TurningPoint | null {
    if (!extreme?.turning_point_attribute) {
      return null;
    }

    return turningPoint(ha.attribute(extreme.entity_id, extreme.turning_point_attribute));
  }
</script>

<section class="weather-extremes">
  {#each [{ extreme: weather.high, arrow: UP }, { extreme: weather.low, arrow: DOWN }] as row (row.arrow)}
    <!-- A turning point, when there is one, is the temperature the line is about; with none the
         line falls back to the state and says nothing of hours. -->
    {@const point = turningPointOf(row.extreme)}
    {@const value = point ? String(Math.round(point.temperature)) : ha.reading(row.extreme)}
    {#if value !== null}
      {@const hours = point ? turningPointHours(point) : null}
      <div class="weather-extremes__row">
        <span class="weather-extremes__value">{value}{DEGREE}</span>
        <span class="weather-extremes__arrow"><Icon name={row.arrow} /></span>
        {#if hours}<span class="weather-extremes__hours">{hours}</span>{/if}
      </div>
    {/if}
  {/each}
</section>

<style>
  .weather-extremes {
    display: flex;
    flex-direction: column;
    gap: 0.45em;
    color: var(--color-muted);
    font-size: 1.75rem;
    font-weight: var(--weight-thin);
    /* The extremes stand off the right edge rather than sitting flush against it. */
    margin-right: 2rem;
  }

  .weather-extremes__value {
    color: var(--color-foreground);
  }

  .weather-extremes__arrow {
    color: var(--color-dim);
  }

  .weather-extremes__row {
    display: flex;
    align-items: center;
    gap: 0.3em;
    white-space: nowrap;
  }

  .weather-extremes__hours {
    color: var(--color-dim);
    font-size: 0.8em;
  }
</style>
