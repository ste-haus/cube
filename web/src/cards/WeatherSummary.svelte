<script lang="ts">
  import { ha } from "../lib/state.svelte";
  import type { Weather } from "../lib/types";

  /* The forecast in words, from `weather.summary_entity_id`. Nothing at all when there is none. */

  const SCALE_STEP = 10;
  const SCALE_PER_STEP = 0.05;

  let { weather }: { weather: Weather } = $props();

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
</script>

{#if summary}
  <p class="weather-summary" style:font-size="calc(var(--weather-summary-size) * {summaryScale})">
    {summary}
  </p>
{/if}

<style>
  .weather-summary {
    margin: 0;
    font-weight: var(--weight-light);
    line-height: 1.55;
  }
</style>
