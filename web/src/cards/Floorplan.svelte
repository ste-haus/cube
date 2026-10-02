<script lang="ts">
  import HueWindow from "./HueWindow.svelte";
  import Reticle from "./Reticle.svelte";
  import { floorplanStylesUrl, floorplanUrl } from "../lib/api";
  import { swipeable, type Direction, TAP_SLOP_PX } from "../lib/cube.svelte";
  import { COLOUR_HOLD_MS, takesHue } from "../lib/hue";
  import { nextLevel } from "../lib/levels";
  import { Lapsing, PANE_RESET_MS } from "../lib/panes.svelte";
  import { pending } from "../lib/pending.svelte";
  import type { Box } from "../lib/picture";
  import { keepTrying } from "../lib/retry";
  import { ha } from "../lib/state.svelte";
  import type { Floorplan, Labels, SliderFill } from "../lib/types";

  /*
   * The floorplan SVG carries an entity id as the DOM id of every element it draws, and the
   * stylesheet that ships beside it does all the painting off class names. So the whole of
   * this card is: inline the SVG, and keep one class per element in step with its entity.
   */

  const ACTIVE = "active";
  const INACTIVE = "inactive";

  /** States that count as "lit", "open", or "occupied", depending on the group. */
  const ACTIVE_STATES = new Set(["on", "open", "motion", "movement"]);

  /** Class prefix per group; anything unlisted falls back to the group name less its plural. */
  const CLASS_PREFIXES: Record<string, string> = {
    lights: "light",
    doors: "door",
    windows: "window",
    fans: "fan",
    motion: "motion",
    sensors: "sensor",
    bins: "sensor",
    vehicles: "vehicle",
  };

  /** Groups whose elements are controls rather than read-outs. */
  const CONTROLLABLE_GROUPS = new Set(["lights", "fans"]);
  const LIGHTS = "lights";

  /** Doors report more than open or shut, and the stylesheet distinguishes all of it. */
  const DOOR_CLASSES: Record<string, string> = {
    open: "open",
    open_exterior: "open",
    unlocked: "unlocked",
    locked: "locked",
  };

  /** Bins report where they are rather than whether they are on. */
  const BIN_STATES = new Set(["home", "away", "out", "in"]);

  /** Carries a drawing's own placement into the spin, which would otherwise replace it. */
  const OWN_TRANSFORM_PROPERTY = "--floorplan-own-transform";
  const NO_TRANSFORM = "translate(0)";

  const BRIGHTNESS_MAX = 255;

  // The reticle a tapped control is marked with until Home Assistant answers: how far it stands
  // off the control, and how long it takes to let go once the answer is in.
  const RETICLE_PADDING_PX = 7;
  const RELEASE_MS = 260;

  // A light held rather than tapped opens its colour, if it has one.
  const COLOR_MODES_ATTRIBUTE = "supported_color_modes";
  const PRIMARY_BUTTON = 0;

  let {
    floorplans,
    initial,
    defaultXy,
    labels,
  }: {
    floorplans: Record<string, Floorplan>;
    initial: string | null;
    defaultXy: [number, number];
    labels: Labels;
  } = $props();

  const levels = $derived(Object.keys(floorplans));
  const defaultLevel = $derived(initial && initial in floorplans ? initial : levels[0]);

  // A storey other than the panel's own is a choice that lapses, the same way the forecast's week does.
  const level = new Lapsing<string>(PANE_RESET_MS);
  let markup = $state<Record<string, string>>({});
  let panes = $state<Record<string, HTMLDivElement>>({});

  const currentLevel = $derived(level.chosen ?? defaultLevel);
  const index = $derived(Math.max(levels.indexOf(currentLevel), 0));

  /*
   * The control last tapped, marked on the pane it is drawn on, so it slides away with its
   * storey rather than staying over whichever one is swiped in. Counted, so a second tap
   * starts the lock-on over rather than inheriting the first one's. While a light that can be
   * coloured is being held, it closes in over the hold's length instead.
   */
  let reticle = $state<{
    entityId: string;
    level: string;
    serial: number;
    holding: boolean;
    box: Box;
  } | null>(null);
  let taps = 0;
  const held = $derived(reticle !== null && (reticle.holding || pending.isPending(reticle.entityId)));

  let colouring = $state<{ entityId: string; fill: SliderFill; from: Box } | null>(null);
  let holdTimer: number | null = null;
  // The press became a hold, so the click it ends in is not a tap.
  let heldLong = false;

  $effect(() => () => stopHold());

  $effect(() => {
    if (reticle === null || held) {
      return;
    }

    const release = window.setTimeout(() => (reticle = null), RELEASE_MS);

    return () => window.clearTimeout(release);
  });

  // The stylesheet lives with the SVG in Home Assistant and applies to inlined markup, so it
  // is linked once into the document rather than scoped to this component.
  $effect(() => {
    const href = floorplanStylesUrl();
    if (document.querySelector(`link[href="${href}"]`)) {
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.append(link);
  });

  // Every level is loaded and laid out side by side, so changing level is a slide rather than
  // a swap: a drawing that blinks from one storey to another tells you nothing about which way
  // you just moved.
  $effect(() => {
    const stops = levels.map((name) =>
      keepTrying(
        async () => {
          const response = await fetch(floorplanUrl(name));
          if (!response.ok) {
            throw new Error(`floorplan ${name}: ${response.status}`);
          }

          return response.text();
        },
        (svg) => {
          markup = { ...markup, [name]: svg };
        },
      ),
    );

    return () => stops.forEach((stop) => stop());
  });

  // Re-runs whenever an entity changes, because `ha.entities` is read while painting. Each
  // level is painted inside its own pane, since an entity can appear on more than one storey.
  $effect(() => {
    for (const [name, plan] of Object.entries(floorplans)) {
      const root = panes[name];
      if (!root || !markup[name]) {
        continue;
      }

      for (const [group, entities] of Object.entries(plan.groups)) {
        for (const entityId of entities) {
          for (const element of root.querySelectorAll(`#${CSS.escape(entityId)}`)) {
            element.setAttribute("class", classFor(group, entityId));
            paintLight(element as SVGElement, group, entityId);
            keepPlacement(element as SVGGraphicsElement, group);
          }
        }
      }
    }
  });

  function prefixFor(group: string): string {
    return CLASS_PREFIXES[group] ?? group.replace(/s$/, "");
  }

  function classFor(group: string, entityId: string): string {
    const state = ha.state(entityId);
    const prefix = prefixFor(group);

    if (group === "doors") {
      const known = state ? DOOR_CLASSES[state] : null;

      return known ? `${prefix} ${known}` : `${prefix} ${INACTIVE} ${state ?? ""}`.trim();
    }

    if (group === "bins") {
      return `${prefix} ${state && BIN_STATES.has(state) ? state : INACTIVE}`;
    }

    return `${prefix} ${state && ACTIVE_STATES.has(state) ? ACTIVE : INACTIVE}`;
  }

  /** A spinning fan turns about where the drawing put it, rather than jumping back to the origin. */
  function keepPlacement(element: SVGGraphicsElement, group: string): void {
    if (group !== "fans") {
      return;
    }

    // Copied as a matrix rather than as the attribute's own text: SVG lets a transform carry
    // unitless user units, which the CSS transform property rejects, and one invalid function
    // drops the whole declaration.
    const own = element.transform?.baseVal.consolidate()?.matrix;
    const placement = own ? `matrix(${own.a}, ${own.b}, ${own.c}, ${own.d}, ${own.e}, ${own.f})` : NO_TRANSFORM;

    element.style.setProperty(OWN_TRANSFORM_PROPERTY, placement);
  }

  /** Lights carry their brightness and color through to the drawing. */
  function paintLight(element: SVGElement, group: string, entityId: string): void {
    if (group !== "lights") {
      return;
    }

    const brightness = ha.attribute<number>(entityId, "brightness");
    element.style.opacity = brightness === null ? "" : String(brightness / BRIGHTNESS_MAX);

    const rgb = ha.attribute<number[]>(entityId, "rgb_color");
    element.style.fill = rgb ? `rgb(${rgb.join(",")})` : "";
  }

  /** The control a press landed on, if it landed on one. */
  function controlAt(target: EventTarget | null): Element | null {
    const plan = floorplans[currentLevel];
    if (!plan) {
      return null;
    }

    const controllable = new Set([...CONTROLLABLE_GROUPS].flatMap((group) => plan.groups[group] ?? []));

    // Walked up rather than taken from the nearest id, because a drawing is free to give the
    // parts of a control ids of its own — a fan is a group of blades over a hit area, and the
    // entity is on the group, not on whichever piece the finger landed.
    for (let element = target as Element | null; element; element = element.parentElement) {
      if (controllable.has(element.id)) {
        return element;
      }
    }

    return null;
  }

  function onTap(event: MouseEvent): void {
    if (heldLong) {
      heldLong = false;
      return;
    }

    const element = controlAt(event.target);
    if (element && pending.send(element.id)) {
      mark(element, element.id);
    }
  }

  /** Puts the reticle round a control, measured against the pane it is drawn on. */
  function mark(element: Element, entityId: string, holding = false): void {
    const pane = panes[currentLevel];
    if (!pane) {
      return;
    }

    const within = pane.getBoundingClientRect();
    const box = padded(element);

    reticle = {
      entityId,
      level: currentLevel,
      serial: ++taps,
      holding,
      box: { ...box, left: box.left - within.left, top: box.top - within.top },
    };
  }

  /** Where the reticle's corners sit round a control, on the screen. */
  function padded(element: Element): Box {
    const box = element.getBoundingClientRect();

    return {
      left: box.left - RETICLE_PADDING_PX,
      top: box.top - RETICLE_PADDING_PX,
      width: box.width + 2 * RETICLE_PADDING_PX,
      height: box.height + 2 * RETICLE_PADDING_PX,
    };
  }

  function stopHold(): void {
    if (holdTimer !== null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  /*
   * A light held long enough opens its colour window out of the reticle's corners, or, on a light
   * that cannot be coloured, does nothing at all: it neither switches nor closes in, so it never
   * promises a window it cannot open. Anything else held is a tap like any other.
   *
   * Listened for on the window once pressed, since the colour window opens over the finger, and the
   * release lands on that rather than back here.
   */
  function holds(viewport: HTMLElement) {
    let startX = 0;
    let startY = 0;

    function down(event: PointerEvent) {
      heldLong = false;

      if (event.button !== PRIMARY_BUTTON || !event.isPrimary) {
        return;
      }

      const element = controlAt(event.target);
      const level = currentLevel;
      const plan = floorplans[level];
      if (!element || !plan?.groups[LIGHTS]?.includes(element.id)) {
        return;
      }

      const entityId = element.id;
      const colourable = takesHue(ha.attribute<string[]>(entityId, COLOR_MODES_ATTRIBUTE));

      startX = event.clientX;
      startY = event.clientY;

      if (colourable) {
        mark(element, entityId, true);
      }

      holdTimer = window.setTimeout(() => {
        holdTimer = null;
        heldLong = true;

        if (colourable) {
          reticle = null;
          colouring = { entityId, fill: plan.fill, from: padded(element) };
        }
      }, COLOUR_HOLD_MS);

      window.addEventListener("pointermove", moved);
      window.addEventListener("pointerup", ended);
      window.addEventListener("pointercancel", ended);
    }

    function moved(event: PointerEvent) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > TAP_SLOP_PX) {
        ended();
      }
    }

    function ended() {
      stopHold();
      unlisten();

      // Let go, so the reticle springs back out unless the tap it was holds it on.
      if (reticle?.holding) {
        reticle.holding = false;
      }
    }

    function unlisten() {
      window.removeEventListener("pointermove", moved);
      window.removeEventListener("pointerup", ended);
      window.removeEventListener("pointercancel", ended);
    }

    viewport.addEventListener("pointerdown", down);

    return {
      destroy() {
        viewport.removeEventListener("pointerdown", down);
        unlisten();
      },
    };
  }

  function step(direction: Direction): void {
    showLevel(nextLevel(levels, currentLevel, direction));
  }

  function showLevel(name: string): void {
    level.choose(name);
  }
</script>

<section class="floorplan">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="floorplan__viewport"
    onclick={onTap}
    oncontextmenu={(event) => event.preventDefault()}
    use:holds
    use:swipeable={{ onSwipe: step, axes: "horizontal", exclusive: true }}
  >
    <div class="floorplan__track" style:transform="translateX({-index * 100}%)">
      {#each levels as name (name)}
        <div class="floorplan__canvas" bind:this={panes[name]}>
          {@html markup[name] ?? ""}

          {#if reticle?.level === name}
            {#key reticle.serial}
              <div
                class="floorplan__reticle"
                style:left="{reticle.box.left}px"
                style:top="{reticle.box.top}px"
                style:width="{reticle.box.width}px"
                style:height="{reticle.box.height}px"
              >
                <Reticle holding={reticle.holding} releasing={!held} holdMs={COLOUR_HOLD_MS} releaseMs={RELEASE_MS} />
              </div>
            {/key}
          {/if}
        </div>
      {/each}
    </div>
  </div>

  {#if colouring}
    <HueWindow
      entityId={colouring.entityId}
      {defaultXy}
      fill={colouring.fill}
      from={colouring.from}
      {labels}
      onclose={() => (colouring = null)}
    />
  {/if}

  {#if levels.length > 1}
    <nav class="floorplan__levels" aria-label="Floorplan levels">
      {#each levels as name (name)}
        <button
          type="button"
          class="floorplan__level"
          class:floorplan__level--active={name === currentLevel}
          aria-label={name}
          onclick={() => showLevel(name)}
        ></button>
      {/each}
    </nav>
  {/if}
</section>

<style>
  .floorplan {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 0;
    height: 100%;
  }

  .floorplan__viewport {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    overflow: hidden;
    -webkit-touch-callout: none;
    user-select: none;
  }

  .floorplan__track {
    display: flex;
    height: 100%;
    transition: transform var(--floorplan-slide-duration) ease-in-out;
  }

  .floorplan__canvas {
    position: relative;
    flex: 0 0 100%;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .floorplan__canvas :global(svg) {
    width: 100%;
    height: 100%;
  }

  /* Where the reticle round a tapped control is drawn; `Reticle` draws it. */
  .floorplan__reticle {
    position: absolute;
    pointer-events: none;
  }

  .floorplan__levels {
    display: flex;
    gap: 0.7em;
    /* Roomy enough to be a target on a wall panel, not just a marker. */
    padding: 1em 1.4em;
    /* Centred on the panel rather than on the column the floorplan occupies, which is what the
     * announcement below them is centred on. Shifted rather than repositioned, so the dots
     * keep the vertical place in the card's flow that they already had. */
    transform: translateX(calc(-1 * var(--centre-column-drift)));
  }

  .floorplan__level {
    width: 9px;
    height: 9px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background-color: var(--color-faint);
    cursor: pointer;
  }

  .floorplan__level--active {
    background-color: var(--color-muted);
  }
</style>
