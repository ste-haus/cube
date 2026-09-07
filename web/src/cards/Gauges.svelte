<script lang="ts">
  import { thresholdColor } from "../lib/format";
  import { ha } from "../lib/state.svelte";
  import type { GaugeRow } from "../lib/types";

  /* A half-circle gauge, drawn as a stroked arc so its fill is one dash offset. */
  const RADIUS = 40;
  const CENTER_X = 50;
  const CENTER_Y = 50;
  const STROKE_WIDTH = 4;
  const VIEWBOX = "0 0 100 58";
  const ARC = `M ${CENTER_X - RADIUS} ${CENTER_Y} A ${RADIUS} ${RADIUS} 0 0 1 ${CENTER_X + RADIUS} ${CENTER_Y}`;
  const ARC_LENGTH = Math.PI * RADIUS;
  const FULL_SCALE = 100;

  let { row }: { row: GaugeRow } = $props();

  function fraction(value: number): number {
    return Math.min(Math.max(value, 0), FULL_SCALE) / FULL_SCALE;
  }
</script>

<div class="gauges">
  {#each row.gauges as gauge (gauge.entity_id)}
    {@const value = ha.number(gauge.entity_id)}
    {@const color = thresholdColor(row.scale, value)}
    <figure class="gauge">
      <div class="gauge__dial">
        <svg viewBox={VIEWBOX} role="img" aria-label={gauge.name ?? gauge.entity_id}>
          <path
            d={ARC}
            fill="none"
            stroke={color}
            stroke-width={STROKE_WIDTH}
            stroke-linecap="butt"
            stroke-dasharray={ARC_LENGTH}
            stroke-dashoffset={ARC_LENGTH * (1 - fraction(value))}
          />
        </svg>
        <span class="gauge__value">{Math.round(value)}{row.unit}</span>
      </div>
      {#if gauge.name}<figcaption class="gauge__name">{gauge.name}</figcaption>{/if}
    </figure>
  {/each}
</div>

<style>
  .gauges {
    display: flex;
    justify-content: space-around;
    gap: 1.5em;
  }

  .gauge {
    flex: 1 1 0;
    margin: 0;
    text-align: center;
  }

  .gauge__dial {
    position: relative;
  }

  .gauge__dial svg {
    display: block;
    width: 100%;
    height: auto;
  }

  /* Sits in the bowl of the arc rather than under it. */
  .gauge__value {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 17%;
    font-size: var(--gauge-value-size);
    font-weight: var(--weight-thin);
    line-height: 1;
  }

  .gauge__name {
    margin-top: 0.4em;
    color: var(--color-muted);
    font-size: var(--gauge-name-size);
  }
</style>
