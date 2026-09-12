<script lang="ts">
  import type { Snippet } from "svelte";

  import { readingOffset } from "../lib/reading";

  /*
   * A bar between two ends, a marker somewhere along it, and a reading over the marker. What the
   * ends say, what the bar is painted with, and where the marker sits are all the caller's; this
   * is only the shape, so every bar on a face has the same one.
   */

  type End = { value: string };

  let {
    start,
    end,
    background,
    position,
    reading = null,
    unit = null,
    below = false,
    dot = null,
    marker,
  }: {
    start: End;
    end: End;
    background: string;
    /** Percent of the way along the bar, or null for no marker. */
    position: number | null;
    /** The number by the marker, centred on it. */
    reading?: string | null;
    /** What the number counts in, hung off its right so it does not pull the number off centre. */
    unit?: string | null;
    /** Whether the reading hangs under the bar rather than over it. */
    below?: boolean;
    dot?: string | null;
    /** Something to draw in the dot in place of a colour, such as the moon. */
    marker?: Snippet;
  } = $props();

  const HALF = 0.5;
  const PERCENT = 100;

  let rowWidth = $state(0);
  let startWidth = $state(0);
  let barWidth = $state(0);
  let endWidth = $state(0);
  let numberWidth = $state(0);
  let unitWidth = $state(0);

  /* The space either side of the bar, which the reading may reach into but not past. */
  const gap = $derived(Math.max((rowWidth - startWidth - barWidth - endWidth) * HALF, 0));

  const offset = $derived(
    position === null
      ? 0
      : readingOffset({
          along: position / PERCENT,
          barWidth,
          gap,
          numberWidth,
          readingWidth: numberWidth + (unit ? unitWidth : 0),
        }),
  );
</script>

<section class="range-bar" class:range-bar--below={below} bind:clientWidth={rowWidth}>
  <div class="range-bar__end" bind:clientWidth={startWidth}>
    <span class="range-bar__value">{start.value}</span>
  </div>

  <div class="range-bar__bar" style:background bind:clientWidth={barWidth}>
    {#if position !== null}
      <div class="range-bar__marker" style:left="{position}%">
        {#if reading}
          <span class="range-bar__reading" style:transform="translateX({-offset}px)">
            <span class="range-bar__number" bind:clientWidth={numberWidth}>{reading}</span>{#if unit}<span
                class="range-bar__unit"
                bind:clientWidth={unitWidth}>{unit}</span
              >{/if}
          </span>
        {/if}
        <span class="range-bar__dot" class:range-bar__dot--drawn={marker !== undefined} style:background-color={dot}>
          {#if marker}{@render marker()}{/if}
        </span>
      </div>
    {/if}
  </div>

  <div class="range-bar__end" bind:clientWidth={endWidth}>
    <span class="range-bar__value">{end.value}</span>
  </div>
</section>

<style>
  .range-bar {
    display: flex;
    align-items: center;
    gap: 1.4rem;
    height: 100%;
    /* The reading sits above the bar, so the pair are centred together rather than the bar alone. */
    padding-top: var(--range-reading-size);
  }

  .range-bar__end {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .range-bar__value {
    display: block;
    color: var(--color-muted);
    font-size: var(--range-end-size);
    font-weight: var(--weight-light);
    line-height: 1;
  }

  .range-bar__bar {
    position: relative;
    flex: 1 1 auto;
    height: var(--range-bar-height);
    border-radius: var(--range-bar-height);
  }

  /* A point on the bar that the dot and the reading are both hung from. */
  .range-bar__marker {
    position: absolute;
    top: 50%;
    width: 0;
    height: 0;
  }

  .range-bar__dot {
    position: absolute;
    left: 0;
    top: 0;
    width: var(--range-dot-size);
    height: var(--range-dot-size);
    border: 0.2rem solid var(--color-background);
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--color-dim);
    transform: translate(-50%, -50%);
  }

  .range-bar__reading {
    position: absolute;
    left: 0;
    bottom: calc(var(--range-dot-size) * 0.75);
    color: var(--color-foreground);
    font-size: var(--range-reading-size);
    font-weight: var(--weight-thin);
    white-space: nowrap;
  }

  /* Under the bar, the room the reading needs moves below it too. */
  .range-bar--below {
    padding-top: 0;
    padding-bottom: var(--range-reading-size);
  }

  .range-bar--below .range-bar__reading {
    top: calc(var(--range-dot-size) * 0.5);
    bottom: auto;
  }

  /* A dot that draws something of its own is clipped to the circle it sits in. */
  .range-bar__dot--drawn {
    overflow: hidden;
  }

  /* Measured apart, so the number can be centred on the marker without its unit pulling it over. */
  .range-bar__number,
  .range-bar__unit {
    display: inline-block;
  }
</style>
