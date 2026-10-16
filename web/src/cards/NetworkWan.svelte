<script lang="ts">
  import Icon from "../lib/Icon.svelte";
  import SlidingNumber from "./SlidingNumber.svelte";
  import { fetchHistory } from "../lib/api";
  import { faceVisibility } from "../lib/cube.svelte";
  import { areaPath, curvePath, type Point } from "../lib/curve";
  import { BUSY, FULL, averaged, formatLatency, formatSpan, loadOf, stopIsUp, uptimeSlices } from "../lib/network";
  import { ha } from "../lib/state.svelte";
  import { PULSE_MS } from "../lib/travel";
  import type { HistoryState, NetworkWan } from "../lib/types";

  /*
   * The house's way out, set in the corner.
   *
   * On the address's line, before it, how long the connection has been up. Under the address, as
   * wide as it and drawn like an underline, the last day of the connection: primary while it was
   * up, grey where it dropped.
   *
   * Then three readings: how long the internet takes to answer, and what is crossing the
   * connection each way. Each has a scale and two thresholds on it, past which it is busy and then
   * full: the plan's capacity for the rates, at half and three quarters of it, and fixed latencies
   * for the answer. Under each reading, the last stretch of it on its scale, running up to now at
   * the right edge. A rate's chart stands on its meter, how much of the plan is in use, which
   * slides along as the rate does and is the chart's nought. Meter, curve, the faint area under the
   * curve and the dot at its end are grey below the first threshold, primary to the second and
   * secondary past it, the curve by its height, so a busy stretch shows where it was.
   *
   * With the connection down it is an alarm: the status says how long it has been down, and it and
   * the address are drawn in the master warning's red and pulse, the urgency of a trip that is
   * late, until it comes back.
   */

  const UPTIME_HOURS = 24;
  const UPTIME_SLICES = 96;
  const SPARK_SLICES = 30;
  const REFRESH_MINUTES = 5;
  const MINUTES_PER_HOUR = 60;
  const MILLISECONDS_PER_MINUTE = 60_000;
  const MILLISECONDS = "ms";
  const DOWN_ICON = "mdi:arrow-down";
  const UP_ICON = "mdi:arrow-up";
  const LATENCY_ICON = "mdi:timer-outline";
  const RATE_UNIT = "Mbit/s";
  const LATENCY_UNIT = "ms";
  const FINE_RATE_BELOW = 10;
  const PERCENT = 100;
  const UP_PREFIX = "up";
  const OFFLINE = "Offline";
  const SEPARATOR = " · ";
  const UNKNOWN = "—";

  /* Shares of the plan past which a rate is busy, and full. */
  const BUSY_SHARE = 0.5;
  const FULL_SHARE = 0.75;
  /* How far the latency scale runs past its upper threshold at least, so its bands always show. */
  const LATENCY_HEADROOM = 1.5;

  const RESTING_COLOUR = "var(--color-dim)";
  const LOAD_COLOURS = { [BUSY]: "var(--color-primary)", [FULL]: "var(--color-secondary)" } as const;

  /* The chart under each reading, in pixels: as wide as its column, this tall, this heavy. */
  const SPARK_HEIGHT = 24;
  const SPARK_LINE = 1;
  const DOT_RADIUS = 2.5;

  interface Column {
    key: string;
    icon: string;
    entityId: string;
    unit: string;
    /** A rate's plan, which it has a meter against; none for latency. */
    capacity: number | null;
    busyAt: number;
    fullAt: number;
  }

  let { wan, offlineColour }: { wan: NetworkWan; offlineColour: string } = $props();

  const visibility = faceVisibility();
  const gradientId = `network-wan-${Math.random().toString(36).slice(2)}`;
  let histories = $state<Record<string, HistoryState[]>>({});
  let widths = $state<Record<string, number>>({});
  let fetchedAt = $state(Date.now());
  let now = $state(Date.now());

  const up = $derived(stopIsUp(ha.state(wan.entity_id), wan.up_states, true));
  const address = $derived(ha.state(wan.address_entity_id));
  const since = $derived(ha.changedAt(wan.entity_id));
  const lasted = $derived(since ? formatSpan(now - since.getTime()) : null);

  const status = $derived(
    up === false ? [OFFLINE, lasted].filter(Boolean).join(SEPARATOR) : lasted ? `${UP_PREFIX} ${lasted}` : "",
  );

  const slices = $derived(
    uptimeSlices(histories[wan.entity_id] ?? [], wan.up_states, new Date(fetchedAt), UPTIME_HOURS, UPTIME_SLICES),
  );

  function rate(key: string, icon: string, entityId: string | null, capacity: number | null): Column[] {
    if (!entityId) {
      return [];
    }

    const scale = capacity ?? 0;

    return [{ key, icon, entityId, unit: RATE_UNIT, capacity, busyAt: scale * BUSY_SHARE, fullAt: scale * FULL_SHARE }];
  }

  // Latency first, at the left, then the rates.
  const columns = $derived<Column[]>([
    ...(wan.latency_entity_id
      ? [
          {
            key: "latency",
            icon: LATENCY_ICON,
            entityId: wan.latency_entity_id,
            unit: LATENCY_UNIT,
            capacity: null,
            busyAt: wan.latency_busy_ms,
            fullAt: wan.latency_full_ms,
          },
        ]
      : []),
    ...rate("down", DOWN_ICON, wan.download_entity_id, wan.download_capacity),
    ...rate("up", UP_ICON, wan.upload_entity_id, wan.upload_capacity),
  ]);

  function reading(entityId: string): number | null {
    const state = ha.state(entityId);
    const value = Number(state);

    return state !== null && Number.isFinite(value) ? value : null;
  }

  function shown(value: number | null, unit: string): string {
    if (value === null) {
      return UNKNOWN;
    }

    if (unit === LATENCY_UNIT) {
      return formatLatency(value);
    }

    return value < FINE_RATE_BELOW ? value.toFixed(1) : Math.round(value).toString();
  }

  function colourOf(value: number, column: Column): string {
    const load = loadOf(value, column.busyAt, column.fullAt);

    return load === BUSY || load === FULL ? LOAD_COLOURS[load] : RESTING_COLOUR;
  }

  function sliceClass(slice: number | null): string {
    if (slice === null) {
      return "network-wan__slice--unknown";
    }

    return slice >= 1 ? "network-wan__slice--up" : "network-wan__slice--down";
  }

  /*
   * The last stretch of a reading, averaged, ending at now with the reading as it is, on the
   * column's scale: its plan, or for latency at least far enough past its upper threshold that
   * both bands show. Where the thresholds fall, as shares of the way up, for the colour's steps.
   */
  function spark(column: Column, width: number, current: number | null) {
    if (!width) {
      return null;
    }

    const readings = (histories[column.entityId] ?? [])
      .map((entry) => ({ at: new Date(entry.last_changed ?? "").getTime(), value: Number(entry.state) }))
      .filter((each) => Number.isFinite(each.at) && Number.isFinite(each.value));
    const points = averaged(readings, fetchedAt, wan.history_minutes / MINUTES_PER_HOUR, SPARK_SLICES);
    if (current !== null) {
      points.push({ at: Math.max(fetchedAt, now), value: current });
    }
    if (points.length < 2) {
      return null;
    }

    const peak = Math.max(...points.map((point) => point.value));
    const top = column.capacity ?? Math.max(peak, column.fullAt * LATENCY_HEADROOM);
    const start = points[0].at;
    const span = points[points.length - 1].at - start || 1;
    const plotted: Point[] = points.map((point) => ({
      x: ((point.at - start) / span) * width,
      y: SPARK_HEIGHT - (Math.min(point.value, top) / top) * SPARK_HEIGHT,
    }));

    return {
      line: curvePath(plotted),
      area: areaPath(plotted, 0, width, SPARK_HEIGHT),
      latest: plotted[plotted.length - 1],
      busyAt: Math.min(1, column.busyAt / top),
      fullAt: Math.min(1, column.fullAt / top),
    };
  }

  async function refresh(): Promise<void> {
    // The proxy gives history by the hour, so at least one, trimmed to the window as it is drawn.
    const hours = Math.max(1, Math.ceil(wan.history_minutes / MINUTES_PER_HOUR));
    const wanted = [
      { entityId: wan.entity_id, hours: UPTIME_HOURS },
      ...columns.map((column) => ({ entityId: column.entityId, hours })),
    ];

    try {
      const fetched = await Promise.all(wanted.map(({ entityId, hours }) => fetchHistory(entityId, hours)));
      histories = Object.fromEntries(wanted.map(({ entityId }, index) => [entityId, fetched[index]]));
      fetchedAt = Date.now();
    } catch {
      // Everything keeps what it last had; the next refresh tries again.
    }
  }

  $effect(() => {
    if (!visibility.showing) {
      return;
    }

    refresh();
    const fetching = window.setInterval(refresh, REFRESH_MINUTES * MILLISECONDS_PER_MINUTE);
    const ticking = window.setInterval(() => (now = Date.now()), MILLISECONDS_PER_MINUTE);

    return () => {
      window.clearInterval(fetching);
      window.clearInterval(ticking);
    };
  });
