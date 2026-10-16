<script lang="ts">
  import Icon from "../lib/Icon.svelte";
  import SlidingNumber from "./SlidingNumber.svelte";
  import { fetchHistory } from "../lib/api";
  import { faceVisibility } from "../lib/cube.svelte";
  import { areaPath, curvePath } from "../lib/curve";
  import { CAUTION, WARNING, averaged, formatStat, tierOf } from "../lib/network";
  import { ha } from "../lib/state.svelte";
  import { BREATHE_MS } from "../lib/travel";
  import type { HistoryState, NetworkRack } from "../lib/types";

  /*
   * The rack: the temperature inside it large in the top corner, opposite the title, with the top
   * and bottom of the rack as a small pair before it, and under them a day of the inside
   * temperature over the fan's speed, filling the rest of the card.
   *
   * The temperature runs on its own scale, fitted to the day and labelled at the right, beside now. It is
   * averaged into half hours and drawn as a smooth curve that never strays past the points either
   * side of it, as the forecast's are, so a sensor's jitter does not read as weather. The fan's
   * speed is averaged the same way and drawn as a faint smooth area under the curve, on a fixed
   * scale from nought to the top of its range that goes unlabelled, so a climb in the temperature
   * can be read against what the fan was doing. Now is the primary dot at the curve's end.
   *
   * The drawing is measured in the card's own pixels rather than stretched to it, so it fills
   * whatever height the line it sits on gives it and the dot stays round.
   *
   * Past its caution threshold the temperature, the card's frame and its title take the master
   * caution's colour and breathe as a lit caution does; past its warning threshold, the master
   * warning's, flashing. The curve is coloured by the same thresholds over its height, grey below
   * the caution and each tier's colour above its line, so it shows when in the day the rack ran
   * hot, and the dot at its end is the tier's colour while there is one. The same readings raise the
   * house's own alerts, so the card and the masters agree.
   */

  const HOURS = 24;
  const SLICES = 48;
  const REFRESH_MINUTES = 5;
  const MILLISECONDS_PER_MINUTE = 60_000;
  const MILLISECONDS_PER_HOUR = 3_600_000;
  const MILLISECONDS = "ms";
  const FLASH_MS = 1000;
  const DECIMALS = 0;
  const UNKNOWN = "—";
  const UPPER_ICON = "mdi:format-vertical-align-top";
  const LOWER_ICON = "mdi:format-vertical-align-bottom";
  const LABELLED = "A day of the rack's temperature, over its fan's speed";

  /* In pixels: room at the edges for the dot, the curve's weight, and the dot. */
  const INSET = 4;
  const LINE_WIDTH = 1;
  const DOT_RADIUS = 3.5;
  const RESTING_COLOUR = "var(--color-muted)";
  const DOT_COLOUR = "var(--color-primary)";

  let {
    rack,
    cautionColour,
    warningColour,
  }: { rack: NetworkRack; cautionColour: string; warningColour: string } = $props();

  const visibility = faceVisibility();
  const gradientId = `network-rack-${Math.random().toString(36).slice(2)}`;
  let temperatures = $state<HistoryState[]>([]);
  let fans = $state<HistoryState[]>([]);
  let fetchedAt = $state(Date.now());
  let width = $state(0);
  let height = $state(0);

  const inside = $derived(ha.number(rack.entity_id, Number.NaN));
  const tier = $derived(tierOf(Number.isFinite(inside) ? inside : null, rack.caution_above, rack.warning_above));
  const tierColour = $derived(tier === WARNING ? warningColour : tier === CAUTION ? cautionColour : null);

  function valueOf(entityId: string | null): number | null {
    const value = ha.number(entityId, Number.NaN);

    return Number.isFinite(value) ? value : null;
  }

  function shown(value: number): string {
    return formatStat(String(value), DECIMALS, rack.unit) ?? UNKNOWN;
  }

  function readings(history: HistoryState[]): { at: number; value: number }[] {
    return history
      .map((entry) => ({ at: new Date(entry.last_changed ?? "").getTime(), value: Number(entry.state) }))
      .filter((each) => Number.isFinite(each.at) && Number.isFinite(each.value));
  }

  const chart = $derived.by(() => {
    const start = fetchedAt - HOURS * MILLISECONDS_PER_HOUR;
    const temperature = averaged(readings(temperatures), fetchedAt, HOURS, SLICES);
    if (temperature.length < 2 || width === 0 || height === 0) {
      return null;
    }

    const x = (at: number) => INSET + ((Math.max(at, start) - start) / (fetchedAt - start)) * (width - 2 * INSET);
    const y = (fraction: number) => height - INSET - fraction * (height - 2 * INSET);

    const values = temperature.map((each) => each.value);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const span = high - low || 1;
    const points = temperature.map((each) => ({ x: x(each.at), y: y((each.value - low) / span) }));

    const fan = averaged(readings(fans), fetchedAt, HOURS, SLICES).map((each) => ({
      x: x(each.at),
      y: y(Math.min(each.value, rack.fan_max) / rack.fan_max),
    }));
    const area = fan.length > 1 ? areaPath(fan, x(start), x(fetchedAt), y(0)) : null;

    // Where each threshold falls on the curve's scale, as a share of the way up. One the day never
    // reached has no step at all; one it was always past steps at the bottom.
    const at = (threshold: number | null) =>
      threshold === null || threshold > high ? null : Math.max(0, (threshold - low) / span);

    return {
      cautionAt: at(rack.caution_above),
      warningAt: at(rack.warning_above),
      top: y(1),
      bottom: y(0),
      line: curvePath(points),
      latest: points[points.length - 1],
      area,
      low: formatStat(String(low), DECIMALS, rack.unit),
      high: formatStat(String(high), DECIMALS, rack.unit),
    };
  });

  async function refresh(): Promise<void> {
    try {
      const fan = rack.fan_entity_id;
      [temperatures, fans] = await Promise.all([
        fetchHistory(rack.entity_id, HOURS),
        fan ? fetchHistory(fan, HOURS) : Promise.resolve([]),
      ]);
      fetchedAt = Date.now();
    } catch {
      // The chart keeps what it last had; the next refresh tries again.
    }
  }

  $effect(() => {
    if (!visibility.showing) {
      return;
    }

    refresh();
    const timer = window.setInterval(refresh, REFRESH_MINUTES * MILLISECONDS_PER_MINUTE);

    return () => window.clearInterval(timer);
  });
