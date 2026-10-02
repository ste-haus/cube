<script lang="ts">
  import { TAP_SLOP_PX } from "../lib/cube.svelte";
  import PanelWindow from "./PanelWindow.svelte";
  import SliderBar from "./SliderBar.svelte";
  import {
    FULL_SATURATION,
    colourOf,
    hueAt,
    pointAtHue,
    readHueSaturation,
    sameColour,
    wantsLightType,
    xyToHueSaturation,
    type HueSaturation,
    type XyPoint,
  } from "../lib/hue";
  import { liveHue } from "../lib/live";
  import { pending } from "../lib/pending.svelte";
  import type { Box } from "../lib/picture";
  import { ha } from "../lib/state.svelte";
  import type { Labels, Slider, SliderFill } from "../lib/types";

  /*
   * A light's colour, picked on a wheel in a window opened out of whatever was held to ask for it:
   * the room light's bulb, or a light on the floorplan.
   *
   * Round the ring is every hue, red at the top; in the middle is the light's default colour, the
   * warm white of the "full" light profile unless it is given another. The band across the top is
   * whatever colour is showing, so the window says what the light is, or is about to be.
   *
   * The marker is the light's colour now, and it is what the finger drags. While it is held it throws
   * a wide glow of its own colour that breathes, so the colour under the finger shows round it. The
   * light follows the marker as it goes, paced so as not to flood it. Let go on the ring and the
   * light takes that hue, at full saturation; tap the middle and it takes its default. Either way
   * the window closes after it, back into what opened it, which shows the colour once Home Assistant
   * has it.
   *
   * Under the wheel is the light's brightness, on the same bar the guest face's lights and blinds
   * are set on, filled grey or in the light's colour as `fill` says. Setting it, by a drag or a tap,
   * closes the window as a colour does.
   *
   * A tap on the glass around it closes it without changing anything.
   */

  const HS_COLOR_ATTRIBUTE = "hs_color";
  const PRIMARY_BUTTON = 0;
  // Where the ring lies, as shares of the wheel's radius: what is pressable of it reaches a little
  // inside what is drawn, and the marker rides its middle.
  const RING_INNER = 0.68;
  const RING_MIDDLE = 0.84;
  const WHOLE = 50;
  const PERCENT = "%";
  const PERCENT_PER_SHARE = 100;
  const HUE_TURN = 360;
  const BRIGHTNESS_ICON = "mdi:brightness-6";

  type Gesture = "ring" | "default" | "abandoned";

  let {
    entityId,
    defaultXy,
    fill,
    from,
    labels,
    onclose,
  }: {
    entityId: string;
    defaultXy: [number, number];
    fill: SliderFill;
    from: Box;
    labels: Labels;
    onclose: () => void;
  } = $props();

  const live = liveHue(() => entityId);

  const brightness = $derived<Slider>({
    entity_id: entityId,
    label: labels.light_brightness,
    icon: BRIGHTNESS_ICON,
    toggle_position: null,
    fill,
  });

  let panel = $state<PanelWindow | null>(null);
  let gesture = $state<Gesture | null>(null);
  let preview = $state<number | null>(null);
  let startX = 0;
  let startY = 0;

  const defaultPoint = $derived<XyPoint>({ x: defaultXy[0], y: defaultXy[1] });
  const defaultColour = $derived(xyToHueSaturation(defaultPoint));
  const current = $derived(readHueSaturation(ha.attribute(entityId, HS_COLOR_ATTRIBUTE)));
  const requested = $derived.by<HueSaturation | null>(() => {
    const value = pending.requested(entityId);

    if (typeof value !== "object" || value === null) {
      return null;
    }

    return "hue" in value ? value : xyToHueSaturation(value);
  });
  const shown = $derived<HueSaturation | null>(
    preview !== null ? { hue: preview, saturation: FULL_SATURATION } : (requested ?? current),
  );
  const onDefault = $derived(preview === null && sameColour(shown, defaultColour));
  const marker = $derived(shown && !onDefault ? pointAtHue(shown.hue, WHOLE, WHOLE, WHOLE * RING_MIDDLE) : null);

  function reach(event: PointerEvent, wheel: HTMLElement): { dx: number; dy: number; share: number } {
    const box = wheel.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);

    return { dx, dy, share: Math.hypot(dx, dy) / (box.width / 2) };
  }

  function press(event: PointerEvent) {
    if (event.button !== PRIMARY_BUTTON || !event.isPrimary) {
      return;
    }

    const wheel = event.currentTarget as HTMLElement;
    const { dx, dy, share } = reach(event, wheel);

    startX = event.clientX;
    startY = event.clientY;

    if (share >= RING_INNER) {
      gesture = "ring";
      preview = hueAt(dx, dy);
      live.move(preview);
      wheel.setPointerCapture(event.pointerId);
    } else {
      gesture = "default";
    }
  }

  function move(event: PointerEvent) {
    if (gesture === "ring") {
      const { dx, dy } = reach(event, event.currentTarget as HTMLElement);
      preview = hueAt(dx, dy);
      live.move(preview);
    } else if (gesture === "default" && Math.hypot(event.clientX - startX, event.clientY - startY) > TAP_SLOP_PX) {
      gesture = "abandoned";
    }
  }

  function release() {
    const finished = gesture;
    const landed = preview;
    gesture = null;

    if (finished === "ring" && landed !== null) {
      live.finish(landed);
    } else if (finished === "default") {
      pending.set(entityId, defaultPoint);
    } else {
      preview = null;
      return;
    }

    // Kept on the chosen colour while the window folds away, rather than jumping back to the old one.
    panel?.close();
  }

  function cancel() {
    gesture = null;
    preview = null;
    live.cancel();
  }