</script>

<section
  class="network-wan"
  class:network-wan--down={up === false}
  style:--network-wan-offline={offlineColour}
  style:--network-wan-pulse="{PULSE_MS}{MILLISECONDS}"
>
  <div class="network-wan__line">
    <span class="network-wan__status">{status}</span>

    <!-- As wide as the address, so the day under it reads as its underline. -->
    <span class="network-wan__address">
      <span class="network-wan__ip">{address ?? UNKNOWN}</span>
      <span class="network-wan__uptime">
        {#each slices as slice, index (index)}
          <span class="network-wan__slice {sliceClass(slice)}"></span>
        {/each}
      </span>
    </span>
  </div>

  <div class="network-wan__rates">
    {#each columns as column (column.key)}
      {@const value = reading(column.entityId)}
      {@const day = spark(column, widths[column.key] ?? 0, value)}
      {@const gradient = `${gradientId}-${column.key}`}
      <div class="network-wan__rate" class:network-wan__rate--narrow={column.capacity === null}>
        <span class="network-wan__reading">
          <Icon name={column.icon} />
          <span class="network-wan__value">
            <SlidingNumber {value} format={(each) => shown(each, column.unit)} fallback={UNKNOWN} />
          </span>
          <span class="network-wan__unit">{column.unit}</span>
        </span>

        <!-- The chart stands on the meter, which is its nought. -->
        <span class="network-wan__plot">
          <span class="network-wan__spark" bind:clientWidth={widths[column.key]}>
            {#if day}
              <svg viewBox="0 0 {widths[column.key]} {SPARK_HEIGHT}" height={SPARK_HEIGHT} aria-hidden="true">
                <!-- Hard steps up the height: grey, then primary past the first threshold, secondary past the second. -->
                <defs>
                  <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={SPARK_HEIGHT} y2="0">
                    <stop offset="0" stop-color={RESTING_COLOUR} />
                    <stop offset={day.busyAt} stop-color={RESTING_COLOUR} />
                    <stop offset={day.busyAt} stop-color={LOAD_COLOURS[BUSY]} />
                    <stop offset={day.fullAt} stop-color={LOAD_COLOURS[BUSY]} />
                    <stop offset={day.fullAt} stop-color={LOAD_COLOURS[FULL]} />
                  </linearGradient>
                </defs>
                {#if !column.capacity}
                  <line class="network-wan__floor" x1="0" x2={widths[column.key]} y1={SPARK_HEIGHT} y2={SPARK_HEIGHT} />
                {/if}
                <path class="network-wan__area" d={day.area} fill="url(#{gradient})" />
                <path d={day.line} fill="none" stroke="url(#{gradient})" stroke-width={SPARK_LINE} />
                {#if value !== null}
                  <circle cx={day.latest.x} cy={day.latest.y} r={DOT_RADIUS} fill={colourOf(value, column)} />
                {/if}
              </svg>
            {/if}
          </span>

          {#if column.capacity}
            <span class="network-wan__bar">
              <span
                class="network-wan__fill"
                style:width="{value === null ? 0 : Math.min(value / column.capacity, 1) * PERCENT}%"
                style:background={value === null ? RESTING_COLOUR : colourOf(value, column)}
              ></span>
            </span>
          {/if}
        </span>
      </div>
    {/each}
  </div>
</section>

<style>
  .network-wan {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    align-self: flex-end;
    text-align: right;
  }

  /* The status sits on the address's baseline, before it. */
  .network-wan__line {
    display: flex;
    align-items: baseline;
    gap: var(--network-wan-status-gap);
  }

  .network-wan__status {
    color: var(--color-muted);
    font-size: var(--network-host-detail-size);
    font-variant-numeric: tabular-nums;
  }

  .network-wan__address {
    display: inline-flex;
    flex-direction: column;
    gap: var(--network-wan-underline-gap);
  }

  .network-wan__ip {
    color: var(--color-foreground);
    font-size: var(--network-wan-ip-size);
    font-weight: var(--weight-thin);
    line-height: 1;
    font-variant-numeric: tabular-nums;
    transition: color var(--colour-fade);
  }

  .network-wan__uptime {
    display: flex;
    height: var(--network-wan-underline);
  }

  .network-wan__slice {
    flex: 1 1 0;
    background: var(--color-faint);
  }

  .network-wan__slice--up {
    background: var(--color-primary);
  }

  .network-wan__slice--down {
    background: var(--color-dim);
  }

  .network-wan--down .network-wan__ip,
  .network-wan--down .network-wan__status {
    color: var(--network-wan-offline);
    animation: network-wan-pulse var(--network-wan-pulse) ease-in-out infinite;
  }

  /* Down nearly to nothing and back, with a glow of its own colour at the top of each beat. */
  @keyframes network-wan-pulse {
    0%,
    100% {
      text-shadow: 0 0 var(--travel-pulse-glow) var(--network-wan-offline);
    }

    50% {
      opacity: var(--travel-pulse-opacity);
      text-shadow: none;
    }
  }

  .network-wan__rates {
    display: flex;
    gap: var(--network-wan-rate-gap);
    margin-top: 0.6em;
  }

  /* A fixed width, the figure right-aligned in room for three digits, so nothing shifts as it changes. */
  .network-wan__rate {
    display: flex;
    flex-direction: column;
    gap: 0.3em;
    width: var(--network-wan-rate-width);
  }

  .network-wan__rate--narrow {
    width: var(--network-wan-latency-width);
  }

  .network-wan__reading {
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 0.3em;
    color: var(--color-muted);
    font-size: var(--network-host-detail-size);
  }

  .network-wan__value {
    min-width: var(--network-wan-rate-digits);
    color: var(--color-foreground);
    font-size: var(--network-wan-rate-size);
    font-weight: var(--weight-thin);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .network-wan__unit {
    color: var(--color-dim);
  }

  /* The meter: how much of the plan is in use, sliding along as the rate does, in its load's colour. */
  .network-wan__bar {
    position: relative;
    height: var(--network-host-bar);
    background: var(--color-faint);
  }

  .network-wan__fill {
    position: absolute;
    inset: 0 auto 0 0;
    transition:
      width var(--colour-fade),
      background-color var(--colour-fade);
  }

  .network-wan__plot {
    display: flex;
    flex-direction: column;
  }

  .network-wan__spark {
    display: block;
    width: 100%;
  }

  .network-wan__spark svg {
    display: block;
    width: 100%;
    overflow: visible;
  }

  .network-wan__area {
    opacity: var(--network-wan-area-opacity);
  }

  .network-wan__floor {
    stroke: var(--color-faint);
    stroke-width: 1;
  }
</style>
