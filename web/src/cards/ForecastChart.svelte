<script lang="ts">
  import WeatherIcon from "./WeatherIcon.svelte";
  import { areaPath, curvePath, levelPath, type Point } from "../lib/curve";
  import type { ChartColumn, ChartLine } from "../lib/forecast.svelte";

  /*
   * A forecast drawn as a chart: labels across the top, smooth lines of temperatures in pills, the
   * sky under each column, and optionally the chance of rain or snow as a shaded curve behind them
   * all. The week and the hours both draw this way, so the two views read as one card.
   */

  const DEGREE = "°";
  const PERCENT = 100;
  const HALF = 0.5;

  /* The chart's drawing units: a column per entry across, and percent down so the labels and the
   * lines share one vertical scale. */
  const COLUMN_WIDTH = 100;

  const LEFT_EDGE = 0;
  const NO_RAIN = 0;

  let {
    columns,
    lines,
    span = null,
    snow = false,
  }: {
    columns: ChartColumn[];
    lines: ChartLine[];
    span?: { start: string; end: string } | null;
    /** Draws the precipitation as snow rather than rain. */
    snow?: boolean;
  } = $props();

  const width = $derived(columns.length * COLUMN_WIDTH);

  /* The chance of rain, standing up from the chart's foot: none is the foot itself, and certain is
   * the chart's full height. */
  const rainfall = $derived(plotted(columns.map((column) => PERCENT - (column.rain ?? NO_RAIN))));
  const rainy = $derived(columns.some((column) => column.rain !== null));

  /** A point at the middle of each column there is a value for. */
  function plotted(positions: (number | null)[]): Point[] {
    return positions.flatMap((y, index) => (y === null ? [] : [{ x: (index + HALF) * COLUMN_WIDTH, y }]));
  }

  function across(index: number): number {
    return ((index + HALF) / columns.length) * PERCENT;
  }

  /** Where a line starts or stops: its first and last points that are there at all. */
  function ends(line: ChartLine): { first: number; last: number } {
    const present = line.positions.flatMap((position, index) => (position === null ? [] : [index]));

    return { first: present[0] ?? -1, last: present[present.length - 1] ?? -1 };
  }
</script>

