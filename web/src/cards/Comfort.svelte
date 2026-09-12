<script lang="ts">
  import { ha } from "../lib/state.svelte";
  import type { Weather } from "../lib/types";

  /*
   * How the weather feels: the temperature it feels like, in the middle of a ring that fills with
   * the humidity from the top round clockwise. The fill shades from a dark grey when the air is dry
   * to the muted blue of the rain's wash when it is saturated, so its colour says as much as its
   * length. The feels-like figure is greyed while it is within a couple of degrees of the
   * temperature itself, when it says little the temperature does not.
   */

  const FEELS_LIKE_ATTRIBUTE = "apparent_temperature";
  const TEMPERATURE_ATTRIBUTE = "temperature";
  const HUMIDITY_ATTRIBUTE = "humidity";
  const NEAR_DEGREES = 2;

  const DRY_COLOR = "var(--comfort-dry-color)";
  const HUMID_COLOR = "var(--comfort-humid-color)";

  /* The drawing's units: a box 200 across with the centre at its middle, as the wind's is. */
  const BOX = 200;
  const HALF_BOX = BOX / 2;
  const RING = 56;
  /* The ring's length, as its path counts it, so the fill is simply the humidity out of a hundred. */
  const WHOLE = 100;
  /* A circle's path starts at three o'clock; turned back a quarter, the fill starts at the top. */
  const FROM_THE_TOP = -90;
  const DRY = 0;

  let { weather }: { weather: Weather } = $props();

  function reading(attribute: string): number | null {
    const value = Number(ha.attribute<number>(weather.entity_id, attribute) ?? Number.NaN);

    return Number.isFinite(value) ? value : null;
  }

  const feelsLike = $derived(reading(FEELS_LIKE_ATTRIBUTE));
  const temperature = $derived(reading(TEMPERATURE_ATTRIBUTE));

  /* In the whole degrees both are shown in, so what reads as near on the face is near. */
  const near = $derived(
    feelsLike !== null &&
      temperature !== null &&
      Math.abs(Math.round(feelsLike) - Math.round(temperature)) <= NEAR_DEGREES,
  );

  const humidity = $derived.by(() => {
    const value = reading(HUMIDITY_ATTRIBUTE);

    return value === null ? null : Math.min(Math.max(Math.round(value), DRY), WHOLE);
  });

  const tint = $derived(`color-mix(in oklab, ${HUMID_COLOR} ${humidity ?? DRY}%, ${DRY_COLOR})`);
</script>

{#if feelsLike !== null || humidity !== null}
  <section class="comfort">
    <div class="comfort__dial">
      <svg viewBox="{-HALF_BOX} {-HALF_BOX} {BOX} {BOX}" aria-hidden="true">
        <circle class="comfort__track" r={RING} />
        {#if humidity !== null}
          <circle
            class="comfort__fill"
            r={RING}
            pathLength={WHOLE}
            stroke-dasharray="{humidity} {WHOLE}"
            transform="rotate({FROM_THE_TOP})"
            style:stroke={tint}
          />
        {/if}
      </svg>

      {#if feelsLike !== null}
        <span class="comfort__feels" class:comfort__feels--near={near}>{Math.round(feelsLike)}</span>
      {/if}
    </div>
  </section>
{/if}

<style>
  .comfort {
    display: flex;
    justify-content: center;
  }

  .comfort__dial {
    position: relative;
    width: var(--dial-size);
    height: var(--dial-size);
  }

  .comfort__dial svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  /* Drawn to the dial's own scale, so the ring thickens and thins with it. */
  .comfort__track,
  .comfort__fill {
    fill: none;
    stroke-width: 7;
  }

  .comfort__track {
    stroke: var(--color-faint);
  }

  .comfort__fill {
    stroke-linecap: round;
  }

  .comfort__feels {
    position: absolute;
    left: 50%;
    top: 50%;
    color: var(--color-foreground);
    font-size: var(--comfort-feels-size);
    font-weight: var(--weight-light);
    line-height: 1;
    white-space: nowrap;
    transform: translate(-50%, -50%);
  }

  .comfort__feels--near {
    color: var(--color-muted);
  }
</style>
