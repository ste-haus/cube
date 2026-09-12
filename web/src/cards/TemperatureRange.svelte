<script lang="ts">
  import RangeBar from "./RangeBar.svelte";
  import { ha } from "../lib/state.svelte";
  import { colorAt, cssGradient, gradientBetween, percentAlong } from "../lib/temperature";
  import type { ForecastDay, Weather } from "../lib/types";

  const DEGREE = "°";
  const TEMPERATURE_ATTRIBUTE = "temperature";

  let { weather, days }: { weather: Weather; days: ForecastDay[] } = $props();

  function numeric(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  function degrees(value: number): string {
    return `${Math.round(value)}${DEGREE}`;
  }

  const current = $derived(numeric(ha.attribute<number>(weather.entity_id, TEMPERATURE_ATTRIBUTE)));

  // The day's high and low from the sensors the config names, with the forecast standing in for
  // either one it does not.
  const high = $derived(numeric(ha.reading(weather.high)) ?? days[0]?.high ?? null);
  const low = $derived(numeric(ha.reading(weather.low)) ?? days[0]?.low ?? null);

  // The bar runs between whichever of the extremes and now are furthest apart, so an evening
  // colder than the forecast low moves the end rather than pinning the marker against it.
  const range = $derived.by(() => {
    if (high === null || low === null) {
      return null;
    }

    const readings = current === null ? [low, high] : [low, high, current];

    return { from: Math.min(...readings), to: Math.max(...readings) };
  });
</script>

{#if range}
  <RangeBar
    start={{ value: degrees(range.from) }}
    end={{ value: degrees(range.to) }}
    background={cssGradient(gradientBetween(weather.temperature_gradient, range.from, range.to))}
    position={current === null ? null : percentAlong(current, range.from, range.to)}
    reading={current === null ? null : String(Math.round(current))}
    unit={DEGREE}
    dot={current === null ? null : colorAt(weather.temperature_gradient, current)}
  />
{/if}
