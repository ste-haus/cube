<script lang="ts">
  import { floorplanStylesUrl, floorplanUrl, toggle } from "../lib/api";
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

  const BRIGHTNESS_MAX = 255;
  const LEVEL_RESET_MS = 60 * 1000;

  let {
    floorplans,
    initial,
  }: { floorplans: Record<string, Floorplan>; initial: string | null } = $props();

  const levels = $derived(Object.keys(floorplans));
  const defaultLevel = $derived(initial && initial in floorplans ? initial : levels[0]);

  let level = $state<string | null>(null);
  let markup = $state("");
  let container = $state<HTMLDivElement | null>(null);
  let resetTimer: number | null = null;

  const currentLevel = $derived(level ?? defaultLevel);

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

  $effect(() => {
    const name = currentLevel;
    if (!name) {
      return;
    }

    let stale = false;
    fetch(floorplanUrl(name))
      .then((response) => response.text())
      .then((svg) => {
        if (!stale) {
          markup = svg;
        }
      });

    return () => {
      stale = true;
    };
  });

  // Re-runs whenever an entity changes, because `ha.entities` is read while painting.
  $effect(() => {
    const root = container;
    const plan = currentLevel ? floorplans[currentLevel] : null;
    if (!root || !plan || !markup) {
      return;
    }

    for (const [group, entities] of Object.entries(plan.groups)) {
      for (const entityId of entities) {
        const element = root.querySelector(`#${CSS.escape(entityId)}`);
        if (!element) {
          continue;
        }

        element.setAttribute("class", classFor(group, entityId));
        paintLight(element as SVGElement, group, entityId);
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
    const plan = currentLevel ? floorplans[currentLevel] : null;
    if (!plan) {
      return;
    }

    const target = (event.target as Element | null)?.closest("[id]");
    const entityId = target?.id;
    if (!entityId) {
      return;
    }

    for (const group of CONTROLLABLE_GROUPS) {
      if (plan.groups[group]?.includes(entityId)) {
        toggle(entityId);

        return;
      }
    }
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
  <div class="floorplan__canvas" bind:this={container} onclick={onTap}>
    {@html markup}
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

  .floorplan__canvas {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }

  .floorplan__canvas :global(svg) {
    max-width: 100%;
    max-height: 100%;
    height: auto;
  }

  .floorplan__levels {
    display: flex;
    gap: 0.5em;
    padding: 0.6em 0;
  }

  .floorplan__level {
    width: 8px;
    height: 8px;
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
