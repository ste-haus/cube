<script lang="ts">
  import Icon from "../lib/Icon.svelte";
  import { compassPoint, thresholdColor } from "../lib/format";
  import { ha } from "../lib/state.svelte";
  import type { Indicator, StatusIndicator } from "../lib/types";

  const MDI_PREFIX = "mdi:";

  let {
    indicators,
    statusIndicators,
  }: { indicators: Indicator[]; statusIndicators: StatusIndicator[] } = $props();

  function colorFor(indicator: Indicator, value: string | null): string | null {
    if (!indicator.scale || value === null) {
      return null;
    }

    return thresholdColor(indicator.scale, Number(value));
  }

  // An entity may name an icon from a set the panel does not ship, so anything that is not a
  // Material Design icon falls back to the one configured alongside it.
  function iconFor(indicator: Indicator): string | null {
    if (!indicator.icon_attribute) {
      return indicator.icon;
    }

    const named = ha.attribute<string>(indicator.entity_id, indicator.icon_attribute);

    return named?.startsWith(MDI_PREFIX) ? named : indicator.icon;
  }

  function format(indicator: Indicator, value: string): string {
    if (indicator.precision === null) {
      return value;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed.toFixed(indicator.precision) : value;
  }

  function bearingFor(indicator: Indicator): string | null {
    const bearing = ha.reading(indicator.bearing);

    return bearing === null ? null : compassPoint(Number(bearing));
  }

  // A status indicator earns its place only while it is off its nominal state.
  const active = $derived(
    statusIndicators.filter((indicator) => {
      const state = ha.state(indicator.entity_id);

      return state !== null && state !== indicator.nominal_state;
    }),
  );
</script>

<div class="indicators">
  {#each active as indicator (indicator.entity_id)}
    {@const state = ha.state(indicator.entity_id)}
    {@const text = indicator.attribute ? ha.reading(indicator) : null}
    <span
      class="indicators__item"
      class:indicators__item--pulsing={state && indicator.pulsing_states.includes(state)}
      style:color={state ? indicator.state_colors[state] : null}
    >
      <Icon name={indicator.icon} />
      {#if text}<span class="indicators__value">{text}</span>{/if}
    </span>
  {/each}

  {#each indicators as indicator (indicator.entity_id + indicator.icon)}
    {@const value = ha.reading(indicator)}
    {#if value !== null}
      {@const bearing = bearingFor(indicator)}
      {@const icon = iconFor(indicator)}
      <span class="indicators__item" style:color={colorFor(indicator, value)}>
        <Icon name={icon} />
        <span class="indicators__value">
          {format(indicator, value)}{indicator.suffix}{#if bearing}&nbsp;{bearing}{/if}
        </span>
      </span>
    {/if}
  {/each}
</div>

<style>
  .indicators {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    /* One line, always. Wrapping a reading onto a second row reads as a fault, not a layout. */
    flex-wrap: nowrap;
    gap: 0.85em;
    height: 100%;
    color: var(--color-muted);
    font-size: var(--indicator-size);
    font-weight: var(--weight-light);
    white-space: nowrap;
  }

  .indicators__item {
    display: inline-flex;
    align-items: center;
    gap: 0.25em;
  }

  .indicators__item--pulsing {
    animation: pulse 3s linear infinite;
  }

  .indicators__value {
    font-variant-numeric: tabular-nums;
  }
</style>
