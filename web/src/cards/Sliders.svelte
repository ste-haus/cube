<script lang="ts">
  import { untrack } from "svelte";
  import Icon from "../lib/Icon.svelte";
  import { pending } from "../lib/pending.svelte";
  import { Breath } from "../lib/breath.svelte";
  import { sliderPercent, percentAlong } from "../lib/slider";
  import type { Slider } from "../lib/types";

  /*
   * Bars for a light's brightness and a cover's position: the grey fill is how far on or open it
   * is, and its leading edge is a thin stripe of the primary colour, the level itself.
   *
   * A tap anywhere on a bar switches it, and a drag along it sets it, so the common case is one
   * touch and the finer one is still to hand. A drag that sets out more up or down than along
   * is left to turn the cube, and one that sets out along is the bar's alone, so a sideways
   * drag across the bar never turns it.
   *
   * The edge is what the finger drags, and the fill comes with it, as the room light's handle and
   * arc do. Once let go, it stays where it was asked to go, with a glint across the bar, until Home
   * Assistant says where it went.
   *
   * The edge glows from the moment a drag starts, since a drag is a change on its way to Home
   * Assistant, and settles a couple of seconds after it is let go, or once Home Assistant has
   * answered if that is later. It settles at the end of a glow, when it has faded to nothing,
   * rather than stopping wherever it happens to be.
   */

  const TAP_SLOP_PX = 10;
  const PRIMARY_BUTTON = 0;
  const PERCENT = 100;

  type Gesture = "undecided" | "dragging" | "abandoned";

  let { sliders }: { sliders: Slider[] } = $props();

  let active = $state<{ entityId: string; gesture: Gesture; preview: number | null } | null>(null);
  let startX = 0;
  let startY = 0;

  /* Each bar's edge glows while it is being set. Made here rather than on first use: state made
   * while the markup is being drawn is not state the markup follows. */
  const breaths = new Map<string, Breath>();

  function breatheFor(list: Slider[]) {
    for (const slider of list) {
      if (!breaths.has(slider.entity_id)) {
        breaths.set(slider.entity_id, new Breath());
      }
    }
  }

  // Now, for the first drawing, and again before any later one names a bar not seen before.
  breatheFor(untrack(() => sliders));
  $effect.pre(() => breatheFor(sliders));

  function breathOf(entityId: string): Breath | undefined {
    return breaths.get(entityId);
  }

  $effect(() => () => breaths.forEach((breath) => breath.dispose()));

  function press(event: PointerEvent, slider: Slider) {
    if (event.button !== PRIMARY_BUTTON || !event.isPrimary) {
      return;
    }

    startX = event.clientX;
    startY = event.clientY;
    active = { entityId: slider.entity_id, gesture: "undecided", preview: null };
  }

  function move(event: PointerEvent, bar: HTMLElement) {
    if (!active) {
      return;
    }

    if (active.gesture === "undecided") {
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      if (Math.hypot(deltaX, deltaY) <= TAP_SLOP_PX) {
        return;
      }

      if (Math.abs(deltaX) <= Math.abs(deltaY)) {
        active.gesture = "abandoned";
        return;
      }

      active.gesture = "dragging";
      bar.setPointerCapture(event.pointerId);
      breathOf(active.entityId)?.start();
    }

    if (active.gesture === "dragging") {
      active.preview = percentAlong(event.clientX, bar.getBoundingClientRect());
    }
  }

  function release(event: PointerEvent, slider: Slider) {
    if (!active || active.entityId !== slider.entity_id) {
      return;
    }

    const { gesture, preview } = active;
    active = null;

    if (gesture === "abandoned") {
      return;
    }

    // Claimed by the bar, so the cube does not also read it as a swipe.
    event.stopPropagation();

    if (gesture === "dragging" && preview !== null) {
      pending.set(slider.entity_id, preview);
      breathOf(slider.entity_id)?.release();
    } else if (gesture === "undecided") {
      pending.send(slider.entity_id);
    }
  }

  function cancel() {
    if (active?.gesture === "dragging") {
      breathOf(active.entityId)?.release();
    }

    active = null;
  }

  /*
   * Listened for on the bar itself rather than through Svelte's handlers, which it delegates to
   * the document: by the time a delegated `pointerup` runs, the cube has already read the gesture
   * as a swipe, and stopping it there is too late.
   */
  function gestures(bar: HTMLElement, slider: Slider) {
    let current = slider;

    const down = (event: PointerEvent) => press(event, current);
    const moved = (event: PointerEvent) => move(event, bar);
    const up = (event: PointerEvent) => release(event, current);

    bar.addEventListener("pointerdown", down);
    bar.addEventListener("pointermove", moved);
    bar.addEventListener("pointerup", up);
    bar.addEventListener("pointercancel", cancel);

    return {
      update(next: Slider) {
        current = next;
      },
      destroy() {
        bar.removeEventListener("pointerdown", down);
        bar.removeEventListener("pointermove", moved);
        bar.removeEventListener("pointerup", up);
        bar.removeEventListener("pointercancel", cancel);
      },
    };
  }
