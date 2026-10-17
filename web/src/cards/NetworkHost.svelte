<script lang="ts">
  import { fetchHistory } from "../lib/api";
  import { faceVisibility } from "../lib/cube.svelte";
  import { bootedAt, formatLatency, formatRuntime, formatSpan, heartbeatSlices, uptimeSlices } from "../lib/network";
  import { ha } from "../lib/state.svelte";
  import SlidingNumber from "./SlidingNumber.svelte";
  import { PULSE_MS } from "../lib/travel";
  import type { HistoryState, NetworkHost } from "../lib/types";

  /*
   * A machine worth a card of its own: its name and address, whether it has stayed up, how hard
   * it is working, and what it is running on.
   *
   * The strip is the connection's history, a dot to each slice of it: primary for a slice spent
   * up, secondary for one it dropped out in, dim for one spent down, and faint where Home
   * Assistant has nothing to say. It is fetched while the face is looked at, again whenever the
   * connection changes, and every few minutes besides. The host doing the pinging cannot see
   * itself drop out, so its strip is read from the gaps in a heartbeat instead, and one with
   * neither has none.
   *
   * A host whose UPS has gone to battery pulses in the secondary colour, its frame and its power
   * reading both, for as long as the mains is out: its time is running down. One that has gone
   * offline flashes its frame in the master warning's red, the panel's mark for a warning lit. Its
   * name keeps its frame's colour and beat either way.
   *
   * How long it has been up since it last booted, in its largest unit alone, sits in the top
   * corner opposite its name.
   */

  const UPTIME_HOURS = 24;
  const SLICES = 36;
  const REFRESH_MINUTES = 5;
  const MILLISECONDS_PER_MINUTE = 60_000;
  const REFRESH_MS = REFRESH_MINUTES * MILLISECONDS_PER_MINUTE;
  const MILLISECONDS = "ms";
  const FLASH_MS = 1000;
  const CONNECTED = ["on"];
  const ONE_UNIT = 1;
  const PERCENT = 100;
  const SHARE_DECIMALS = 2;

  const UPS_ON_MAINS = "normal";
  const CAPACITY_ATTRIBUTE = "capacity";
  const RUNTIME_ATTRIBUTE = "runtime_remaining";

  /* Each reading, from the metrics sensor's attribute as a fraction, or its own sensor in percent. */
  const UTILIZATIONS = [
    { label: "CPU", attribute: "cpu_utilization", entity: "cpu_entity_id" },
    { label: "Memory", attribute: "memory_utilization", entity: "memory_entity_id" },
    { label: "Disk", attribute: "disk_utilization", entity: "disk_entity_id" },
  ] as const;

  let { host, offlineColour }: { host: NetworkHost; offlineColour: string } = $props();

  const visibility = faceVisibility();
  let history = $state<HistoryState[]>([]);
  let fetchedAt = $state(new Date());

  const connected = $derived(ha.state(host.connection_entity_id));
  const up = $derived(connected === null ? null : CONNECTED.includes(connected));
  /* Where the strip comes from: the connection's history, or else the heartbeat's gaps. */
  const tracked = $derived(host.connection_entity_id ?? host.heartbeat_entity_id);

  function sliced(count: number): (number | null)[] {
    return host.connection_entity_id
      ? uptimeSlices(history, CONNECTED, fetchedAt, UPTIME_HOURS, count)
      : heartbeatSlices(history, fetchedAt, UPTIME_HOURS, count, host.heartbeat_seconds);
  }

  const slices = $derived(sliced(SLICES));
  const share = $derived(sliced(1)[0]);
  const address = $derived(ha.state(host.address_entity_id));
  let now = $state(Date.now());

  const booted = $derived(
    bootedAt(host.booted_attribute ? ha.attribute<string>(host.booted_entity_id, host.booted_attribute) : ha.state(host.booted_entity_id)),
  );
  const uptime = $derived(booted ? formatSpan(now - booted.getTime(), ONE_UNIT) : null);

  const latency = $derived.by(() => {
    const value = Number(ha.state(host.latency_entity_id));

    return up && Number.isFinite(value) && ha.state(host.latency_entity_id) !== null ? value : null;
  });

  function utilization(attribute: string, entityId: string | null): number | null {
    const fraction = ha.attribute<number>(host.metrics_entity_id, attribute);
    if (typeof fraction === "number") {
      return fraction;
    }

    const percent = Number(ha.state(entityId));

    return ha.state(entityId) !== null && Number.isFinite(percent) ? percent / PERCENT : null;
  }

  const utilizations = $derived(
    UTILIZATIONS.map(({ label, attribute, entity }) => ({ label, value: utilization(attribute, host[entity]) })).filter(
      (each) => each.value !== null,
    ),
  );

  const ups = $derived.by(() => {
    const state = ha.state(host.ups_entity_id);
    if (state === null) {
      return null;
    }

    const runtime = ha.attribute<number>(host.ups_entity_id, RUNTIME_ATTRIBUTE);

    return {
      onMains: state === UPS_ON_MAINS,
      capacity: ha.attribute<number>(host.ups_entity_id, CAPACITY_ATTRIBUTE),
      runtime: runtime === null ? null : Number(runtime),
    };
  });

  function sliceClass(slice: number | null): string {
    if (slice === null) {
      return "network-host__slice--unknown";
    }

    if (slice >= 1) {
      return "network-host__slice--up";
    }

    return slice > 0 ? "network-host__slice--dropped" : "network-host__slice--down";
  }

  async function refresh(entityId: string): Promise<void> {
    try {
      history = await fetchHistory(entityId, UPTIME_HOURS);
      fetchedAt = new Date();
    } catch {
      // The strip keeps what it last had; the next refresh tries again.
    }
  }

  $effect(() => {
    const source = tracked;
    if (!visibility.showing || source === null) {
      return;
    }

    // Read so a change in the connection fetches the strip again.
    void connected;
    refresh(source);

    const timer = window.setInterval(() => {
      refresh(source);
      now = Date.now();
    }, REFRESH_MS);

    return () => window.clearInterval(timer);
  });
