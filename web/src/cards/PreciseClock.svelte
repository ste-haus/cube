<script lang="ts">
  import { faceVisibility } from "../lib/cube.svelte";
  import { strftime } from "../lib/format";
  import { ha } from "../lib/state.svelte";
  import type { Labels, NetworkClock } from "../lib/types";

  const TIME_FORMAT = "%H:%M:%S";
  const TICK_MS = 1000;
  const MS_PER_MINUTE = 60_000;
  const OFFSET_DECIMALS = 1;
  const UNIT_ATTRIBUTE = "unit_of_measurement";
  const MEASURE_REM = 1;
  const PLUS = "+";
  const MINUS = "−";

  let { clock, labels }: { clock: NetworkClock; labels: Labels } = $props();

  const visibility = faceVisibility();

  let now = $state(new Date());

  /* A clock nobody is looking at does not need to be right, so it only ticks while the face is in view. */
  $effect(() => {
    if (!visibility.showing) {
      return;
    }

    now = new Date();

    const timer = window.setInterval(() => {
      now = new Date();
    }, TICK_MS);

    return () => window.clearInterval(timer);
  });

  const time = $derived(strftime(now, TIME_FORMAT));

  // strftime reads local time, so UTC is local time moved by the zone's offset.
  const utc = $derived(
    strftime(new Date(now.getTime() + now.getTimezoneOffset() * MS_PER_MINUTE), TIME_FORMAT),
  );

  /* Signed either way, since which side of its source the clock has drifted to is half of it. */
  const offset = $derived.by(() => {
    const reading = ha.state(clock.ntp_entity_id);
    const value = Number(reading);
    if (reading === null || reading === "" || !Number.isFinite(value)) {
      return null;
    }

    const sign = value < 0 ? MINUS : PLUS;
    const unit = ha.attribute<string>(clock.ntp_entity_id, UNIT_ATTRIBUTE);
    const shown = Math.abs(value).toFixed(OFFSET_DECIMALS);

    return unit ? `${sign}${shown} ${unit}` : `${sign}${shown}`;
  });

  let timeWidth = $state(0);
  let measuredWidth = $state(0);

  // The measure is drawn at a known size, so the ratio of the two widths scales it to the time's.
  const detailSize = $derived(measuredWidth > 0 ? `${(MEASURE_REM * timeWidth) / measuredWidth}rem` : undefined);
</script>

{#snippet detail()}
  {#if offset}
    <span>{labels.clock_ntp} {offset}</span>
    <span class="precise-clock__separator">·</span>
  {/if}
  <span>{utc} {labels.clock_utc}</span>
{/snippet}

<div class="precise-clock">
  <div><span class="precise-clock__time" bind:offsetWidth={timeWidth}>{time}</span></div>

  <!-- Sized to run exactly as wide as the time: drawn once unseen at a known size to measure it. -->
  <div class="precise-clock__detail" style:font-size={detailSize}>{@render detail()}</div>
  <span
    class="precise-clock__detail precise-clock__measure"
    style:font-size="{MEASURE_REM}rem"
    aria-hidden="true"
    bind:offsetWidth={measuredWidth}
  >
    {@render detail()}
  </span>
</div>

<style>
  /* Fixed-width figures, so the line does not shiver as the seconds run. */
  .precise-clock {
    position: relative;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .precise-clock__time {
    display: inline-block;
    font-size: var(--clock-time-size);
    font-weight: var(--weight-thin);
    line-height: 1;
  }

  .precise-clock__detail {
    color: var(--color-muted);
    font-weight: var(--weight-thin);
  }

  .precise-clock__measure {
    position: absolute;
    top: 0;
    left: 0;
    visibility: hidden;
  }

  .precise-clock__separator {
    color: var(--color-dim);
  }
</style>
