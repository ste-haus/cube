<script lang="ts">
  import { faceVisibility } from "../lib/cube.svelte";
  import { END, INTERCHANGE, STOP, INLINE, TERMINUS, formatLatency, layoutMap, routeBetween, stopIsUp } from "../lib/network";
  import type { MapSegment, RouteStep } from "../lib/network";
  import { ha } from "../lib/state.svelte";
  import type { NetworkMap, NetworkStop } from "../lib/types";

  /*
   * The network as a rail map: the places outside the house at the top, rising off the head of
   * the line, and the house running down from it. Every stop has its own length of rail from
   * where it leaves, in the stop's colour, so a stop that has gone dark greys out its own rail
   * and nothing else.
   *
   * While the face is looked at, sparks travel the network from one node to another, along the
   * rails between them: up to the station the two share and down the other side. Each picks two
   * nodes that are up, by a way that is lit end to end, so a dark one is never sent to or passed
   * through, and a station is only ever passed through. When one arrives, it rests a moment and
   * sets off on another trip.
   *
   * The drawing is measured in rows, one to a stop, and drawn as tall as the card, with the
   * column of names beside it stretched to the same height, so the two share their rows. Its
   * width follows from that height, set from the card's measured height rather than left to
   * `aspect-ratio`, which a grid column sized before the height is known reads as no width.
   */

  const ROW = 1;
  const RAIL_INSET = 0.3;
  const RAIL_GAP = 0.3;
  /* How far past the last rail the termini sit, and how tight a rail turns off to one. */
  const TERMINUS_RUN = 0.45;
  const TURN_RADIUS = 0.24;
  const TRACK_WIDTH = 0.11;
  const DOT_RADIUS = 0.085;
  const PILL_HEIGHT = 0.26;
  const PILL_OVERHANG = 0.14;
  const INLINE_DASH = "0.02 0.09";
  const LABELLED = "Network map";

  /* How fast a spark travels, how many are out at once, and how long each rests between trips on
   * average. The rests are drawn as independent arrivals are, mostly short with now and then a
   * long one, so the sparks never fall into a rhythm. */
  const SPARK_ROWS_PER_SECOND = 3;
  const SPARK_COUNT = 3;
  const SPARK_MEAN_REST_SECONDS = 4;
  const SPARK_PICK_ATTEMPTS = 12;
  const SPARK_RADIUS = 0.06;
  const SPARK_HALO = 2;
  const SPARK_GLOW = 0.07;
  /* The share of a trip at each end over which a spark fades in and out. */
  const SPARK_FADE = 0.12;
  const MILLISECONDS_PER_SECOND = 1000;

  const UP_COLOR = "var(--color-primary)";
  const DOWN_COLOR = "var(--color-dim)";
  const UNKNOWN_COLOR = "var(--color-faint)";

  let { map }: { map: NetworkMap } = $props();

  const visibility = faceVisibility();
  let cardHeight = $state(0);
  const glowId = `network-spark-${Math.random().toString(36).slice(2)}`;

  const layout = $derived(layoutMap(map));
  const terminusX = $derived(railX(layout.rails - 1) + TERMINUS_RUN);
  const width = $derived(terminusX + DOT_RADIUS + RAIL_INSET);
  const height = $derived(layout.rows.length * ROW);

  function railX(rail: number): number {
    return RAIL_INSET + rail * RAIL_GAP;
  }

  function rowY(row: number): number {
    return row * ROW + ROW / 2;
  }

  function isUp(stop: NetworkStop): boolean | null {
    return stopIsUp(ha.state(stop.entity_id), stop.up_states, stop.entity_id !== null);
  }

  function colorOf(stop: NetworkStop): string {
    const up = isUp(stop);

    return up === null ? UNKNOWN_COLOR : up ? UP_COLOR : DOWN_COLOR;
  }

  /* Straight down (or up) the rail, then, for a terminus, a quarter turn off right to its stop. */
  function track(segment: MapSegment): string {
    const x = railX(segment.rail);
    const from = rowY(segment.from);
    const to = rowY(segment.to);

    if (!segment.turns) {
      return `M ${x} ${from} L ${x} ${to}`;
    }

    const direction = Math.sign(to - from);
    const radius = Math.min(TURN_RADIUS, Math.abs(to - from), terminusX - x);

    return `M ${x} ${from} L ${x} ${to - direction * radius} Q ${x} ${to} ${x + radius} ${to} L ${terminusX} ${to}`;
  }

  /* A segment as a leg of a trip: where it starts, and the drawing on from there, either way. */
  function leg(segment: MapSegment, reverse: boolean): { start: string; path: string } {
    const x = railX(segment.rail);
    const from = rowY(segment.from);
    const to = rowY(segment.to);

    if (!segment.turns) {
      return reverse ? { start: `${x} ${to}`, path: `L ${x} ${from}` } : { start: `${x} ${from}`, path: `L ${x} ${to}` };
    }

    const direction = Math.sign(to - from);
    const radius = Math.min(TURN_RADIUS, Math.abs(to - from), terminusX - x);
    const bend = to - direction * radius;

    return reverse
      ? { start: `${terminusX} ${to}`, path: `L ${x + radius} ${to} Q ${x} ${to} ${x} ${bend} L ${x} ${from}` }
      : { start: `${x} ${from}`, path: `L ${x} ${bend} Q ${x} ${to} ${x + radius} ${to} L ${terminusX} ${to}` };
  }

  /* A whole trip, its legs joined across the hubs between them. */
  function trip(steps: RouteStep[]): string {
    const legs = steps.map(({ segment, reverse }) => leg(layout.segments[segment], reverse));

    return `M ${legs[0].start} ` + legs.map((each) => `L ${each.start} ${each.path}`).join(" ");
  }

  /* Two nodes that are up, by a way lit end to end; null when no such pair turns up. Only a node at
   * the end of its own branch sets off or arrives: a station, or a stop on the line itself, is only
   * ever passed through. */
  function pickTrip(): string | null {
    const ends = layout.rows.flatMap((row, index) => (row.kind === TERMINUS && isUp(row.stop) ? [index] : []));
    if (ends.length < 2) {
      return null;
    }

    for (let attempt = 0; attempt < SPARK_PICK_ATTEMPTS; attempt++) {
      const from = ends[Math.floor(Math.random() * ends.length)];
      const to = ends[Math.floor(Math.random() * ends.length)];
      const steps = routeBetween(layout, from, to);

      if (steps && steps.every(({ segment }) => isUp(layout.segments[segment].stop))) {
        return trip(steps);
      }
    }

    return null;
  }

  interface Spark {
    id: number;
    path: string | null;
    departs: number;
    length: number | null;
    x: number;
    y: number;
    opacity: number;
  }

  let sparks = $state<Spark[]>([]);
  const routes: Record<number, SVGPathElement | undefined> = {};
  let nextSpark = 0;

  function resting(now: number): Spark {
    // An exponential wait: the gap between arrivals that are each as likely at any moment.
    const rest = -Math.log(1 - Math.random()) * SPARK_MEAN_REST_SECONDS * MILLISECONDS_PER_SECOND;

    return { id: nextSpark++, path: null, departs: now + rest, length: null, x: 0, y: 0, opacity: 0 };
  }

  /* Moves each spark along its trip, and sends one that has arrived, after its rest, on another. */
  function advance(spark: Spark, now: number): Spark {
    if (now < spark.departs) {
      return spark;
    }

    if (spark.path === null) {
      const path = pickTrip();

      return path ? { ...spark, path } : resting(now);
    }

    const route = routes[spark.id];
    const length = spark.length ?? route?.getTotalLength() ?? null;
    if (!route || !length) {
      return spark;
    }

    const seconds = length / (SPARK_ROWS_PER_SECOND * ROW);
    const progress = (now - spark.departs) / (seconds * MILLISECONDS_PER_SECOND);
    if (progress >= 1) {
      return resting(now);
    }

    const point = route.getPointAtLength(progress * length);
    const opacity = Math.min(1, progress / SPARK_FADE, (1 - progress) / SPARK_FADE);

    return { ...spark, length, x: point.x, y: point.y, opacity };
  }

  /* Only while the face is looked at; a face turned away is still. */
  $effect(() => {
    if (!visibility.showing) {
      return;
    }

    let frame = requestAnimationFrame(function tick(now) {
      sparks = (sparks.length ? sparks : Array.from({ length: SPARK_COUNT }, () => resting(now))).map((spark) =>
        advance(spark, now),
      );
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frame);
      sparks = [];
    };
  });

  function latencyOf(stop: NetworkStop): string | null {
    const reading = ha.state(stop.latency_entity_id);
    const value = Number(reading);

    return reading !== null && Number.isFinite(value) ? `${formatLatency(value)} ms` : null;
  }