</script>

{#snippet band()}
  <h2 class="hue-window__title">{labels.light_colour}</h2>
{/snippet}

<PanelWindow
  bind:this={panel}
  {from}
  label={labels.light_colour}
  band="solid"
  tint={shown ? colourOf(shown) : null}
  lightType={shown ? wantsLightType(shown) : false}
  interactive
  header={band}
  {onclose}
>
  <div class="hue-window">
    <div
      class="hue-window__wheel"
      role="slider"
      tabindex="-1"
      aria-label={labels.light_colour}
      aria-valuemin={0}
      aria-valuemax={HUE_TURN}
      aria-valuenow={shown?.hue ?? 0}
      style:--hue-ring-inner="{RING_INNER * PERCENT_PER_SHARE}{PERCENT}"
      onpointerdown={press}
      onpointermove={move}
      onpointerup={release}
      onpointercancel={cancel}
      oncontextmenu={(event) => event.preventDefault()}
    >
      <div class="hue-window__ring"></div>
      <div
        class="hue-window__default"
        class:hue-window__default--chosen={onDefault}
        style:background={colourOf(defaultColour)}
      ></div>

      {#if marker && shown}
        <div
          class="hue-window__marker"
          class:hue-window__marker--held={gesture === "ring"}
          style:left="{marker.x}{PERCENT}"
          style:top="{marker.y}{PERCENT}"
          style:--hue-marker-colour={colourOf(shown)}
        ></div>
      {/if}
    </div>

    <SliderBar slider={brightness} onset={() => panel?.close()} />
  </div>
</PanelWindow>

<style>
  .hue-window__title {
    margin: 0;
    font-size: var(--title-size);
    font-weight: var(--weight-medium);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .hue-window {
    display: flex;
    flex-direction: column;
    gap: var(--hue-window-padding);
    padding: var(--hue-window-padding);
  }

  .hue-window__wheel {
    position: relative;
    width: var(--hue-wheel-size);
    aspect-ratio: 1;
    cursor: pointer;
    touch-action: none;
    -webkit-touch-callout: none;
    user-select: none;
  }

  /* Every hue round the ring, red at the top and clockwise, cut to a ring by a mask. */
  .hue-window__ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: conic-gradient(
      hsl(0 100% 50%),
      hsl(60 100% 50%),
      hsl(120 100% 50%),
      hsl(180 100% 50%),
      hsl(240 100% 50%),
      hsl(300 100% 50%),
      hsl(360 100% 50%)
    );
    --hue-ring-mask: radial-gradient(
      closest-side,
      transparent var(--hue-ring-inner),
      black calc(var(--hue-ring-inner) + var(--hue-ring-feather))
    );

    -webkit-mask: var(--hue-ring-mask);
    mask: var(--hue-ring-mask);
  }

  /* The light's default colour, in the middle of the ring, ringed in the primary colour while it is
   * the light's. */
  .hue-window__default {
    position: absolute;
    inset: var(--hue-default-inset);
    border: var(--hue-chosen-weight) solid transparent;
    border-radius: 50%;
    transition: border-color var(--colour-fade) ease;
  }

  .hue-window__default--chosen {
    border-color: var(--color-primary);
  }

  /* The light's colour on the ring, and the thing the finger drags. */
  .hue-window__marker {
    position: absolute;
    width: var(--hue-marker-size);
    height: var(--hue-marker-size);
    border: var(--hue-chosen-weight) solid var(--color-foreground);
    border-radius: 50%;
    background: var(--hue-marker-colour);
    transform: translate(-50%, -50%);
    transition: transform var(--held-grow-time) ease-out;
    pointer-events: none;
  }

  /* Held: a little larger, as any held mark is, and throwing a wide glow of its own colour that
   * breathes, so the colour under the finger shows round it. */
  .hue-window__marker--held {
    transform: translate(-50%, -50%) scale(var(--held-grow));
    animation: hue-halo var(--glow-breathe) ease-in-out infinite;
  }

  @keyframes hue-halo {
    0%,
    100% {
      box-shadow: 0 0 calc(var(--hue-halo-size) * var(--hue-halo-rest)) var(--hue-halo-spread) var(--hue-marker-colour);
    }

    50% {
      box-shadow: 0 0 var(--hue-halo-size) var(--hue-halo-spread) var(--hue-marker-colour);
    }
  }
</style>