{#if columns.length > 0}
  <section class="forecast" style:--forecast-columns={columns.length}>
    {#if span}
      <div class="forecast__span">
        <span class="forecast__label">{span.start}</span>
        <span class="forecast__label">{span.end}</span>
      </div>
    {:else}
      <div class="forecast__row">
        {#each columns as column (column.key)}
          <span class="forecast__label">{column.label}</span>
        {/each}
      </div>
    {/if}

    <div class="forecast__chart">
      <svg viewBox="0 0 {width} {PERCENT}" preserveAspectRatio="none" aria-hidden="true">
        <!-- Behind everything, and run out to both edges so it reads as the whole span's weather. -->
        {#if rainy}
          <path
            class="forecast__rain"
            class:forecast__rain--snow={snow}
            d={areaPath(rainfall, LEFT_EDGE, width, PERCENT)}
          />
          <path
            class="forecast__rain-edge"
            class:forecast__rain-edge--snow={snow}
            d={levelPath(rainfall, LEFT_EDGE, width)}
          />
        {/if}

        {#each lines as line (line.tone)}
          <path class="forecast__line forecast__line--{line.tone}" d={curvePath(plotted(line.positions))} />
        {/each}
      </svg>

      {#each lines as line (line.tone)}
        {@const { first, last } = ends(line)}
        {#each columns as column, index (column.key)}
          {@const y = line.positions[index]}
          {@const value = line.values[index]}
          {#if y !== null && value !== null}
            {#if line.pills === "all" || index === first || index === last || line.peaks.includes(index)}
              <!-- A line whose middle is dots has its end pills nudged inward, so the columns at the
                   edges, narrow as they are, do not push them off the card. -->
              <span
                class="forecast__value forecast__value--{line.tone}"
                class:forecast__value--first={line.pills === "ends" && index === first}
                class:forecast__value--last={line.pills === "ends" && index === last}
                style:left="{across(index)}%"
                style:top="{y}%"
              >
                {Math.round(value)}{DEGREE}
              </span>
            {:else}
              <span class="forecast__dot forecast__dot--{line.tone}" style:left="{across(index)}%" style:top="{y}%"
              ></span>
            {/if}
          {/if}
        {/each}
      {/each}
    </div>

    <div class="forecast__row">
      {#each columns as column (column.key)}
        <span class="forecast__icon">
          {#if column.iconShown}<WeatherIcon condition={column.condition} daytime={column.daytime} />{/if}
        </span>
      {/each}
    </div>
  </section>
{/if}

<style>
  .forecast {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    height: 100%;
  }

  .forecast__row {
    display: grid;
    flex: 0 0 auto;
    grid-template-columns: repeat(var(--forecast-columns), minmax(0, 1fr));
    align-items: center;
    justify-items: center;
  }

  /* Quieter than the chart it heads. */
  .forecast__label {
    color: var(--color-muted);
    font-size: var(--forecast-day-size);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .forecast__chart {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
  }

  .forecast__chart svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  /* Stretched to the card, so strokes keep their own width rather than taking the stretch. */
  .forecast__line {
    fill: none;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }

  .forecast__line--high {
    stroke: var(--forecast-high-color);
  }

  .forecast__line--low {
    stroke: var(--forecast-low-color);
  }

  .forecast__line--rising {
    stroke: var(--forecast-rising-color);
  }

  .forecast__line--falling {
    stroke: var(--forecast-falling-color);
  }

  /* A pill on the panel's own ground, so the line appears to run into the label and stop. Any
   * radius past half the height rounds the ends fully; 1em is past it at every size here. */
  .forecast__value {
    position: absolute;
    padding: 0.05em 0.5em;
    border: 1.5px solid currentColor;
    border-radius: 1em;
    background-color: var(--color-background);
    font-size: var(--forecast-value-size);
    line-height: 1.2;
    white-space: nowrap;
    transform: translate(-50%, -50%);
  }

  .forecast__value--high {
    color: var(--forecast-high-color);
  }

  .forecast__value--low {
    color: var(--forecast-low-color);
  }

  .forecast__value--rising {
    color: var(--forecast-rising-color);
  }

  .forecast__value--falling {
    color: var(--forecast-falling-color);
  }

  .forecast__value--first {
    transform: translate(-30%, -50%);
  }

  .forecast__value--last {
    transform: translate(-70%, -50%);
  }

  /* A point on the line without its number, for a line too dense to label every point. */
  .forecast__dot {
    position: absolute;
    width: var(--forecast-dot-size);
    height: var(--forecast-dot-size);
    border-radius: 50%;
    background-color: currentColor;
    transform: translate(-50%, -50%);
  }

  .forecast__dot--rising {
    color: var(--forecast-rising-color);
  }

  .forecast__dot--falling {
    color: var(--forecast-falling-color);
  }

  /* Where the chart runs from and to, at its two edges. */
  .forecast__span {
    display: flex;
    flex: 0 0 auto;
    justify-content: space-between;
  }

  .forecast__icon {
    display: flex;
    justify-content: center;
    font-size: var(--forecast-icon-size);
  }

  /* Faint, so the line and its dots read over it, with its top edge drawn in full so the shape of
   * the shower still reads where it is thin. */
  .forecast__rain {
    fill: var(--forecast-rain-color);
    opacity: var(--wash-opacity);
  }

  .forecast__rain-edge {
    fill: none;
    stroke: var(--forecast-rain-color);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }

  /* Snow in place of rain: a white edge over a light grey wash. */
  .forecast__rain--snow {
    fill: var(--forecast-snow-fill-color);
  }

  .forecast__rain-edge--snow {
    stroke: var(--forecast-snow-edge-color);
  }
</style>
