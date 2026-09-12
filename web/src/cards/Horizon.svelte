<script lang="ts">
  import { faceVisibility } from "../lib/cube.svelte";
  import { strftime } from "../lib/format";
  import Moon from "./Moon.svelte";
  import { SKY_HEIGHT, SKY_WIDTH, skyAt } from "../lib/sky";
  import { ha } from "../lib/state.svelte";
  import type { Clock, Labels, Weather } from "../lib/types";

  /* The sky moves past now at a card's width a day, so a minute is well under a pixel of travel. */
  const TICK_MS = 60 * 1000;

  const LATITUDE_ATTRIBUTE = "latitude";
  const LONGITUDE_ATTRIBUTE = "longitude";
  const EQUATOR = 0;
  const PERCENT = 100;

  let {
    weather,
    clock,
    labels,
    labelled = true,
  }: {
    weather: Weather;
    clock: Clock;
    labels: Labels;
    /** Whether to caption sunrise and sunset, which a daylight bar beside it may already do. */
    labelled?: boolean;
  } = $props();

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

  const sky = $derived(latitude !== null && longitude !== null ? skyAt(now, latitude, longitude) : null);
  const southern = $derived((latitude ?? EQUATOR) < EQUATOR);

  const events = $derived(
    sky
      ? [
          { label: labels.sunrise, at: sky.sunrise, x: sky.sunriseX },
          { label: labels.sunset, at: sky.sunset, x: sky.sunsetX },
        ]
      : [],
  );

  function across(x: number): number {
    return (x / SKY_WIDTH) * PERCENT;
  }

  function down(y: number): number {
    return (y / SKY_HEIGHT) * PERCENT;
  }
</script>

<section class="horizon">
  {#if sky}
    {#if labelled}
      <div class="horizon__labels">
        {#each events as event (event.label)}
          {#if event.at && event.x !== null}
            <div class="horizon__label" style:left="{across(event.x)}%">
              <span class="horizon__label-name">{event.label}</span>
              <span class="horizon__label-time">{strftime(event.at, clock.time_format)}</span>
            </div>
          {/if}
        {/each}
      </div>
    {/if}

    <div class="horizon__sky">
      <svg viewBox="0 0 {SKY_WIDTH} {SKY_HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
        <path class="horizon__night" d={sky.night} />
        <path class="horizon__day" d={sky.day} />
        <!-- Leader lines up to the captions, so only with them. -->
        {#if labelled}
          {#each events as event (event.label)}
            {#if event.x !== null}
              <line class="horizon__tick" x1={event.x} y1="0" x2={event.x} y2={sky.horizon} />
            {/if}
          {/each}
        {/if}
        <path class="horizon__curve" d={sky.curve} />
        <line class="horizon__line" x1="0" y1={sky.horizon} x2={SKY_WIDTH} y2={sky.horizon} />
      </svg>

      <!-- Behind the sun, so the two passing each other reads as an eclipse rather than a clash. -->
      <div class="horizon__moon" style:left="{across(sky.moon.x)}%" style:top="{down(sky.moon.y)}%">
        <Moon phase={sky.moonPhase} {southern} />
      </div>

      <div
        class="horizon__sun"
        class:horizon__sun--down={!sky.sunUp}
        style:left="{across(sky.sun.x)}%"
        style:top="{down(sky.sun.y)}%"
      ></div>
    </div>
  {/if}
</section>

<style>
  .horizon {
    display: flex;
    flex-direction: column;
  }

  .horizon__labels {
    position: relative;
    flex: 0 0 auto;
    height: var(--horizon-labels-height);
  }

  .horizon__label {
    position: absolute;
    top: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    transform: translateX(-50%);
    white-space: nowrap;
  }

  .horizon__label-name {
    color: var(--color-muted);
    font-size: var(--horizon-label-size);
  }

  .horizon__label-time {
    font-size: var(--horizon-time-size);
    font-weight: var(--weight-light);
  }

  /* The drawing has a shape of its own rather than the space it is given: stretched taller, the
   * curve steepens and the day looks like a spike. */
  .horizon__sky {
    position: relative;
    flex: none;
    aspect-ratio: var(--horizon-aspect);
  }

  .horizon__sky > svg:first-child {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  /* The drawing is stretched to the card, and a stroke stretched with it would be thick one way
   * and hairline the other. */
  .horizon__curve,
  .horizon__line,
  .horizon__tick {
    fill: none;
    vector-effect: non-scaling-stroke;
  }

  /* The day already gone, in the same faint wash as the chance of rain, so it sits behind the sun
   * rather than being the brightest thing in the sky. */
  .horizon__day {
    fill: var(--wash-color);
    fill-opacity: var(--wash-opacity);
  }

  .horizon__night {
    fill: var(--color-night);
  }

  .horizon__curve {
    stroke: var(--color-dim);
    stroke-width: 1.5;
  }

  .horizon__line {
    stroke: var(--color-dim);
    stroke-width: 1;
  }

  .horizon__tick {
    stroke: var(--color-faint);
    stroke-width: 1;
  }

  .horizon__sun,
  .horizon__moon {
    position: absolute;
    transform: translate(-50%, -50%);
  }

  .horizon__sun {
    width: var(--horizon-sun-size);
    height: var(--horizon-sun-size);
    border-radius: 50%;
    background-color: var(--color-sun);
  }

  /* Below the horizon the sun is a dusk rather than a light. */
  .horizon__sun--down {
    background-color: var(--color-sun-below);
  }

  .horizon__moon {
    width: var(--horizon-moon-size);
    height: var(--horizon-moon-size);
    /* Down and to the left of the sun it shares a moment with, so both stay legible. */
    margin-left: calc(var(--horizon-moon-size) * -0.45);
    margin-top: calc(var(--horizon-moon-size) * 0.45);
  }
</style>
