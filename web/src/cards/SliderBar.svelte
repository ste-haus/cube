<script lang="ts">
  import { TAP_SLOP_PX } from "../lib/cube.svelte";
  import Icon from "../lib/Icon.svelte";
  import { pending } from "../lib/pending.svelte";
  import { Breath } from "../lib/breath.svelte";
  import { SlidingLevel } from "../lib/level.svelte";
  import { liveBrightness } from "../lib/live";
  import { sliderPercent, percentAlong, tapPosition } from "../lib/slider";
  import { ha } from "../lib/state.svelte";
  import type { Slider } from "../lib/types";

  /*
   * A bar for a light's brightness or a cover's position: the fill is how far on or open it is, and
   * its leading edge is a thin stripe of the primary colour, the level itself. The fill is grey, or,
   * with `fill: light`, the light's own colour while it reports one, as strong as the light is
   * bright, following the edge while it is dragged.
   *
   * A tap anywhere on the bar switches it, and a drag along it sets it, so the common case is one
   * touch and the finer one is still to hand. A drag that sets out more up or down than along
   * is left to turn the cube, and one that sets out along is the bar's alone, so a sideways
   * drag across the bar never turns it.
   *
   * The edge is what the finger drags, and the fill comes with it, as the room light's handle and
   * arc do. Once let go, it stays where it was asked to go, with a glint across the bar, until Home
   * Assistant says where it went. Anything else that moves it, a tap or a change made somewhere
   * else, slides it there rather than jumping.
   *
   * A light follows the drag as it goes, paced so as not to flood it; a cover is sent once, where it
   * is let go, since a motor told a stream of places stops and starts at each.
   *
   * A bar with a `toggle_position` is tapped open to that position, and shut from any other.
   *
   * The edge glows from the moment a drag starts, since a drag is a change on its way to Home
   * Assistant, and settles a couple of seconds after it is let go, or once Home Assistant has
   * answered if that is later. It settles at the end of a glow, when it has faded to nothing,
   * rather than stopping wherever it happens to be.
   */

  const PRIMARY_BUTTON = 0;
  const PERCENT = 100;
  const RGB_ATTRIBUTE = "rgb_color";
  const LIGHT_FILL = "light";
  const LIGHT_DOMAIN = "light";

  type Gesture = "undecided" | "dragging" | "abandoned";

  let {
    slider,
    onset,
  }: {
    slider: Slider;
    /** Called once the bar has asked Home Assistant for a change, by a drag or a tap. */
    onset?: () => void;
  } = $props();

  let gesture = $state<Gesture | null>(null);
  let preview = $state<number | null>(null);
  let startX = 0;
  let startY = 0;

  const value = $derived(sliderPercent(slider.entity_id));
  const requested = $derived(pending.requested(slider.entity_id));
  const level = $derived(preview ?? (typeof requested === "number" ? requested : value));

  const rgb = $derived(ha.attribute<number[]>(slider.entity_id, RGB_ATTRIBUTE));
  const colour = $derived(slider.fill === LIGHT_FILL && value > 0 && rgb ? `rgb(${rgb.join(", ")})` : null);

  /* The edge glows while it is being set, and the fill and edge slide to a level they are told of
   * rather than jumping. */
  const breath = new Breath();
  const sliding = new SlidingLevel();
  const live = liveBrightness(() => slider.entity_id);
  const streams = $derived(slider.entity_id.split(".")[0] === LIGHT_DOMAIN);

  $effect.pre(() => sliding.follow(level, preview !== null));

  const drawn = $derived(sliding.current);

  $effect(() => () => breath.dispose());

  function press(event: PointerEvent) {
    if (event.button !== PRIMARY_BUTTON || !event.isPrimary) {
      return;
    }

    startX = event.clientX;
    startY = event.clientY;
    gesture = "undecided";
    preview = null;
  }

  function move(event: PointerEvent, bar: HTMLElement) {
    if (gesture === "undecided") {
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      if (Math.hypot(deltaX, deltaY) <= TAP_SLOP_PX) {
        return;
      }

      if (Math.abs(deltaX) <= Math.abs(deltaY)) {
        gesture = "abandoned";
        return;
      }

      gesture = "dragging";
      bar.setPointerCapture(event.pointerId);
      breath.start();
    }

    if (gesture === "dragging") {
      preview = percentAlong(event.clientX, bar.getBoundingClientRect());

      if (streams) {
        live.move(preview);
      }
    }
  }

  function release(event: PointerEvent) {
    const finished = gesture;
    const landed = preview;
    gesture = null;
    preview = null;

    if (finished === null || finished === "abandoned") {
      return;
    }

    // Claimed by the bar, so the cube does not also read it as a swipe.
    event.stopPropagation();

    if (finished === "dragging" && landed !== null && streams) {
      live.finish(landed);
      breath.release();
    } else if (finished === "dragging" && landed !== null) {
      pending.set(slider.entity_id, landed);
      breath.release();
    } else if (finished === "undecided" && slider.toggle_position !== null) {
      pending.set(slider.entity_id, tapPosition(value, slider.toggle_position));
    } else if (finished === "undecided") {
      pending.send(slider.entity_id);
    }

    onset?.();
  }

  function cancel() {
    if (gesture === "dragging") {
      breath.release();
    }

    live.cancel();

    gesture = null;
    preview = null;
  }

  /*
   * Listened for on the bar itself rather than through Svelte's handlers, which it delegates to
   * the document: by the time a delegated `pointerup` runs, the cube has already read the gesture
   * as a swipe, and stopping it there is too late.
   */
  function gestures(bar: HTMLElement) {
    const moved = (event: PointerEvent) => move(event, bar);

    bar.addEventListener("pointerdown", press);
    bar.addEventListener("pointermove", moved);
    bar.addEventListener("pointerup", release);
    bar.addEventListener("pointercancel", cancel);

    return {
      destroy() {
        bar.removeEventListener("pointerdown", press);
        bar.removeEventListener("pointermove", moved);
        bar.removeEventListener("pointerup", release);
        bar.removeEventListener("pointercancel", cancel);
      },
    };
  }
