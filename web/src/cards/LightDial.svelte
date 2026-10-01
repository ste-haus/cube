<script lang="ts">
  import HueWindow from "./HueWindow.svelte";
  import Icon from "../lib/Icon.svelte";
  import { Breath } from "../lib/breath.svelte";
  import { SlidingLevel } from "../lib/level.svelte";
  import { liveBrightness } from "../lib/live";
  import { COLOUR_HOLD_MS, takesHue } from "../lib/hue";
  import type { Box } from "../lib/picture";
  import { pending } from "../lib/pending.svelte";
  import { DIAL_SWEEP_DEGREES, percentRound, pointRound, sliderPercent } from "../lib/slider";
  import { ha } from "../lib/state.svelte";
  import type { Labels, Light } from "../lib/types";

  /*
   * The room's light, large and in the middle: a bulb that switches it, inside an arc that dims it.
   *
   * A tap on the bulb switches the light. A press on the arc sets the brightness there, and a drag
   * round it follows the finger; either belongs to the dial, so the cube stays put. A drag that
   * starts on the bulb is left to turn the cube, as it would anywhere else on the face.
   *
   * A drag round the arc is sent as it goes, so the light follows the finger, paced so as not to
   * flood it, and where it is let go is sent last.
   *
   * The arc and its handle are one mark, so the fill follows the handle while the finger moves it,
   * and stays with it once let go until Home Assistant says where the light went. The handle grows
   * a little while it is held, and glows from the start of a drag until a couple of seconds after
   * it is let go, or the answer if that is later, settling once a glow has faded. A tap on the
   * bulb breathes the bulb until the light has switched. Holding the bulb, on a light that can be
   * coloured, swells it over the hold and then opens a window out of it to pick the colour in; on
   * one that cannot, a hold does nothing at all. The bulb is as bright as the light is,
   * following the handle while it is dragged, the way the floorplan draws a light's brightness.
   */

  const TAP_SLOP_PX = 10;
  const PRIMARY_BUTTON = 0;
  const PERCENT = 100;

  // Drawn on a 100-unit square. The ring is pressable from a little inside the arc outwards.
  const VIEWBOX = "0 0 100 100";
  const CENTRE = 50;
  const RADIUS = 44;
  const RING_REACH = 0.72;
  const HALF_TURN_DEGREES = 180;

  const RGB_ATTRIBUTE = "rgb_color";
  const COLOR_MODES_ATTRIBUTE = "supported_color_modes";
  const MILLISECONDS = "ms";

  // A press on the bulb is a tap until it has been held long enough, when it is a hold: one that
  // opened the colour window, or one on a light with no colour that does nothing.
  type Gesture = "tap" | "held" | "dial" | "abandoned";

  let { light, defaultXy, labels }: { light: Light; defaultXy: [number, number]; labels: Labels } = $props();

  let bulb = $state<HTMLElement | null>(null);
  let colourFrom = $state<Box | null>(null);
  let holdTimer: number | null = null;

  const colourable = $derived(takesHue(ha.attribute<string[]>(light.entity_id, COLOR_MODES_ATTRIBUTE)));

  $effect(() => () => stopHold());

  function stopHold() {
    if (holdTimer !== null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  function held() {
    holdTimer = null;
    gesture = "held";

    if (colourable && bulb) {
      const box = bulb.getBoundingClientRect();
      colourFrom = { left: box.left, top: box.top, width: box.width, height: box.height };
    }
  }

  const value = $derived(sliderPercent(light.entity_id));
  const on = $derived(value > 0);
  const rgb = $derived(ha.attribute<number[]>(light.entity_id, RGB_ATTRIBUTE));
  const colour = $derived(on && rgb ? `rgb(${rgb.join(", ")})` : null);

  let gesture = $state<Gesture | null>(null);
  let preview = $state<number | null>(null);
  let startX = 0;
  let startY = 0;

  const requested = $derived(pending.requested(light.entity_id));
  const target = $derived(preview ?? (typeof requested === "number" ? requested : null));
  const level = $derived(target ?? value);

  /* The arc and its handle follow the finger at once, and slide to anything else: a tap that
   * switched the light, or a change made somewhere else. */
  const sliding = new SlidingLevel();

  $effect.pre(() => sliding.follow(level, preview !== null));

  const drawn = $derived(sliding.current);
  const handle = $derived(pointRound(drawn, CENTRE, CENTRE, RADIUS));
  const switching = $derived(pending.isPending(light.entity_id) && requested === null);

  const breath = new Breath();
  const live = liveBrightness(() => light.entity_id);

  $effect(() => () => breath.dispose());

  /* An arc from the dial's start to `percent` of the way round. */
  function arc(percent: number): string {
    const start = pointRound(0, CENTRE, CENTRE, RADIUS);
    const end = pointRound(percent, CENTRE, CENTRE, RADIUS);
    const large = (percent / PERCENT) * DIAL_SWEEP_DEGREES > HALF_TURN_DEGREES ? 1 : 0;

    return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${end.x} ${end.y}`;
  }

  function offset(event: PointerEvent, dial: HTMLElement): { dx: number; dy: number; reach: number } {
    const box = dial.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    const radius = (box.width / 2) * (RADIUS / CENTRE);

    return { dx, dy, reach: Math.hypot(dx, dy) / radius };
  }

  /*
   * Listened for on the dial itself rather than through Svelte's handlers, which it delegates to
   * the document: by then the cube has already read the gesture as a swipe.
   */
  function gestures(dial: HTMLElement) {
    function down(event: PointerEvent) {
      if (event.button !== PRIMARY_BUTTON || !event.isPrimary) {
        return;
      }

      startX = event.clientX;
      startY = event.clientY;

      const { dx, dy, reach } = offset(event, dial);
      if (reach >= RING_REACH) {
        gesture = "dial";
        preview = percentRound(dx, dy);
        live.move(preview);
        dial.setPointerCapture(event.pointerId);
        breath.start();
      } else {
        gesture = "tap";
        holdTimer = window.setTimeout(held, COLOUR_HOLD_MS);
        // Kept, so the release comes back here even once a hold has opened the colour window over
        // the bulb, rather than landing on the window's glass.
        dial.setPointerCapture(event.pointerId);
      }
    }

    function moved(event: PointerEvent) {
      if (gesture === "dial") {
        const { dx, dy } = offset(event, dial);
        preview = percentRound(dx, dy);
        live.move(preview);
      } else if (gesture === "tap" && Math.hypot(event.clientX - startX, event.clientY - startY) > TAP_SLOP_PX) {
        gesture = "abandoned";
        stopHold();
      }
    }

    function up(event: PointerEvent) {
      const finished = gesture;
      const landed = preview;
      gesture = null;
      preview = null;
      stopHold();

      if (finished === "dial") {
        breath.release();
      }

      if (finished === null || finished === "abandoned") {
        return;
      }

      // Claimed by the dial, so the cube does not also read it as a swipe.
      event.stopPropagation();

      if (finished === "dial" && landed !== null) {
        live.finish(landed);
      } else if (finished === "tap") {
        pending.send(light.entity_id);
      }
    }

    function cancel() {
      if (gesture === "dial") {
        breath.release();
      }

      live.cancel();

      gesture = null;
      preview = null;
      stopHold();
    }

    dial.addEventListener("pointerdown", down);
    dial.addEventListener("pointermove", moved);
    dial.addEventListener("pointerup", up);
    dial.addEventListener("pointercancel", cancel);

    return {
      destroy() {
        dial.removeEventListener("pointerdown", down);
        dial.removeEventListener("pointermove", moved);
        dial.removeEventListener("pointerup", up);
        dial.removeEventListener("pointercancel", cancel);
      },
    };
  }
</script>

<div
  class="light-dial"
  class:light-dial--on={on}
  class:light-dial--switching={switching}
  class:light-dial--holding={gesture === "tap" && colourable}
  style:--light-hold="{COLOUR_HOLD_MS}{MILLISECONDS}"
  role="slider"
  tabindex="-1"
  aria-valuemin={0}
  aria-valuemax={PERCENT}
  aria-valuenow={value}
  style:--light-colour={colour}
  use:gestures
  oncontextmenu={(event) => event.preventDefault()}
>
  <svg class="light-dial__arc" viewBox={VIEWBOX} aria-hidden="true">
    <path class="light-dial__track" d={arc(PERCENT)} />
    {#if drawn > 0}
      <path class="light-dial__fill" d={arc(drawn)} />
    {/if}
    <circle
      class="light-dial__handle"
      class:light-dial__handle--held={gesture === "dial"}
      class:light-dial__handle--breathing={breath.breathing}
      cx={handle.x}
      cy={handle.y}
      onanimationiteration={() => breath.breathed(typeof requested === "number")}
    />
  </svg>

  <span class="light-dial__bulb" style:--light-level={level / PERCENT} bind:this={bulb}><Icon name={on ? light.icon : light.off_icon} /></span>

  {#if target !== null || on}
    <span class="light-dial__value">{level}%</span>
  {/if}
</div>

{#if colourFrom}
  <HueWindow entityId={light.entity_id} {defaultXy} fill={light.fill} from={colourFrom} {labels} onclose={() => (colourFrom = null)} />
{/if}

<style>
  .light-dial {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: min(100%, var(--light-dial-size));
    aspect-ratio: 1;
    align-self: center;
    color: var(--color-dim);
    cursor: pointer;
    -webkit-touch-callout: none;
    user-select: none;
  }

  .light-dial--on {
    color: var(--light-colour, var(--light-on-color));
  }

  .light-dial__arc {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .light-dial__track,
  .light-dial__fill {
    fill: none;
    stroke-linecap: round;
    stroke-width: var(--dial-stroke);
  }

  .light-dial__track {
    stroke: var(--color-dim);
  }

  /* The level in the primary colour, as the gauges' arcs are; the bulb carries the light's own. */
  .light-dial__fill {
    stroke: var(--color-primary);
  }

  .light-dial__handle {
    r: var(--dial-handle-radius);
    fill: var(--color-primary);
    transition: r var(--held-grow-time) ease-out;
  }

  /* Taken hold of: a little larger, so the finger can feel it has the dial. */
  .light-dial__handle--held {
    r: calc(var(--dial-handle-radius) * var(--held-grow));
  }

  /* Lit, the bulb is as bright as the light, from a floor that keeps a light at its dimmest still
   * reading as on. */
  .light-dial--on .light-dial__bulb {
    opacity: calc(var(--light-dial-dim-floor) + (1 - var(--light-dial-dim-floor)) * var(--light-level));
  }

  .light-dial__bulb {
    position: relative;
    font-size: var(--light-dial-icon-size);
    line-height: 1;
    transition:
      color var(--slider-settle) ease,
      opacity var(--slider-settle) ease,
      transform var(--held-grow-time) ease-out;
  }

  /* Held on a light that can be coloured: the bulb swells for as long as the hold takes, so it is
   * plain that letting go now switches it and holding on opens its colour. */
  .light-dial--holding .light-dial__bulb {
    transform: scale(var(--held-grow));
    transition:
      color var(--slider-settle) ease,
      opacity var(--slider-settle) ease,
      transform var(--light-hold) linear;
  }

  .light-dial__value {
    position: absolute;
    bottom: var(--light-dial-value-lift);
    color: var(--color-muted);
    font-size: var(--slider-label-size);
    font-variant-numeric: tabular-nums;
  }

  /* Asked Home Assistant to switch it, waiting on the answer. */
  .light-dial--switching .light-dial__bulb {
    animation: light-dial-waiting var(--waiting-breathe) ease-in-out infinite;
  }

  /* Being set: a glow in the handle's own colour swells and fades, from the drag until it settles.
   * The size is in the dial's own units, since the handle is drawn inside its scaled picture. */
  .light-dial__handle--breathing {
    animation: light-dial-glow var(--glow-breathe) ease-in-out infinite;
  }

  @keyframes light-dial-glow {
    0%,
    100% {
      filter: drop-shadow(0 0 0 transparent) drop-shadow(0 0 0 transparent);
    }

    /* Two layers: a tight bright one on the handle, and a wide soft one round it. */
    50% {
      filter: drop-shadow(0 0 calc(var(--dial-glow-size) / 3) var(--color-primary))
        drop-shadow(0 0 var(--dial-glow-size) var(--color-primary));
    }
  }

  @keyframes light-dial-waiting {
    50% {
      opacity: var(--waiting-opacity);
    }
  }
</style>