</script>

<section
  class="network-card network-rack"
  class:network-rack--caution={tier === CAUTION}
  class:network-rack--warning={tier === WARNING}
  style:--network-rack-tier={tierColour}
  style:--network-rack-breathe="{BREATHE_MS}{MILLISECONDS}"
  style:--network-rack-flash="{FLASH_MS}{MILLISECONDS}"
>
  <!-- The title, and the readings opposite it, so the chart has the rest of the card. -->
  <header class="network-rack__header">
    <h3 class="network-card__title">{rack.title}</h3>

    <div class="network-rack__now">
      {#if rack.upper_entity_id || rack.lower_entity_id}
        <span class="network-rack__ends">
          {#if rack.upper_entity_id}
            <span><Icon name={UPPER_ICON} /> <SlidingNumber value={valueOf(rack.upper_entity_id)} format={shown} fallback={UNKNOWN} /></span>
          {/if}
          {#if rack.lower_entity_id}
            <span><Icon name={LOWER_ICON} /> <SlidingNumber value={valueOf(rack.lower_entity_id)} format={shown} fallback={UNKNOWN} /></span>
          {/if}
        </span>
      {/if}

      <span
        class="network-rack__inside"
        class:network-rack__inside--caution={tier === CAUTION}
        class:network-rack__inside--warning={tier === WARNING}
        style:color={tierColour}
      >
        <SlidingNumber value={valueOf(rack.entity_id)} format={shown} fallback={UNKNOWN} />
      </span>
    </div>
  </header>

  <div class="network-rack__chart">
    <div class="network-rack__plot" bind:clientWidth={width} bind:clientHeight={height}>
      {#if chart}
        <svg viewBox="0 0 {width} {height}" role="img" aria-label={LABELLED}>
          <!-- Hard steps up the curve's height, from grey to each tier's colour at its threshold. -->
          <defs>
            <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={chart.bottom} y2={chart.top}>
              <stop offset="0" stop-color={RESTING_COLOUR} />
              {#if chart.cautionAt !== null}
                <stop offset={chart.cautionAt} stop-color={RESTING_COLOUR} />
                <stop offset={chart.cautionAt} stop-color={cautionColour} />
              {/if}
              {#if chart.warningAt !== null}
                <stop offset={chart.warningAt} stop-color={chart.cautionAt !== null ? cautionColour : RESTING_COLOUR} />
                <stop offset={chart.warningAt} stop-color={warningColour} />
              {/if}
            </linearGradient>
          </defs>
          {#if chart.area}<path class="network-rack__fan" d={chart.area} />{/if}
          <path d={chart.line} fill="none" stroke="url(#{gradientId})" stroke-width={LINE_WIDTH} />
          <circle cx={chart.latest.x} cy={chart.latest.y} r={DOT_RADIUS} fill={tierColour ?? DOT_COLOUR} />
        </svg>
      {/if}
    </div>

    <span class="network-rack__axis">
      <span>{chart?.high ?? ""}</span>
      <span>{chart?.low ?? ""}</span>
    </span>
  </div>
</section>

<style>
  .network-rack {
    display: flex;
    flex-direction: column;
  }

  /* The frame keeps the temperature's beat in its colour: breathing for a caution, flashing for a warning. */
  .network-rack--caution {
    border-color: var(--network-rack-tier);
    animation: network-rack-frame-breathe var(--network-rack-breathe) ease-in-out infinite;
  }

  .network-rack--warning {
    border-color: var(--network-rack-tier);
    animation: network-rack-frame-flash var(--network-rack-flash) steps(1, end) infinite;
  }

  .network-rack--caution .network-card__title {
    color: var(--network-rack-tier);
    animation: network-rack-breathe var(--network-rack-breathe) ease-in-out infinite;
  }

  .network-rack--warning .network-card__title {
    color: var(--network-rack-tier);
    animation: network-rack-flash var(--network-rack-flash) steps(1, end) infinite;
  }

  .network-rack__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1em;
    margin-bottom: var(--network-rack-header-gap);
  }

  .network-rack__header .network-card__title {
    margin: 0;
  }

  .network-rack__now {
    display: flex;
    align-items: stretch;
    gap: 0.7em;
  }

  .network-rack__inside {
    color: var(--color-foreground);
    font-size: var(--network-host-name-size);
    font-weight: var(--weight-thin);
    line-height: 1;
    font-variant-numeric: tabular-nums;
    transition: color var(--colour-fade);
  }

  .network-rack__inside--caution {
    animation: network-rack-breathe var(--network-rack-breathe) ease-in-out infinite;
  }

  .network-rack__inside--warning {
    animation: network-rack-flash var(--network-rack-flash) steps(1, end) infinite;
  }

  /* The top of the rack over its bottom, as tall together as the inside temperature beside them. */
  .network-rack__ends {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    color: var(--color-muted);
    font-size: var(--network-host-small-size);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .network-rack__chart {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.4em;
    min-height: var(--network-rack-chart-min);
  }

  .network-rack__axis {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    color: var(--color-dim);
    font-size: var(--network-host-small-size);
    line-height: 1;
    font-variant-numeric: tabular-nums;
    text-align: left;
  }

  .network-rack__plot {
    position: relative;
    min-width: 0;
    min-height: 0;
  }

  .network-rack__plot svg {
    position: absolute;
    inset: 0;
    overflow: visible;
  }

  .network-rack__fan {
    fill: var(--color-faint);
  }

  @keyframes network-rack-breathe {
    50% {
      filter: brightness(0.45);
    }
  }

  @keyframes network-rack-flash {
    50% {
      opacity: 0;
    }
  }

  @keyframes network-rack-frame-breathe {
    50% {
      border-color: var(--color-faint);
    }
  }

  @keyframes network-rack-frame-flash {
    50% {
      border-color: var(--color-faint);
    }
  }
</style>