</script>

<div class="network-map" style:--network-map-rows={layout.rows.length} bind:clientHeight={cardHeight}>
  <svg
    class="network-map__drawing"
    viewBox="0 0 {width} {height}"
    style:width="{(cardHeight * width) / height}px"
    style:height="{cardHeight}px"
    role="img"
    aria-label={LABELLED}
  >
    <defs>
      <filter id={glowId} x="-200%" y="-200%" width="500%" height="500%">
        <feGaussianBlur stdDeviation={SPARK_GLOW} />
      </filter>
    </defs>

    {#each layout.rows as row, index (index)}
      {#if row.kind === INLINE}
        <line
          x1="0"
          x2={terminusX}
          y1={rowY(index)}
          y2={rowY(index)}
          stroke={colorOf(row.stop)}
          stroke-width={TRACK_WIDTH / 2}
          stroke-dasharray={INLINE_DASH}
          stroke-linecap="round"
        />
      {/if}
    {/each}

    {#each layout.segments as segment, index (index)}
      <path
        class="network-map__track"
        d={track(segment)}
        fill="none"
        stroke={colorOf(segment.stop)}
        stroke-width={TRACK_WIDTH}
        stroke-linecap="round"
      />
    {/each}

    {#each layout.rows as row, index (index)}
      {@const y = rowY(index)}
      {#if row.kind === INTERCHANGE}
        <rect
          x={railX(row.rail) - PILL_OVERHANG}
          y={y - PILL_HEIGHT / 2}
          width={railX(row.rail + row.span - 1) - railX(row.rail) + 2 * PILL_OVERHANG}
          height={PILL_HEIGHT}
          rx={PILL_HEIGHT / 2}
          fill={colorOf(row.stop)}
        />
      {:else if row.kind === TERMINUS}
        <circle class="network-map__dot" cx={terminusX} cy={y} r={DOT_RADIUS} />
      {:else if row.kind === STOP || row.kind === END || row.kind === INLINE}
        <circle class="network-map__dot" cx={railX(row.rail)} cy={y} r={DOT_RADIUS} />
      {/if}
    {/each}
    <!-- Over the hubs and stops, so a spark is seen passing through them. -->
    {#each sparks as spark (spark.id)}
      {#if spark.path}
        <path d={spark.path} fill="none" stroke="none" bind:this={routes[spark.id]} />
        <g transform="translate({spark.x} {spark.y})" opacity={spark.opacity}>
          <circle r={SPARK_RADIUS * SPARK_HALO} fill={UP_COLOR} filter="url(#{glowId})" />
          <circle r={SPARK_RADIUS} class="network-map__spark-core" />
        </g>
      {/if}
    {/each}
  </svg>

  <ol class="network-map__stops">
    {#each layout.rows as row, index (index)}
      {@const up = isUp(row.stop)}
      {@const latency = latencyOf(row.stop)}
      <li
        class="network-map__stop"
        class:network-map__stop--station={row.kind === INTERCHANGE}
        class:network-map__stop--down={up === false}
      >
        <span class="network-map__name">{ha.state(row.stop.name_entity_id) ?? row.stop.name}</span>
        <span class="network-map__reading">
          {#if up === false}
            Down
          {:else if latency}
            {latency}
          {/if}
        </span>
      </li>
    {/each}
  </ol>
</div>

<style>
  .network-map {
    display: grid;
    grid-template-columns: auto auto;
    justify-content: start;
    column-gap: var(--network-map-label-gap);
    height: 100%;
    min-height: 0;
  }

  .network-map__drawing {
    display: block;
  }

  .network-map__dot,
  .network-map__spark-core {
    fill: var(--color-foreground);
  }

  /* As wide as its longest name and reading, so every reading lines up just past the names. */
  .network-map__stops {
    display: grid;
    width: max-content;
    grid-template-rows: repeat(var(--network-map-rows), minmax(0, 1fr));
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The name and the reading on the rail's line. */
  .network-map__stop {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-content: center;
    column-gap: var(--network-map-reading-gap);
    min-height: 0;
    overflow: hidden;
    font-size: var(--network-map-size);
    line-height: 1.15;
  }

  .network-map__name {
    overflow: hidden;
    color: var(--color-foreground);
    font-weight: var(--weight-light);
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color var(--colour-fade);
  }

  .network-map__reading {
    color: var(--color-muted);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* A station's name in capitals, every other stop's in lower case, so the hubs stand out. */
  .network-map__name {
    text-transform: lowercase;
  }

  .network-map__stop--station .network-map__name {
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .network-map__stop--down .network-map__name {
    color: var(--color-dim);
  }

  .network-map__track {
    transition: stroke var(--colour-fade);
  }
</style>