</script>

<div class="sliders">
  {#each sliders as slider (slider.entity_id)}
    {@const value = sliderPercent(slider.entity_id)}
    {@const preview = active?.entityId === slider.entity_id ? active.preview : null}
    {@const requested = pending.requested(slider.entity_id)}
    {@const target = preview ?? (typeof requested === "number" ? requested : null)}
    {@const level = target ?? value}
    <div
      class="slider"
      class:slider--on={value > 0}
      class:slider--pending={pending.isPending(slider.entity_id)}
      class:slider--held={active?.entityId === slider.entity_id && active.gesture !== "abandoned"}
      class:slider--dragging={active?.entityId === slider.entity_id && active.gesture === "dragging"}
      role="slider"
      tabindex="-1"
      aria-label={slider.label}
      aria-valuemin={0}
      aria-valuemax={PERCENT}
      aria-valuenow={value}
      use:gestures={slider}
      oncontextmenu={(event) => event.preventDefault()}
    >
      <!-- Clipped to the bar's rounded shape; the edge is not, so it can stand out of the bar. -->
      <div class="slider__track">
        <div class="slider__fill" style:width="{level}%"></div>
      </div>
      {#if level > 0}
        <div
          class="slider__edge"
          class:slider__edge--breathing={breathOf(slider.entity_id)?.breathing}
          style:left="{level}%"
          onanimationiteration={() => breathOf(slider.entity_id)?.breathed(typeof requested === "number")}
        ></div>
      {/if}
      <span class="slider__icon"><Icon name={slider.icon} /></span>
      <span class="slider__label">{slider.label}</span>
      <span class="slider__value">{#if level > 0}{level}%{/if}</span>
    </div>
  {/each}
</div>

<style>
  .sliders {
    display: flex;
    flex-direction: column;
    gap: var(--slider-gap);
  }

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

  /* How far on, or how far open, as Home Assistant has it. */
  .slider__fill {
    position: absolute;
    inset: 0 auto 0 0;
    background-color: color-mix(in srgb, var(--color-muted) var(--slider-fill-strength), transparent);
    transition: width var(--slider-settle) ease-out;
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
      left var(--slider-settle) ease-out,
      width var(--held-grow-time) ease-out,
      transform var(--held-grow-time) ease-out;
  }

  /* Taken hold of: the edge is a little heavier, and stands up out of the bar above and below, so
   * it is plain the finger has it. */
  .slider--held .slider__edge {
    width: calc(var(--slider-edge-width) * var(--held-grow));
    transform: translateX(-100%) scaleY(var(--slider-held-stretch));
  }

  /* Dragged: the fill and the edge are under the finger rather than easing after it. */
  .slider--dragging .slider__fill {
    transition: none;
  }

  .slider--dragging .slider__edge {
    transition:
      width var(--held-grow-time) ease-out,
      transform var(--held-grow-time) ease-out;
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