</script>

<article
  class="network-host"
  class:network-host--down={up === false}
  class:network-host--battery={ups !== null && !ups.onMains}
  class:card--alert={up === false || (ups !== null && !ups.onMains)}
  style:--network-host-pulse="{PULSE_MS}{MILLISECONDS}"
  style:--network-host-flash="{FLASH_MS}{MILLISECONDS}"
  style:--network-host-offline={offlineColour}
>
  <header class="network-host__header">
    <h3 class="network-host__name card-title">{ha.state(host.name_entity_id) ?? host.name ?? ""}</h3>
    {#if uptime && up !== false}<span class="network-host__uptime-since">{uptime}</span>{/if}
    <span class="network-host__address">{address ?? ""}</span>
  </header>

  {#if tracked}
    <div class="network-host__uptime">
      <div class="network-host__strip">
        {#each slices as slice, index (index)}
          <span class="network-host__slice {sliceClass(slice)}"></span>
        {/each}
      </div>
      <div class="network-host__axis">
        <span>{UPTIME_HOURS} h</span>
        <span class="network-host__share">{share === null ? "—" : `${(share * PERCENT).toFixed(SHARE_DECIMALS)}%`}</span>
        <span>now</span>
      </div>
    </div>
  {/if}

  {#if utilizations.length > 0}
    <dl class="network-host__levels">
      {#each utilizations as { label, value } (label)}
        {@const percent = Math.round((value as number) * PERCENT)}
        <dt>{label}</dt>
        <dd class="network-host__bar">
          <span class="network-host__fill" style:width="{Math.min(percent, PERCENT)}%"></span>
        </dd>
        <dd class="network-host__percent">
          <SlidingNumber value={percent} format={(each) => `${Math.round(each)}%`} fallback="" />
        </dd>
      {/each}
    </dl>
  {/if}

  <footer class="network-host__footer">
    <span class="network-host__latency">
      {#if up === false}
        Down
      {:else if latency !== null}
        <SlidingNumber value={latency} format={(each) => `${formatLatency(each)} ms`} fallback="" />
      {/if}
    </span>
    {#if ups}
      <span class="network-host__ups" class:network-host__ups--battery={!ups.onMains}>
        {#if ups.onMains}
          Mains
        {:else}
          Battery{ups.capacity !== null ? ` ${ups.capacity}%` : ""}
        {/if}
        {#if ups.runtime !== null && Number.isFinite(ups.runtime)}· {formatRuntime(ups.runtime)}{/if}
      </span>
    {/if}
  </footer>
</article>

<style>
  .network-host {
    display: flex;
    flex-direction: column;
    gap: var(--network-host-gap);
    min-width: 0;
    padding: var(--network-host-padding);
    border: 1px solid var(--color-faint);
    border-radius: var(--network-host-radius);
  }

  /* The name over its address, and how long it has been up in the corner opposite the name. */
  .network-host__header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
  }

  .network-host__address {
    grid-column: 1 / -1;
  }

  /* Pinned to the corner, not sat on the name's baseline. */
  .network-host__uptime-since {
    align-self: start;
    color: var(--color-muted);
    font-size: var(--network-host-detail-size);
    font-variant-numeric: tabular-nums;
  }

  .network-host__name {
    margin: 0;
    color: var(--color-foreground);
    font-size: var(--network-host-name-size);
    font-weight: var(--weight-thin);
    line-height: 1.1;
    transition: color var(--colour-fade);
  }

  .network-host--down .network-host__name {
    color: var(--network-host-offline);
    animation: network-host-name-flash var(--network-host-flash) steps(1, end) infinite;
  }

  .network-host--battery .network-host__name {
    color: var(--color-secondary);
    animation: network-host-name-pulse var(--network-host-pulse) ease-in-out infinite;
  }

  @keyframes network-host-name-flash {
    50% {
      color: var(--color-faint);
    }
  }

  @keyframes network-host-name-pulse {
    50% {
      opacity: var(--travel-pulse-opacity);
    }
  }

  .network-host__address {
    color: var(--color-muted);
    font-size: var(--network-host-detail-size);
    font-variant-numeric: tabular-nums;
  }

  .network-host__strip {
    display: flex;
    justify-content: space-between;
    gap: 2px;
  }

  .network-host__slice {
    flex: 0 1 var(--network-host-slice);
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--color-faint);
  }

  .network-host__slice--up {
    background: var(--color-primary);
  }

  .network-host__slice--dropped {
    background: var(--color-secondary);
  }

  .network-host__slice--down {
    background: var(--color-dim);
  }

  .network-host__axis {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    margin-top: 0.35em;
    color: var(--color-dim);
    font-size: var(--network-host-small-size);
  }

  .network-host__axis > :last-child {
    text-align: right;
  }

  .network-host__share {
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }

  .network-host__levels {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.35em 0.6em;
    margin: 0;
    color: var(--color-muted);
    font-size: var(--network-host-small-size);
  }

  .network-host__levels dd {
    margin: 0;
  }

  /* A level is a line, never a block: a grey fill whose leading edge alone is primary. */
  .network-host__bar {
    position: relative;
    height: var(--network-host-bar);
    background: var(--color-faint);
  }

  .network-host__fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--color-dim);
    border-right: var(--network-host-edge) solid var(--color-primary);
    transition: width var(--colour-fade);
  }

  .network-host__percent {
    min-width: 2.6em;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .network-host__footer {
    display: flex;
    justify-content: space-between;
    margin-top: auto;
    color: var(--color-muted);
    font-size: var(--network-host-detail-size);
    font-variant-numeric: tabular-nums;
  }

  .network-host--down {
    animation: network-host-flash var(--network-host-flash) steps(1, end) infinite;
  }

  @keyframes network-host-flash {
    0% {
      border-color: var(--network-host-offline);
    }

    50% {
      border-color: var(--color-faint);
    }
  }

  .network-host--battery {
    border-color: var(--color-secondary);
    animation: network-host-pulse var(--network-host-pulse) ease-in-out infinite;
  }

  .network-host__ups--battery {
    color: var(--color-secondary);
  }

  /* Down nearly to nothing and back, with a glow of its own colour at the top of each beat. */
  @keyframes network-host-pulse {
    0%,
    100% {
      box-shadow: 0 0 var(--travel-pulse-glow) var(--color-secondary);
    }

    50% {
      box-shadow: none;
      border-color: var(--color-faint);
    }
  }
</style>
