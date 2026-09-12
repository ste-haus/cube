<script lang="ts">
  import WeatherIcon from "./WeatherIcon.svelte";
  import { ha } from "../lib/state.svelte";
  import type { Weather } from "../lib/types";

  /*
   * The weather right now: the sky and the temperature. The high and low still to come are a card
   * of their own, `WeatherExtremes`, and so are the forecast's own words, `WeatherSummary`.
   *
   * The sky's glyph carries a wide transparent border for its animation to move within, so a face
   * placing this card pulls it back up by that much rather than paying for it twice.
   */

  const DEGREE = "°";
  const SUN_UP = "above_horizon";
  const TEMPERATURE_ATTRIBUTE = "temperature";

  let { weather }: { weather: Weather } = $props();

  const condition = $derived(ha.state(weather.entity_id));
  const sunState = $derived(ha.state(weather.sun_entity_id));
  // With no sun entity configured there is nothing to distinguish, so draw the daytime icon.
  const daytime = $derived(sunState === null || sunState === SUN_UP);
  const temperature = $derived(ha.attribute<number>(weather.entity_id, TEMPERATURE_ATTRIBUTE));
</script>

<section class="weather">
  <WeatherIcon {condition} {daytime} />
  {#if temperature !== null}
    <span class="weather__temperature">{Math.round(temperature)}{DEGREE}</span>
  {/if}
</section>

<style>
  .weather {
    display: flex;
    align-items: center;
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
</style>
