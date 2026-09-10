<script lang="ts">
  import { floorplanStylesUrl, floorplanUrl, toggle } from "../lib/api";
  import { swipeable, type Direction } from "../lib/cube.svelte";
  import { keepTrying } from "../lib/retry";
  import { ha } from "../lib/state.svelte";
  import type { Floorplan } from "../lib/types";

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
  const LEVEL_RESET_MS = 60 * 1000;

  let {
    floorplans,
    initial,
  }: { floorplans: Record<string, Floorplan>; initial: string | null } = $props();

  const levels = $derived(Object.keys(floorplans));
  const defaultLevel = $derived(initial && initial in floorplans ? initial : levels[0]);

  let level = $state<string | null>(null);
  let markup = $state<Record<string, string>>({});
  let panes = $state<Record<string, HTMLDivElement>>({});
  let resetTimer: number | null = null;

  const currentLevel = $derived(level ?? defaultLevel);
  const index = $derived(Math.max(levels.indexOf(currentLevel), 0));

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

  function onTap(event: MouseEvent): void {
    const plan = floorplans[currentLevel];
    if (!plan) {
      return;
    }

    const controllable = new Set([...CONTROLLABLE_GROUPS].flatMap((group) => plan.groups[group] ?? []));

    // Walked up rather than taken from the nearest id, because a drawing is free to give the
    // parts of a control ids of its own — a fan is a group of blades over a hit area, and the
    // entity is on the group, not on whichever piece the finger landed.
    for (let element = event.target as Element | null; element; element = element.parentElement) {
      if (controllable.has(element.id)) {
        toggle(element.id);

        return;
      }
    }
  }

  function step(direction: Direction): void {
    const index = levels.indexOf(currentLevel);
    const next = direction === "left" ? index + 1 : index - 1;

    showLevel(levels[(next + levels.length) % levels.length]);
  }

  function showLevel(name: string): void {
    level = name;

    if (resetTimer !== null) {
      window.clearTimeout(resetTimer);
    }

    // Wandering off to another level should not leave the panel showing it forever.
    resetTimer = window.setTimeout(() => {
      level = null;
    }, LEVEL_RESET_MS);
  }
</script>

<section class="floorplan">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="floorplan__viewport"
    onclick={onTap}
    use:swipeable={{ onSwipe: step, axes: "horizontal", exclusive: true }}
  >
    <div class="floorplan__track" style:transform="translateX({-index * 100}%)">
      {#each levels as name (name)}
        <div class="floorplan__canvas" bind:this={panes[name]}>
          {@html markup[name] ?? ""}
        </div>
      {/each}
    </div>
  </div>

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
  }

  .floorplan__track {
    display: flex;
    height: 100%;
    transition: transform var(--floorplan-slide-duration) ease-in-out;
  }

  .floorplan__canvas {
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
