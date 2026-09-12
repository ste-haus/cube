<script lang="ts">
  import Moon from "./Moon.svelte";
  import RangeBar from "./RangeBar.svelte";
  import { faceVisibility } from "../lib/cube.svelte";
  import { strftime } from "../lib/format";
  import { daylightAt, moonPhase, timeLeft } from "../lib/sky";
  import { ha } from "../lib/state.svelte";
  import type { Clock, Weather } from "../lib/types";

  /*
   * The stretch of daylight or darkness we are in, as a bar from the sunrise or sunset that began
   * it to the one that ends it. By day it runs sunrise to sunset; after dark the ends change
   * places and it runs sunset to sunrise, so the marker always travels left to right and the
   * reading under it is always how long is left. It reads under the bar so that it can sit close
   * beneath a bar that reads over its own.
   */

  /* The reading over the marker changes no more often than once a minute. */
  const TICK_MS = 60 * 1000;

  const LATITUDE_ATTRIBUTE = "latitude";
  const LONGITUDE_ATTRIBUTE = "longitude";
  const PERCENT = 100;

  /* Twilight at both ends, fading into the day or the night over as much of the bar as the light
   * really takes to change: golden hour by day, civil twilight by night. */
  const GRADIENT_DIRECTION = "to right";
  const TWILIGHT = "var(--color-twilight)";
  const DAY = "var(--color-day)";
  const NIGHT = "var(--color-night)";
  const SUN_DOT = "var(--color-sun)";
  const EQUATOR = 0;

  let { weather, clock }: { weather: Weather; clock: Clock } = $props();

  const visibility = faceVisibility();

  let now = $state(new Date());

  $effect(() => {
    if (!visibility.showing) {
      return;
    }

    now = new Date();

    const timer = window.setInterval(() => {
      now = new Date();
    }, TICK_MS);

    return () => window.clearInterval(timer);
  });

  const latitude = $derived(ha.attribute<number>(weather.zone_entity_id, LATITUDE_ATTRIBUTE));
  const longitude = $derived(ha.attribute<number>(weather.zone_entity_id, LONGITUDE_ATTRIBUTE));

  const daylight = $derived(
    latitude !== null && longitude !== null ? daylightAt(now, latitude, longitude) : null,
  );

  const left = $derived(daylight ? timeLeft(daylight.to.getTime() - now.getTime()) : null);

  /* After dark the dot is the moon, drawn as the horizon draws it. */
  const phase = $derived(moonPhase(now));
  const southern = $derived((latitude ?? EQUATOR) < EQUATOR);

  function gradient(core: string, startFade: number, endFade: number): string {
    const settled = startFade * PERCENT;
    const turning = PERCENT - endFade * PERCENT;

    return `linear-gradient(${GRADIENT_DIRECTION}, ${TWILIGHT}, ${core} ${settled}%, ${core} ${turning}%, ${TWILIGHT})`;
  }
</script>

{#if daylight}
  <RangeBar
    start={{ value: strftime(daylight.from, clock.time_format) }}
    end={{ value: strftime(daylight.to, clock.time_format) }}
    background={gradient(daylight.up ? DAY : NIGHT, daylight.startFade, daylight.endFade)}
    position={daylight.progress * PERCENT}
    reading={left ? String(left.amount) : null}
    unit={left?.unit ?? null}
    below
    dot={daylight.up ? SUN_DOT : null}
    marker={daylight.up ? undefined : moon}
  />
{/if}

{#snippet moon()}
  <Moon {phase} {southern} />
{/snippet}
