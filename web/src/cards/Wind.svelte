<script lang="ts">
  import { ha } from "../lib/state.svelte";
  import type { Weather } from "../lib/types";
  import { along, bearingDegrees, downwind, meaningfulGust } from "../lib/wind";

  /*
   * The wind now: a compass without its letters, marked at the points between, and an arrow across
   * it pointing the way the wind is blowing, with the speed at the arrow's point. A calm has no way
   * to point, so it draws no arrow and gives its speed at the centre. A gust worth mentioning is
   * given past the arrow's tail, the way the wind comes from.
   */

  const SPEED_ATTRIBUTE = "wind_speed";
  const BEARING_ATTRIBUTE = "wind_bearing";
  const GUST_ATTRIBUTE = "wind_gust_speed";
  const CALM = 0;
  const HALF_TURN = 180;

  /* The drawing's units: a box 200 across with the centre at its middle. */
  const BOX = 200;
  const HALF_BOX = BOX / 2;
  const RIM = 50;
  /* The cross runs out past the rim, so its points stand clear of the circle. */
  const CROSS = 66;
  /* Short marks across the rim at the four points between the cross's. */
  const BETWEEN = [45, 135, 225, 315];
  const HASH = 7;
  /* The arrow's tail sits on the rim behind, and its point just past the rim ahead. */
  const TAIL = RIM;
  const TIP = 60;
  const HEAD_LENGTH = 18;
  const HEAD_HALF_WIDTH = 9;
  const HEAD_BASE = TIP - HEAD_LENGTH;
  /* Beyond the cross's points, so the speed never sits on one of them. */
  const LABEL_DISTANCE = 94;
  const PERCENT = 100;
  const MIDDLE = 50;

  let { weather }: { weather: Weather } = $props();

  const speed = $derived.by(() => {
    const reading = Number(ha.attribute<number>(weather.entity_id, SPEED_ATTRIBUTE) ?? Number.NaN);

    return Number.isFinite(reading) ? Math.round(reading) : null;
  });

  const bearing = $derived(bearingDegrees(ha.attribute<unknown>(weather.entity_id, BEARING_ATTRIBUTE)));

  const heading = $derived(bearing === null || speed === null || speed === CALM ? null : downwind(bearing));
  const label = $derived(heading === null ? { x: 0, y: 0 } : along(heading, LABEL_DISTANCE));

  const gust = $derived.by(() => {
    const reading = Number(ha.attribute<number>(weather.entity_id, GUST_ATTRIBUTE) ?? Number.NaN);

    return heading === null || !Number.isFinite(reading)
      ? null
      : meaningfulGust(speed, reading, weather.wind_gust_threshold);
  });

  /* Past the tail as far as the speed is past the point, so the two sit either end of the arrow. */
  const tail = $derived(heading === null ? null : along(heading + HALF_TURN, LABEL_DISTANCE));
</script>

{#if speed !== null}
  <section class="wind">
    <div class="wind__rose">
      <svg viewBox="{-HALF_BOX} {-HALF_BOX} {BOX} {BOX}" aria-hidden="true">
        <circle class="wind__rim" r={RIM} />
        <line class="wind__cross" x1="0" y1={-CROSS} x2="0" y2={CROSS} />
        <line class="wind__cross" x1={-CROSS} y1="0" x2={CROSS} y2="0" />
        {#each BETWEEN as angle (angle)}
          <line class="wind__cross" x1="0" y1={-(RIM - HASH)} x2="0" y2={-(RIM + HASH)} transform="rotate({angle})" />
        {/each}

        {#if heading !== null}
          <g transform="rotate({heading})">
            <line class="wind__shaft" x1="0" y1={TAIL} x2="0" y2={-HEAD_BASE} />
            <path
              class="wind__head"
              d="M 0 {-TIP} L {HEAD_HALF_WIDTH} {-HEAD_BASE} L {-HEAD_HALF_WIDTH} {-HEAD_BASE} Z"
            />
          </g>
        {/if}
      </svg>

      <span
        class="wind__speed"
        style:left="{MIDDLE + (label.x / BOX) * PERCENT}%"
        style:top="{MIDDLE + (label.y / BOX) * PERCENT}%"
      >
        {speed}
      </span>

      {#if gust !== null && tail !== null}
        <span
          class="wind__gust"
          style:left="{MIDDLE + (tail.x / BOX) * PERCENT}%"
          style:top="{MIDDLE + (tail.y / BOX) * PERCENT}%"
        >
          {gust}
        </span>
      {/if}
    </div>
  </section>
{/if}

<style>
  .wind {
    display: flex;
    justify-content: center;
  }

  .wind__rose {
    position: relative;
    width: var(--dial-size);
    height: var(--dial-size);
  }

  .wind__rose svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .wind__rim,
  .wind__cross {
    fill: none;
    stroke: var(--color-dim);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }

  .wind__shaft {
    stroke: var(--color-foreground);
    stroke-width: 2.5;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }

  .wind__head {
    fill: var(--color-foreground);
  }

  .wind__speed,
  .wind__gust {
    position: absolute;
    color: var(--color-foreground);
    font-size: var(--dial-reading-size);
    font-weight: var(--weight-light);
    line-height: 1;
    white-space: nowrap;
    transform: translate(-50%, -50%);
  }
</style>
