<script lang="ts">
  import { cubicInOut } from "svelte/easing";
  import type { TransitionConfig } from "svelte/transition";
  import { TAP_SLOP_PX } from "../lib/cube.svelte";
  import Icon from "../lib/Icon.svelte";
  import { bannerText, incidentsOf, severityColour, wantsLightType, worstSeverity, type Incident } from "../lib/incidents";
  import type { Box } from "../lib/picture";
  import { ha } from "../lib/state.svelte";
  import type { Labels } from "../lib/types";
  import IncidentsWindow from "./IncidentsWindow.svelte";

  /*
   * A band over the traffic map while there are traffic incidents, naming the roads they are on.
   * It slides down out from under the map's heading when the first comes in, and back up under it
   * when the last clears. It takes the worst incident's colour: primary for minor, secondary for
   * major, the order the fuel gauges' bands run in, and red for critical. A tap opens a window out
   * of it listing every incident, in the same colour.
   */

  const INCIDENTS_ATTRIBUTE = "incidents";
  const BANNER_ICON = "mdi:car-brake-alert";
  const SLIDE_MS = 420;
  const WHOLE = 1;
  const PERCENT = 100;
  const PIXELS = "px";

  let { entityId, criticalColour, labels }: { entityId: string; criticalColour: string; labels: Labels } = $props();

  const incidents = $derived(incidentsOf(ha.attribute(entityId, INCIDENTS_ATTRIBUTE)));

  /* What the banner last said, kept while it slides away so it leaves with its words on it. */
  let last = $state<Incident[]>([]);

  $effect(() => {
    if (incidents.length > 0) {
      last = incidents;
    }
  });

  const shown = $derived(incidents.length > 0 ? incidents : last);

  const colour = $derived(severityColour(worstSeverity(shown), criticalColour));
  const lightType = $derived(wantsLightType(colour));

  let opened = $state<Box | null>(null);
  let away = $state(false);
  let band = $state<HTMLElement | null>(null);
  let pressedAt: { x: number; y: number } | null = null;

  /*
   * Down from under the heading and back up into it: the room opens as the band drops into it, so
   * the map moves aside as it comes rather than being drawn over.
   */
  function drop(node: HTMLElement): TransitionConfig {
    const height = node.offsetHeight;

    return {
      duration: SLIDE_MS,
      easing: cubicInOut,
      css: (progress) =>
        `height: ${height * progress}${PIXELS}; overflow: hidden; --incident-drop: ${(progress - WHOLE) * PERCENT}%;`,
    };
  }

  function press(event: PointerEvent): void {
    pressedAt = { x: event.clientX, y: event.clientY };
  }

  /* The map under it opens a window of its own when tapped, so the tap stops here. */
  function open(event: MouseEvent): void {
    event.stopPropagation();

    const moved = pressedAt ? Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) : 0;
    pressedAt = null;

    if (opened !== null || band === null || moved > TAP_SLOP_PX) {
      return;
    }

    const box = band.getBoundingClientRect();
    opened = { left: box.left, top: box.top, width: box.width, height: box.height };
    away = true;
  }

  function closed(): void {
    opened = null;
    away = false;
  }
</script>

{#if incidents.length > 0}
  <div class="incident-banner" transition:drop>
    <div class="incident-banner__drop">
      <button
        type="button"
        class="incident-banner__band"
        class:incident-banner__band--away={away}
        class:incident-banner__band--light-type={lightType}
        style:--incident-colour={colour}
        bind:this={band}
        onpointerdown={press}
        onclick={open}
      >
        <span class="incident-banner__icon"><Icon name={BANNER_ICON} /></span>
        <span class="incident-banner__text">{bannerText(shown, labels)}</span>
      </button>
    </div>
  </div>
{/if}

{#if opened}
  <IncidentsWindow
    incidents={shown}
    live={incidents.length > 0}
    {colour}
    {lightType}
    {criticalColour}
    {labels}
    from={opened}
    onlanding={() => (away = false)}
    onclose={closed}
  />
{/if}

<style>
  .incident-banner__drop {
    padding-bottom: var(--incident-banner-gap);
    transform: translateY(var(--incident-drop, 0));
  }

  .incident-banner__band {
    display: flex;
    align-items: center;
    gap: 0.6em;
    width: 100%;
    padding: var(--incident-banner-padding);
    border: 0;
    background: var(--incident-colour);
    color: var(--color-background);
    font: inherit;
    font-size: var(--incident-banner-size);
    font-weight: var(--weight-medium);
    letter-spacing: 0.04em;
    text-align: left;
    cursor: pointer;
    transition: background-color var(--colour-fade) ease;
  }

  /* A band coloured too dark for dark type to read on it. */
  .incident-banner__band--light-type {
    color: var(--color-foreground);
  }

  /* Hidden while its window is open, so the brackets read as lifting it off the map. */
  .incident-banner__band--away {
    visibility: hidden;
  }

  .incident-banner__icon {
    flex: 0 0 auto;
  }

  .incident-banner__text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