</script>

<div
  class="slider"
  class:slider--on={value > 0}
  class:slider--pending={pending.isPending(slider.entity_id)}
  class:slider--held={gesture !== null && gesture !== "abandoned"}
  role="slider"
  tabindex="-1"
  aria-label={slider.label}
  aria-valuemin={0}
  aria-valuemax={PERCENT}
  aria-valuenow={value}
  class:slider--coloured={colour !== null}
  style:--slider-fill-colour={colour}
  style:--slider-level={drawn / PERCENT}
  use:gestures
  oncontextmenu={(event) => event.preventDefault()}
>
  <!-- Clipped to the bar's rounded shape; the edge is not, so it can stand out of the bar. -->
  <div class="slider__track">
    <div class="slider__fill" style:width="{drawn}%"></div>
  </div>
  {#if drawn > 0}
    <div
      class="slider__edge"
      class:slider__edge--breathing={breath.breathing}
      style:left="{drawn}%"
      onanimationiteration={() => breath.breathed(typeof requested === "number")}
    ></div>
  {/if}
  <span class="slider__icon"><Icon name={slider.icon} /></span>
  <span class="slider__label">{slider.label}</span>
  <span class="slider__value">{#if level > 0}{level}%{/if}</span>
</div>

<style>
  .slider {
    --slider-glint-time: 1.1s;
    --slider-glint-strength: 0.22;

    position: relative;
    display: flex;
    align-items: center;
    gap: 0.8em;
    height: var(--slider-height);
    padding: 0 1.2em;
    border-radius: var(--slider-radius);
    background-color: var(--color-faint);
    color: var(--color-dim);
    font-size: var(--slider-label-size);
    cursor: pointer;
    -webkit-touch-callout: none;
    user-select: none;
  }

  .slider--on {
    color: var(--color-foreground);
  }

  .slider__track {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: inherit;
  }

  /* How far on, or how far open, as Home Assistant has it: grey, or the light's own colour. */
  .slider__fill {
    position: absolute;
    inset: 0 auto 0 0;
    background-color: color-mix(
      in srgb,
      var(--slider-fill-colour, var(--color-muted)) var(--slider-fill-mix, var(--slider-fill-strength)),
      transparent
    );
    transition: background-color var(--colour-fade) ease;
  }

  /* In the light's colour, as strong as the light is bright. */
  .slider--coloured {
    --slider-fill-mix: calc(
      var(--slider-colour-strength) *
        (var(--slider-colour-dim-floor) + (1 - var(--slider-colour-dim-floor)) * var(--slider-level))
    );
  }

  /* The fill's leading edge, the level in the primary colour. Nothing on or open draws no edge,
   * rather than a stripe against the bar's start. */
  .slider__edge {
    position: absolute;
    top: 0;
    bottom: 0;
    width: var(--slider-edge-width);
    background-color: var(--color-primary);
    border-radius: var(--slider-edge-width);
    transform: translateX(-100%);
    transition:
      width var(--held-grow-time) ease-out,
      transform var(--held-grow-time) ease-out;
  }

  /* Taken hold of: the edge is a little heavier, and stands up out of the bar above and below, so
   * it is plain the finger has it. */
  .slider--held .slider__edge {
    width: calc(var(--slider-edge-width) * var(--held-grow));
    transform: translateX(-100%) scaleY(var(--slider-held-stretch));
  }

  /* Being set: a glow in the edge's own colour swells and fades, from the drag until it settles. */
  .slider__edge--breathing {
    animation: slider-glow var(--glow-breathe) ease-in-out infinite;
  }

  /* Two layers: a tight bright one on the edge, and a wide soft one round it, spread a little,
   * since a line this thin has little of its own to glow with. */
  @keyframes slider-glow {
    50% {
      box-shadow:
        0 0 calc(var(--glow-size) / 3) var(--color-primary),
        0 0 var(--glow-size) var(--slider-glow-spread) var(--color-primary);
    }
  }

  .slider__icon,
  .slider__label,
  .slider__value {
    position: relative;
  }

  .slider__icon {
    font-size: var(--slider-icon-size);
    line-height: 1;
  }

  .slider__value {
    margin-left: auto;
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }

  /* Over a fill in the light's colour the muted grey can vanish, so the reading takes the label's
   * colour instead. */
  .slider--coloured .slider__value {
    color: var(--color-foreground);
  }

  /* The toggle chip's glint, for as long as a change is on its way. */
  .slider__track::after {
    content: "";
    position: absolute;
    inset: 0;
    opacity: 0;
    background: linear-gradient(
      105deg,
      transparent 35%,
      rgb(255 255 255 / var(--slider-glint-strength)) 50%,
      transparent 65%
    );
    transform: translateX(-100%);
    pointer-events: none;
  }

  .slider--pending .slider__track::after {
    opacity: 1;
    animation: slider-glint var(--slider-glint-time) ease-in-out infinite;
  }

  @keyframes slider-glint {
    to {
      transform: translateX(100%);
    }
  }
</style>
