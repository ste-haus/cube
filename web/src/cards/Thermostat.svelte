<script lang="ts">
  import { faceVisibility, TAP_SLOP_PX } from "../lib/cube.svelte";
  import { cubicOut } from "svelte/easing";
  import { Tween } from "svelte/motion";
  import { Breath } from "../lib/breath.svelte";
  import { crestCharacter, crestOpacity, crestPath, type CrestCharacter, type Oval } from "../lib/gust";
  import Icon from "../lib/Icon.svelte";
  import { SlidingLevel } from "../lib/level.svelte";
  import { pending } from "../lib/pending.svelte";
  import { ha } from "../lib/state.svelte";
  import {
    adjustable,
    decimals,
    DialArc,
    DIAL_MIDDLE,
    dialFade,
    dialHashes,
    dialPosition,
    MODE_AUTO,
    MODE_COOL,
    MODE_HEAT,
    MODE_OFF,
    modeColour,
    moveSetpoint,
    nearestHash,
    running,
    sameRange,
    strainGrowth,
    stripModes,
    type TemperatureRange,
  } from "../lib/thermostat";
  import type { Thermostat } from "../lib/types";
  import SlidingNumber from "./SlidingNumber.svelte";

  /*
   * A thermostat hanging off the edge of the face: an oval most of the way off the screen, showing
   * the temperature with the range it is held to above and below. A tap slides it out, keeping the
   * figures where they are in the middle of what shows, and brings in a column of modes on the
   * edge's side of them and a dial round the inside of its edge for the setpoint the mode works to. A tap on it again, a tap
   * anywhere else, or being left alone for `IDLE_CLOSE_MS` puts it back.
   *
   * It is drawn in the mode's colour, a wash of it inside a line of it, lit from the edge it hangs
   * from, and while the equipment runs it gives off air and shows what the equipment is doing above
   * the figures. The dial's hashes move under the finger, past a mark held level with the figures
   * that shows the setpoint; on letting go they slide so the nearest hash meets the mark, and the
   * setpoint is sent. A mode is asked for and lights once Home Assistant says so.
   */

  const CURRENT_ATTRIBUTE = "current_temperature";
  const LOW_ATTRIBUTE = "target_temp_low";
  const HIGH_ATTRIBUTE = "target_temp_high";
  const ACTION_ATTRIBUTE = "hvac_action";
  const MODES_ATTRIBUTE = "hvac_modes";
  const STEP_ATTRIBUTE = "target_temp_step";
  const MIN_ATTRIBUTE = "min_temp";
  const MAX_ATTRIBUTE = "max_temp";
  const DEFAULT_STEP = 1;

  const DEGREE = "°";
  const PLACEHOLDER = "--";
  const ACTION_ICONS: Record<string, string> = {
    heating: "mdi:fire",
    cooling: "mdi:snowflake",
  };
  const MODE_ICONS: Record<string, string> = {
    [MODE_OFF]: "mdi:power",
    [MODE_HEAT]: "mdi:fire",
    [MODE_COOL]: "mdi:snowflake",
    [MODE_AUTO]: "mdi:thermostat-auto",
  };
  const COLOURS = {
    primary: "var(--color-primary)",
    secondary: "var(--color-secondary)",
    // Off all but fades into the background, so it reads as dark rather than quiet.
    rest: "var(--color-faint)",
  };

  // Sliding out and back takes a window's flight, on the same curve.
  const SLIDE_MS = 300;
  // The modes and the dial come in once it has mostly slid out, and go before it slides back.
  const CONTROLS_DELAY_MS = 180;
  // Left alone this long while it is out, it slides back in.
  const IDLE_CLOSE_MS = 10 * 1000;

  // A steady flow: a crest leaves every so often, a little sooner or later each time so the flow
  // never falls into a beat, and several are out at once.
  const CREST_INTERVAL_MS = 900;
  const CREST_INTERVAL_JITTER = 0.4;
  const CREST_LIFE_MS = 3600;
  // The crest's shape, against the oval's half-height so it scales as the card slides out.
  const CREST_TRAVEL = 0.32;
  const CREST_AMPLITUDE = 0.07;
  const CREST_HALF_ANGLE = Math.PI / 3;
  // Clear of the outline and its glow, so a crest leaves from outside the oval rather than on it.
  const CREST_CLEARANCE = 0.03;
  // The most crests that can be out at once, at the shortest gap between them.
  const MAX_CRESTS = Math.ceil(CREST_LIFE_MS / (CREST_INTERVAL_MS * (1 - CREST_INTERVAL_JITTER)));
  // The air drifts slowly enough to be drawn at a third of the screen's rate, for a third of the work.
  const AIR_FRAME_MS = 1000 / 20;
  // While the oval slides, the air is drawn every frame against it as it is, so it keeps to the
  // outline rather than catching up with it at the slower rate; a little past the slide, to be sure.
  const SLIDE_SETTLE_MS = 100;
  const NO_PATH = "";
  const HALF = 2;
  const GRADIENT_EDGE = "0%";
  const GRADIENT_MIDDLE = "50%";
  const GRADIENT_END = "100%";

  // The dial runs round the far side of the oval from this far below its middle to as far above,
  // as an angle about its centre, stopping short of where the curve runs back into the edge.
  const DIAL_SWEEP = (Math.PI * 7) / 18;
  // The hashes, against the oval's half-height, so they scale with it: how far in from the line
  // they start, and how far in they reach, the fifths further.
  const HASH_INSET = 0.035;
  const HASH_SHORT = 0.045;
  const HASH_LONG = 0.09;
  // The mark for the setpoint, held at the dial's middle: from a little outside the line, across
  // it, to well past the hashes on the inside.
  const MARK_OUTSET = 0.02;
  const MARK_REACH = 0.16;
  // Held, it reaches further in, over the time a held mark takes to grow (`--held-grow-time`).
  const MARK_HELD_REACH = 0.22;
  const MARK_GROW_MS = 150;
  // Pulled past where it can go, the setpoint's figure grows with how far, towards this much
  // bigger, most of the way there `STRAIN_SOFTNESS_DEGREES` past; let go, it springs back.
  const STRAIN_MOST = 1.6;
  const STRAIN_SOFTNESS_DEGREES = 3;
  const STRAIN_SNAP_MS = 250;
  // How many degrees the dial shows from one end to the other.
  const DIAL_SPAN_DEGREES = 20;
  // The dial is pressable along the middle of the long hashes.
  const RING_INSET = HASH_INSET + HASH_LONG / HALF;
  const RING_SAMPLES = 48;
  const PRIMARY_BUTTON = 0;

  // On the bottom it hangs up from the edge, centred along it, and is moved along the edge
  // rather than up and down it.
  const BOTTOM = "bottom";
  const RIGHT = "right";
  const ALONG_SIDE = "vh";
  const ALONG_BOTTOM = "vw";

  let { thermostat }: { thermostat: Thermostat } = $props();

  const visibility = faceVisibility();
  // One gradient per card, should the page ever hold two.
  const gradientId = `thermostat-air-${Math.random().toString(36).slice(HALF)}`;

  let open = $state(false);
  let card = $state<HTMLElement | null>(null);
  let shell = $state<HTMLElement | null>(null);
  let pressedAt: { x: number; y: number } | null = null;
  let idleTimer: number | null = null;

  let draft = $state<TemperatureRange | null>(null);
  let sent = $state(false);
  // Where the finger has the setpoint while it drags the dial, between the hashes.
  let dragged = $state<number | null>(null);
  // How far past where the setpoint can go the finger is pulling it, in degrees.
  let strain = $state(0);

  const entityId = $derived(thermostat.entity_id);
  const mode = $derived(ha.state(entityId));
  const action = $derived(ha.attribute<string>(entityId, ACTION_ATTRIBUTE));
  const current = $derived(reading(CURRENT_ATTRIBUTE));
  const step = $derived(reading(STEP_ATTRIBUTE) ?? DEFAULT_STEP);
  const held = $derived.by<TemperatureRange | null>(() => {
    const low = reading(LOW_ATTRIBUTE);
    const high = reading(HIGH_ATTRIBUTE);

    return low === null || high === null ? null : { low, high };
  });
  const shown = $derived(draft ?? held);
  const setpoint = $derived(adjustable(mode));
  const modes = $derived(stripModes(ha.attribute<string[]>(entityId, MODES_ATTRIBUTE)));
  const tone = $derived(modeColour(mode, action, current, held));
  const colour = $derived(COLOURS[tone ?? "rest"]);
  const blowing = $derived(running(action) && visibility.showing);
  const waiting = $derived(sent && pending.isPending(entityId));
  const asked = $derived(pending.requested(entityId));
  const limits = $derived.by(() => {
    const min = reading(MIN_ATTRIBUTE);
    const max = reading(MAX_ATTRIBUTE);

    return min === null || max === null || max <= min ? null : { min, max };
  });

  function reading(attribute: string): number | null {
    const value = Number(ha.attribute<number>(entityId, attribute) ?? Number.NaN);

    return Number.isFinite(value) ? value : null;
  }

  function degrees(value: number): string {
    return `${value.toFixed(decimals(step))}${DEGREE}`;
  }

  function wholeDegrees(value: number): string {
    return `${Math.round(value)}${DEGREE}`;
  }

  /* --- Sliding out and back --- */

  function press(event: PointerEvent) {
    pressedAt = { x: event.clientX, y: event.clientY };
    stillHere();
  }

  /** A tap on the card that is not on one of its controls: out if it is in, in if it is out. */
  function tap(event: MouseEvent) {
    const moved = pressedAt ? Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) : 0;
    pressedAt = null;

    if (moved > TAP_SLOP_PX) {
      return;
    }

    open = !open;
  }

  function stillHere() {
    if (idleTimer !== null) {
      window.clearTimeout(idleTimer);
    }

    idleTimer = open ? window.setTimeout(() => (open = false), IDLE_CLOSE_MS) : null;
  }

  $effect(() => {
    if (open) {
      stillHere();
    }
  });

  /* A press anywhere off the card puts it back. A press is listened for rather than a click, so the
   * click a touchscreen sends after the tap that opened it cannot close it again. */
  $effect(() => {
    if (!open) {
      return;
    }

    const away = (event: PointerEvent) => {
      if (card && event.target instanceof Node && !card.contains(event.target)) {
        open = false;
      }
    };
    document.addEventListener("pointerdown", away, true);

    return () => document.removeEventListener("pointerdown", away, true);
  });

  $effect(() => {
    if (!visibility.showing) {
      open = false;
    }
  });

  $effect(
    () => () => {
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer);
      }
    },
  );

  /* --- The setpoint --- */

  /* The answer, or the lack of one, is what ends a draft: from then on the range is Home
   * Assistant's again. */
  $effect(() => {
    if (sent && !pending.isPending(entityId)) {
      draft = null;
      sent = false;
    }
  });

  function commit() {
    if (draft === null) {
      return;
    }

    if (sameRange(draft, held)) {
      draft = null;
      return;
    }

    sent = pending.set(entityId, { ...draft });
  }

  /* --- The mode --- */

  function choose(chosen: string) {
    if (chosen !== mode) {
      pending.set(entityId, chosen);
    }
  }

  /* --- The dial --- */

  /*
   * Measured inside the oval's line, as the air is, and drawn for an oval hanging off the left; on
   * the right the drawing is mirrored, and on the bottom turned up off the edge with the low end on
   * the left, and where the finger is read is turned with it.
   */

  let inside = $state<Oval | null>(null);

  const bottom = $derived(thermostat.side === BOTTOM);
  /* From the left's drawing to the bottom's: its far side up, its low end to the left. */
  const turn = $derived(
    bottom && inside ? `matrix(0 -1 -1 0 ${inside.cy * HALF} ${inside.cx * HALF})` : undefined,
  );

  const arc = $derived(inside ? new DialArc(inside, DIAL_SWEEP) : null);
  const hashes = $derived(limits ? dialHashes(limits.min, limits.max) : []);
  const ring = $derived(arc ? ringPath(arc) : NO_PATH);

  /* The scale follows the finger at once, and slides to anything else: onto its hash once let go,
   * or to a setpoint changed somewhere else. */
  const sliding = new SlidingLevel();
  const breath = new Breath();

  $effect(() => () => breath.dispose());

  const strained = $derived(strainGrowth(strain, STRAIN_MOST, STRAIN_SOFTNESS_DEGREES));

  const selected = $derived(dragged ?? (shown && setpoint ? shown[setpoint] : null));

  $effect.pre(() => {
    if (selected !== null) {
      sliding.follow(selected, dragged !== null);
    }
  });

  /* The hashes on the dial as it is turned: where each sits, and how strongly it shows. */
  const placed = $derived(
    hashes
      .map((hash) => ({ ...hash, at: dialPosition(hash.value, sliding.current, DIAL_SPAN_DEGREES) }))
      .filter((hash) => hash.at >= 0 && hash.at <= 1),
  );
  const markReach = new Tween(MARK_REACH, { duration: MARK_GROW_MS, easing: cubicOut });

  $effect(() => {
    markReach.target = dragged !== null ? MARK_HELD_REACH : MARK_REACH;
  });

  const mark = $derived(arc ? markLine(arc, markReach.current) : null);

  // Where the finger took hold of the dial, and the setpoint then.
  let grip: { at: number; value: number } | null = null;

  function hashLine(dial: DialArc, at: number, major: boolean) {
    const ry = dial.oval.ry;
    const start = dial.mark(at, ry * HASH_INSET);
    const reach = ry * (major ? HASH_LONG : HASH_SHORT);

    return { x1: start.x, y1: start.y, x2: start.x + start.nx * reach, y2: start.y + start.ny * reach };
  }

  function markLine(dial: DialArc, inwards: number) {
    const ry = dial.oval.ry;
    const start = dial.mark(DIAL_MIDDLE, -ry * MARK_OUTSET);
    const reach = ry * (MARK_OUTSET + inwards);

    return { x1: start.x, y1: start.y, x2: start.x + start.nx * reach, y2: start.y + start.ny * reach };
  }

  function ringPath(dial: DialArc): string {
    const inset = dial.oval.ry * RING_INSET;
    const points = Array.from({ length: RING_SAMPLES + 1 }, (_, index) => dial.mark(index / RING_SAMPLES, inset));

    return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  }

  /* How far along the dial the finger is, from the bottom. */
  function underFinger(event: PointerEvent, drawing: SVGElement): number | null {
    if (!arc) {
      return null;
    }

    const box = drawing.getBoundingClientRect();
    const fromLeft = event.clientX - box.left;
    const fromTop = event.clientY - box.top;

    if (bottom) {
      return arc.fractionToward(box.height - fromTop, box.width - fromLeft);
    }

    return arc.fractionToward(thermostat.side === RIGHT ? box.width - fromLeft : fromLeft, fromTop);
  }

  /* The scale carried with the finger: up brings the lower degrees to the mark, down the higher.
   * The scale stops at the thermostat's limits, and the figure shows the hash nearest the mark. */
  function drag(event: PointerEvent, drawing: SVGElement) {
    const at = underFinger(event, drawing);
    if (at === null || grip === null || shown === null || setpoint === null || limits === null) {
      return;
    }

    const value = grip.value - (at - grip.at) * DIAL_SPAN_DEGREES;
    const held = (to: number) => moveSetpoint(shown!, setpoint!, to, step, limits!.min, limits!.max);
    dragged = held(value)[setpoint];
    strain = Math.abs(value - dragged);
    draft = held(nearestHash(value));
    sent = false;
    stillHere();
  }

  /*
   * Listened for on the ring itself rather than through Svelte's handlers, which it delegates to
   * the document: by then the cube has already read the gesture as a swipe. Its click is kept from
   * the card too, so a press on the ring never slides the card back.
   */
  function dial(target: SVGPathElement) {
    const drawing = target.ownerSVGElement!;

    function down(event: PointerEvent) {
      const at = underFinger(event, drawing);
      if (event.button !== PRIMARY_BUTTON || !event.isPrimary || selected === null || at === null) {
        return;
      }

      target.setPointerCapture(event.pointerId);
      grip = { at, value: selected };
      dragged = selected;
      breath.start();
    }

    function moved(event: PointerEvent) {
      if (dragged !== null) {
        drag(event, drawing);
      }
    }

    function up(event: PointerEvent) {
      if (dragged === null) {
        return;
      }

      event.stopPropagation();
      dragged = null;
      strain = 0;
      grip = null;
      breath.release();
      commit();
      stillHere();
    }

    function cancel() {
      if (dragged === null) {
        return;
      }

      dragged = null;
      strain = 0;
      grip = null;
      draft = null;
      breath.release();
    }

    const swallow = (event: MouseEvent) => event.stopPropagation();

    target.addEventListener("pointerdown", down);
    target.addEventListener("pointermove", moved);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", cancel);
    target.addEventListener("click", swallow);

    return {
      destroy() {
        target.removeEventListener("pointerdown", down);
        target.removeEventListener("pointermove", moved);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", cancel);
        target.removeEventListener("click", swallow);
      },
    };
  }

  /* --- Air --- */

  /*
   * The air is drawn straight onto a fixed set of paths rather than through the component's state,
   * since it changes every frame for as long as the equipment runs, and nothing else on the card
   * needs to know. The oval is measured only when its size changes, not every frame.
   */

  let oval = $state<Oval | null>(null);
  let slidingUntil = 0;
  // Emptied by the markup when the air stops and its drawing goes, so each may be gone.
  const crestPaths: (SVGPathElement | null)[] = [];

  /* The oval's size as the left's drawing has it: on the bottom, across is up and down. */
  function sized(measured: HTMLElement) {
    const { clientWidth, clientHeight, offsetWidth, offsetHeight } = measured;

    return bottom
      ? { across: clientHeight, along: clientWidth, outerAcross: offsetHeight, outerAlong: offsetWidth }
      : { across: clientWidth, along: clientHeight, outerAcross: offsetWidth, outerAlong: offsetHeight };
  }

  /* The drawing sits inside the oval's border, so its middle is the inside's, and its reach is the
   * outside's, border and all, and a little more. */
  function measure(measured: HTMLElement): Oval {
    const { across, along, outerAcross, outerAlong } = sized(measured);
    const clearance = (outerAlong / HALF) * CREST_CLEARANCE;

    return {
      cx: across / HALF,
      cy: along / HALF,
      rx: outerAcross / HALF + clearance,
      ry: outerAlong / HALF + clearance,
    };
  }

  $effect(() => {
    if (!shell) {
      return;
    }

    const measured = shell;
    const observer = new ResizeObserver(() => {
      const { across, along } = sized(measured);
      oval = measure(measured);
      inside = { cx: across / HALF, cy: along / HALF, rx: across / HALF, ry: along / HALF };
    });
    observer.observe(measured);

    return () => observer.disconnect();
  });

  /* Sliding out or back in: the air follows the oval frame by frame until it has settled. */
  $effect(() => {
    void open;
    slidingUntil = performance.now() + SLIDE_MS + SLIDE_SETTLE_MS;
  });

  /* Air for as long as the equipment runs and the face is looked at, a crest leaving every
   * `CREST_INTERVAL_MS` or so and each fading out over `CREST_LIFE_MS`, so the flow never stops. */
  $effect(() => {
    if (!blowing) {
      return;
    }

    const crests: { born: number; character: CrestCharacter }[] = [];
    let frame: number | null = null;
    let next = performance.now();
    let drawn = Number.NEGATIVE_INFINITY;

    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      const sliding = time < slidingUntil;
      if (!sliding && time - drawn < AIR_FRAME_MS) {
        return;
      }
      drawn = time;

      while (crests.length > 0 && time - crests[0].born >= CREST_LIFE_MS) {
        crests.shift();
      }
      if (time >= next && crests.length < MAX_CRESTS) {
        crests.push({ born: time, character: crestCharacter() });
        const jitter = 1 + CREST_INTERVAL_JITTER * (HALF * Math.random() - 1);
        next = time + CREST_INTERVAL_MS * jitter;
      }

      const shape = sliding && shell ? measure(shell) : oval;
      crestPaths.forEach((path, index) => {
        const crest = crests[index];
        if (!path) {
          return;
        }

        if (!crest || !shape) {
          path.setAttribute("d", NO_PATH);
          return;
        }

        const progress = (time - crest.born) / CREST_LIFE_MS;
        path.setAttribute(
          "d",
          crestPath(shape, {
            progress,
            travel: shape.ry * CREST_TRAVEL,
            halfAngle: CREST_HALF_ANGLE,
            amplitude: shape.ry * CREST_AMPLITUDE,
            character: crest.character,
          }),
        );
        path.setAttribute("opacity", String(crestOpacity(progress)));
      });
    };

    frame = requestAnimationFrame(draw);

    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      for (const path of crestPaths) {
        path?.setAttribute("d", NO_PATH);
      }
    };
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<section
  class="thermostat thermostat--{thermostat.side}"
  class:thermostat--open={open}
  class:thermostat--off={mode === MODE_OFF}
  class:thermostat--auto={mode === MODE_AUTO}
  class:thermostat--lit={tone !== null}
  bind:this={card}
  style:--thermostat-colour={colour}
  style:--thermostat-offset="{thermostat.offset}{bottom ? ALONG_BOTTOM : ALONG_SIDE}"
  style:--thermostat-slide="{SLIDE_MS}ms"
  style:--thermostat-controls-delay="{CONTROLS_DELAY_MS}ms"
  style:--thermostat-strain-snap="{STRAIN_SNAP_MS}ms"
  onpointerdown={press}
  onclick={tap}
