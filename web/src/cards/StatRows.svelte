<script lang="ts">
  import Icon from "../lib/Icon.svelte";
  import SlidingNumber from "./SlidingNumber.svelte";
  import { formatStat } from "../lib/network";
  import { ha } from "../lib/state.svelte";
  import type { NetworkStat } from "../lib/types";

  /* Readings one to a row: an icon, what each is, and its value at the right edge, sliding to a new
   * value rather than jumping. */

  const UNKNOWN = "—";

  let { rows, size = "regular" }: { rows: NetworkStat[]; size?: "small" | "regular" } = $props();

  function valueOf(row: NetworkStat): number | null {
    const reading = ha.reading({ entity_id: row.entity_id, attribute: row.attribute });
    const value = Number(reading);

    return reading !== null && reading !== "" && Number.isFinite(value) ? value : null;
  }
</script>

<dl class="stat-rows stat-rows--{size}">
  {#each rows as row (row.label)}
    <dt class="stat-rows__label">
      <span class="stat-rows__icon">{#if row.icon}<Icon name={row.icon} />{/if}</span>
      {row.label}
    </dt>
    <dd class="stat-rows__value">
      <SlidingNumber
        value={valueOf(row)}
        format={(value) => formatStat(String(value), row.decimals, row.unit) ?? UNKNOWN}
        fallback={UNKNOWN}
      />
    </dd>
  {/each}
</dl>

<style>
  .stat-rows {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 0.3em 1em;
    margin: 0;
    font-size: var(--network-host-detail-size);
  }

  /* The type and spacing of a small containers card's rows, so a card beside one lines up with it. */
  .stat-rows--small {
    row-gap: 0.25em;
    font-size: var(--network-host-small-size);
  }

  .stat-rows__label {
    display: flex;
    align-items: baseline;
    gap: 0.5em;
    overflow: hidden;
    color: var(--color-muted);
    white-space: nowrap;
  }

  .stat-rows__icon {
    flex: 0 0 1.2em;
    color: var(--color-dim);
    text-align: center;
  }

  .stat-rows__value {
    margin: 0;
    color: var(--color-foreground);
    font-variant-numeric: tabular-nums;
  }
</style>