>
  <div class="thermostat__shell" bind:this={shell}>
    {#if oval && blowing}
      <svg class="thermostat__air" aria-hidden="true">
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="0"
            y2={oval.cy * HALF}
          >
            <stop offset={GRADIENT_EDGE} stop-color="currentColor" stop-opacity="0" />
            <stop offset={GRADIENT_MIDDLE} stop-color="currentColor" />
            <stop offset={GRADIENT_END} stop-color="currentColor" stop-opacity="0" />
          </linearGradient>
        </defs>
        <g transform={turn}>
          {#each { length: MAX_CRESTS }, index}
            <path class="thermostat__crest" bind:this={crestPaths[index]} stroke="url(#{gradientId})" />
          {/each}
        </g>
      </svg>
    {/if}

    {#if arc && limits && setpoint !== null}
      <svg class="thermostat__dial thermostat__controls" aria-hidden="true">
        <g transform={turn}>
          {#each placed as hash (hash.value)}
            <line
              class="thermostat__hash"
              class:thermostat__hash--major={hash.major}
              opacity={dialFade(hash.at)}
              {...hashLine(arc, hash.at, hash.major)}
            />
          {/each}
          {#if mark}
            <line
              class="thermostat__mark"
              class:thermostat__mark--held={dragged !== null}
              class:thermostat__mark--breathing={breath.breathing}
              {...mark}
              onanimationiteration={() => breath.breathed(waiting)}
            />
          {/if}
          <path class="thermostat__ring" d={ring} use:dial />
        </g>
      </svg>
    {/if}
  </div>

  <div class="thermostat__readout">
    <span class="thermostat__action" class:thermostat__action--on={blowing} aria-hidden="true">
      <Icon name={ACTION_ICONS[action ?? ""] ?? null} />
    </span>
    <span
      class="thermostat__setpoint thermostat__setpoint--high"
      class:thermostat__setpoint--active={setpoint === "high"}
      class:thermostat__setpoint--waiting={waiting && setpoint === "high"}
      class:thermostat__setpoint--straining={strain > 0 && setpoint === "high"}
      style:--thermostat-strain={setpoint === "high" ? strained : 1}
    >
      {shown === null ? PLACEHOLDER : degrees(shown.high)}
    </span>
    <span class="thermostat__current">
      <SlidingNumber value={current} format={wholeDegrees} fallback={PLACEHOLDER} />
    </span>
    <span
      class="thermostat__setpoint thermostat__setpoint--low"
      class:thermostat__setpoint--active={setpoint === "low"}
      class:thermostat__setpoint--waiting={waiting && setpoint === "low"}
      class:thermostat__setpoint--straining={strain > 0 && setpoint === "low"}
      style:--thermostat-strain={setpoint === "low" ? strained : 1}
    >
      {shown === null ? PLACEHOLDER : degrees(shown.low)}
    </span>

    <div class="thermostat__modes thermostat__controls">
      {#each modes as item (item)}
        <button
          type="button"
          class="thermostat__mode thermostat__mode--{item}"
          class:thermostat__mode--on={item === mode}
          class:thermostat__mode--waiting={asked === item}
          aria-label={item}
          aria-pressed={item === mode}
          tabindex={open ? 0 : -1}
          onclick={(event) => {
            event.stopPropagation();
            choose(item);
          }}
        >
          <Icon name={MODE_ICONS[item]} />
        </button>
      {/each}
    </div>
  </div>
</section>

<style>
  /*
   * The card is the part of the oval that shows, and the oval hangs from its edge-side, most of it
   * off the screen. Sliding out widens what shows and grows the oval with it, to half of it and no
   * further; the figures are centred in what shows, so they stay in the middle of it.
   */
  .thermostat {
    position: absolute;
    top: calc(var(--thermostat-anchor) + var(--thermostat-offset));
    z-index: 3;
    width: var(--thermostat-reach);
    height: var(--thermostat-height);
    transform: translateY(-50%);
    transition:
      width var(--thermostat-slide) var(--thermostat-curve),
      height var(--thermostat-slide) var(--thermostat-curve);
    color: var(--color-foreground);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }

  .thermostat--left {
    left: 0;
  }

  .thermostat--right {
    right: 0;
  }

  .thermostat--open {
    width: var(--thermostat-open-reach);
    height: var(--thermostat-open-height);
  }

  /* On the bottom, the same oval turned up off the edge: long across the screen, centred along it. */
  .thermostat--bottom {
    top: auto;
    bottom: 0;
    left: calc(50% + var(--thermostat-offset));
    width: var(--thermostat-bottom-length);
    height: var(--thermostat-bottom-reach);
    transform: translateX(-50%);
  }

  .thermostat--bottom.thermostat--open {
    width: var(--thermostat-bottom-open-length);
    height: var(--thermostat-bottom-open-reach);
  }

  .thermostat__shell {
    position: absolute;
    top: 0;
    width: var(--thermostat-width);
    height: 100%;
    border: var(--thermostat-line) solid var(--thermostat-colour);
    border-radius: 50%;
    /* Lit from the middle of the oval, on the edge it hangs from, fading towards its rim, with the
     * rim itself catching the light on the inside. */
    background: radial-gradient(
      closest-side,
      color-mix(in srgb, var(--thermostat-colour) var(--thermostat-wash-core), var(--color-background)),
      color-mix(in srgb, var(--thermostat-colour) var(--thermostat-wash), var(--color-background))
    );
    box-shadow: inset 0 0 var(--thermostat-rim-glow)
      color-mix(in srgb, var(--thermostat-colour) var(--thermostat-rim-strength), transparent);
    transition:
      width var(--thermostat-slide) var(--thermostat-curve),
      border-color var(--colour-fade) ease,
      box-shadow var(--colour-fade) ease;
  }

  /* A mode with a colour glows round its line, so it reads as lit rather than outlined. */
  .thermostat--lit .thermostat__shell {
    box-shadow:
      inset 0 0 var(--thermostat-rim-glow)
        color-mix(in srgb, var(--thermostat-colour) var(--thermostat-rim-strength), transparent),
      0 0 var(--thermostat-halo) color-mix(in srgb, var(--thermostat-colour) var(--thermostat-halo-strength), transparent);
  }

  .thermostat--left .thermostat__shell {
    right: 0;
  }

  .thermostat--right .thermostat__shell {
    left: 0;
  }

  .thermostat--open .thermostat__shell {
    width: var(--thermostat-open-width);
  }

  .thermostat--bottom .thermostat__shell {
    left: 0;
    width: 100%;
    height: var(--thermostat-bottom-depth);
    transition:
      height var(--thermostat-slide) var(--thermostat-curve),
      border-color var(--colour-fade) ease,
      box-shadow var(--colour-fade) ease;
  }

  .thermostat--bottom.thermostat--open .thermostat__shell {
    width: 100%;
    height: var(--thermostat-bottom-open-depth);
  }

  /* The air leaves the side facing into the screen, which on the right is the other way. */
  .thermostat__air {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    color: var(--thermostat-colour);
    pointer-events: none;
  }

  .thermostat--right .thermostat__air {
    transform: scaleX(-1);
  }

  .thermostat__air {
    filter: drop-shadow(0 0 var(--thermostat-crest-glow) var(--thermostat-colour));
  }

  .thermostat__crest {
    fill: none;
    stroke-width: var(--thermostat-crest-line);
    stroke-linecap: round;
  }

  /* --- The figures --- */

  /* Collapsed, the figures sit close against the edge, clear of the oval's curve on the other
   * side; out, they sit a little edge-wards of the middle of what shows, where the half oval is
   * tallest, with the modes between them and the edge and the dial round the far side. */
  .thermostat__readout {
    position: absolute;
    top: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    transform: translateY(-50%);
    transition:
      left var(--thermostat-slide) var(--thermostat-curve),
      right var(--thermostat-slide) var(--thermostat-curve),
      bottom var(--thermostat-slide) var(--thermostat-curve),
      transform var(--thermostat-slide) var(--thermostat-curve);
    line-height: 1;
  }

  .thermostat--left .thermostat__readout {
    left: var(--thermostat-edge-padding);
  }

  .thermostat--right .thermostat__readout {
    right: var(--thermostat-edge-padding);
  }

  .thermostat--left.thermostat--open .thermostat__readout {
    left: var(--thermostat-open-centre);
    transform: translate(-50%, -50%);
  }

  .thermostat--right.thermostat--open .thermostat__readout {
    right: var(--thermostat-open-centre);
    transform: translate(50%, -50%);
  }

  /* On the bottom the figures turn with the oval: a row, the low on the left as the dial has it,
   * close against the edge collapsed and out at the same place across what shows once open. */
  .thermostat--bottom .thermostat__readout {
    top: auto;
    bottom: var(--thermostat-edge-padding);
    left: 50%;
    flex-direction: row-reverse;
    align-items: baseline;
    gap: var(--thermostat-row-gap);
    transform: translateX(-50%);
  }

  .thermostat--bottom.thermostat--open .thermostat__readout {
    bottom: var(--thermostat-bottom-open-lift);
  }

  /* What the equipment is doing, over the figures, while it runs. */
  .thermostat__action {
    position: absolute;
    bottom: calc(100% + var(--thermostat-action-gap));
    left: 50%;
    color: var(--thermostat-colour);
    font-size: var(--thermostat-action-size);
    opacity: 0;
    transform: translateX(-50%);
    transition: opacity var(--colour-fade) ease;
  }

  .thermostat__action--on {
    opacity: 1;
  }

  /* On the bottom, beside the row rather than over it, where the dial's mark comes down, standing
   * on the figures' baseline. */
  .thermostat--bottom .thermostat__action {
    top: auto;
    right: calc(100% + var(--thermostat-action-gap));
    bottom: var(--thermostat-bottom-action-lift);
    left: auto;
    display: flex;
    transform: none;
  }

  .thermostat__current {
    font-size: var(--thermostat-current-size);
    font-weight: var(--weight-thin);
    /* The degree sign hangs off the end, so the figures themselves sit in the middle. */
    margin-right: -0.3em;
  }

  .thermostat__setpoint {
    margin-right: -0.3em;
    color: var(--color-dim);
    font-size: var(--thermostat-setpoint-size);
    font-weight: var(--weight-light);
    transform: scale(var(--thermostat-strain));
    transition:
      color var(--colour-fade) ease,
      transform var(--thermostat-strain-snap) var(--thermostat-spring);
  }

  /* It grows away from the temperature, held on the side that faces it, so it never runs into it:
   * the high above and the low below, or on the bottom, the low to the left and the high right. */
  .thermostat__setpoint--high {
    transform-origin: center bottom;
  }

  .thermostat__setpoint--low {
    transform-origin: center top;
  }

  .thermostat--bottom .thermostat__setpoint--high {
    transform-origin: left center;
  }

  .thermostat--bottom .thermostat__setpoint--low {
    transform-origin: right center;
  }

  /* Pulled past where it can go: it grows under the finger at once, and springs back once let go. */
  .thermostat__setpoint--straining {
    transition: color var(--colour-fade) ease;
  }

  /* In auto the thermostat works to both, so neither is as quiet as the one heat or cool ignores. */
  /* Off, the figures fade down with the oval, so nothing on it reads as working. */
  .thermostat--off .thermostat__current {
    color: var(--color-dim);
  }

  .thermostat--off .thermostat__setpoint {
    color: var(--color-faint);
  }

  .thermostat--auto .thermostat__setpoint {
    color: var(--color-muted);
  }

  .thermostat__setpoint--active {
    color: var(--color-foreground);
  }

  .thermostat__setpoint--waiting {
    animation: thermostat-waiting var(--waiting-breathe) ease-in-out infinite;
  }

  /* --- The controls, there only while it is out --- */

  .thermostat__controls {
    position: absolute;
    display: flex;
    opacity: 0;
    visibility: hidden;
    transition:
      opacity var(--thermostat-slide) ease,
      visibility 0s linear var(--thermostat-slide);
  }

  .thermostat--open .thermostat__controls {
    opacity: 1;
    visibility: visible;
    transition:
      opacity var(--thermostat-slide) ease var(--thermostat-controls-delay),
      visibility 0s;
  }

  .thermostat__mode {
    padding: var(--thermostat-button-padding);
    border: 0;
    background: none;
    color: var(--color-muted);
    font: inherit;
    cursor: pointer;
  }

  /* A column on the edge's side of the figures, between them and the edge. */
  .thermostat__modes {
    top: 50%;
    flex-direction: column;
    gap: var(--thermostat-modes-spacing);
    transform: translateY(-50%);
  }

  .thermostat--left .thermostat__modes {
    right: calc(100% + var(--thermostat-modes-gap));
  }

  .thermostat--right .thermostat__modes {
    left: calc(100% + var(--thermostat-modes-gap));
  }

  .thermostat--bottom .thermostat__modes {
    top: calc(100% + var(--thermostat-modes-gap));
    left: 50%;
    flex-direction: row;
    transform: translateX(-50%);
  }

  .thermostat__mode {
    font-size: var(--thermostat-mode-size);
  }

  .thermostat__mode :global(i),
  .thermostat__mode :global(svg) {
    transition: color var(--colour-fade) ease;
  }

  .thermostat__mode--on {
    color: var(--color-foreground);
  }

  /* Off, the modes it could be put in sit back with the rest of it. */
  .thermostat--off .thermostat__mode:not(.thermostat__mode--on) {
    color: var(--color-dim);
  }

  .thermostat__mode--heat.thermostat__mode--on {
    color: var(--color-primary);
  }

  .thermostat__mode--cool.thermostat__mode--on {
    color: var(--color-secondary);
  }

  .thermostat__mode--waiting {
    animation: thermostat-waiting var(--waiting-breathe) ease-in-out infinite;
  }

  /* --- The dial --- */

  .thermostat__dial {
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .thermostat--right .thermostat__dial {
    transform: scaleX(-1);
  }

  /* A frame is dimmer than what it frames: the hashes sit under the figures, the fifths a step up. */
  .thermostat__hash {
    stroke: var(--color-dim);
    stroke-width: var(--thermostat-hash-line);
    stroke-linecap: round;
  }

  .thermostat__hash--major {
    stroke: var(--color-muted);
  }

  /* Pressable all along the dial, a finger's width either side of the middle of its hashes. */
  .thermostat__ring {
    fill: none;
    stroke: transparent;
    stroke-width: var(--thermostat-dial-reach);
    pointer-events: stroke;
    cursor: grab;
    touch-action: none;
  }

  /* The setpoint's mark, in the mode's colour, held level with the figures while the hashes move. */
  .thermostat__mark {
    stroke: var(--thermostat-colour);
    stroke-width: var(--thermostat-mark-line);
    stroke-linecap: round;
    transition: stroke-width var(--held-grow-time) ease-out;
  }

  .thermostat__mark--held {
    stroke-width: calc(var(--thermostat-mark-line) * var(--held-grow));
  }

  /* Being set: a glow in the mark's own colour swells and fades, from the drag until it settles. */
  .thermostat__mark--breathing {
    animation: thermostat-glow var(--glow-breathe) ease-in-out infinite;
  }

  @keyframes thermostat-glow {
    0%,
    100% {
      filter: drop-shadow(0 0 0 transparent) drop-shadow(0 0 0 transparent);
    }

    50% {
      filter: drop-shadow(0 0 calc(var(--thermostat-mark-glow) / 3) var(--thermostat-colour))
        drop-shadow(0 0 var(--thermostat-mark-glow) var(--thermostat-colour));
    }
  }

  @keyframes thermostat-waiting {
    50% {
      opacity: var(--waiting-opacity);
    }
  }
</style>
