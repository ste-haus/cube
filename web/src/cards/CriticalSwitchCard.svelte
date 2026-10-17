<script lang="ts">
  import type { Snippet } from "svelte";
  import CriticalSwitchWindow from "./CriticalSwitchWindow.svelte";
  import Reticle from "./Reticle.svelte";
  import { TAP_SLOP_PX } from "../lib/cube.svelte";
  import { advising } from "../lib/critical";
  import { COLOUR_HOLD_MS } from "../lib/hue";
  import { pending } from "../lib/pending.svelte";
  import type { Box } from "../lib/picture";
  import { ha } from "../lib/state.svelte";
  import { BREATHE_MS, beatPhase } from "../lib/travel";
  import type { CriticalSwitch, Labels } from "../lib/types";

  /*
   * A card with a critical switch held behind it.
   *
   * A card is too big to swell, so a hold on it is the floorplan's: the reticle closes in on the
   * card over the hold, and once its corners meet, the switch's window flies out of them. Letting
   * go or sliding off first does nothing, and a slide is left to turn the cube. Once the window
   * has sent something, the reticle locks back on and breathes until Home Assistant answers.
   *
   * While the switch is off, the card breathes its frame and title in `advisoryColour`, the
   * secondary: an advisory, something left off on purpose that is worth knowing but is no caution.
   * It keeps the page's time (`beatPhase`), as every beat on the panel does. A card's own
   * alert (`card--alert` on its root, as a host down or a rack past its caution) outranks it.
   *
   * A card with no switch is drawn as it is, and a hold on it does nothing.
   */

  const MILLISECONDS = "ms";
  const PRIMARY_BUTTON = 0;
  // How quickly the reticle springs back out, and how far it stands off the card's edge.
  const RELEASE_MS = 260;
  const RETICLE_PADDING_PX = 7;
  const PIXELS = "px";

  let {
    critical,
    labels,
    advisoryColour,
    children,
  }: {
    critical: CriticalSwitch | null;
    labels: Labels;
    advisoryColour: string;
    children: Snippet;
  } = $props();

  let holding = $state(false);
  let opened = $state<Box | null>(null);
  // Bumped for each lock-on, so the reticle starts its closing in afresh.
  let serial = $state(0);

  const switchState = $derived(critical ? ha.state(critical.entity_id) : null);
  const advises = $derived(advising(critical, switchState));
  const phase = $derived(advises ? beatPhase(BREATHE_MS) : null);
  const waiting = $derived(critical !== null && opened === null && pending.isPending(critical.entity_id));
  const locked = $derived(holding || waiting);

  // Kept on screen after the lock lets go, for as long as the corners take to spring back out.
  let showing = $state(false);

  $effect(() => {
    if (locked) {
      showing = true;

      return;
    }

    const release = window.setTimeout(() => (showing = false), RELEASE_MS);

    return () => window.clearTimeout(release);
  });

  /*
   * Listened for natively, not through Svelte's delegated handlers, so the hold sees the press
   * before the cube does; it only ever reads the press, and leaves a slide to the cube.
   */
  function holds(node: HTMLElement) {
    let startX = 0;
    let startY = 0;
    let timer: number | null = null;

    function down(event: PointerEvent) {
      if (!critical || event.button !== PRIMARY_BUTTON || !event.isPrimary || opened !== null) {
        return;
      }

      startX = event.clientX;
      startY = event.clientY;
      serial += 1;
      holding = true;

      timer = window.setTimeout(() => {
        timer = null;
        holding = false;
        unlisten();
        opened = boxOf(node);
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
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }

      holding = false;
      unlisten();
    }

    function unlisten() {
      window.removeEventListener("pointermove", moved);
      window.removeEventListener("pointerup", ended);
      window.removeEventListener("pointercancel", ended);
    }

    node.addEventListener("pointerdown", down);

    return {
      destroy() {
        node.removeEventListener("pointerdown", down);
        ended();
      },
    };
  }

  function boxOf(node: HTMLElement): Box {
    const box = node.getBoundingClientRect();

    return {
      left: box.left - RETICLE_PADDING_PX,
      top: box.top - RETICLE_PADDING_PX,
      width: box.width + 2 * RETICLE_PADDING_PX,
      height: box.height + 2 * RETICLE_PADDING_PX,
    };
  }
</script>

{#if critical}
  <!-- Held, not tapped: a wall panel has no keyboard, and the long press's own menu is kept off it. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="critical-switch-card"
    class:critical-switch-card--advising={advises}
    style:--critical-switch-breathe="{BREATHE_MS}{MILLISECONDS}"
    style:--critical-switch-phase={phase}
    style:--critical-switch-advisory={advisoryColour}
    style:--critical-switch-reticle-padding="{RETICLE_PADDING_PX}{PIXELS}"
    oncontextmenu={(event) => event.preventDefault()}
    use:holds
  >
    {@render children()}

    {#if showing && opened === null}
      {#key serial}
        <div class="critical-switch-card__reticle">
          <Reticle {holding} releasing={!locked} holdMs={COLOUR_HOLD_MS} releaseMs={RELEASE_MS} />
        </div>
      {/key}
    {/if}
  </div>

  {#if opened}
    <CriticalSwitchWindow {critical} {labels} {advisoryColour} from={opened} onclose={() => (opened = null)} />
  {/if}
{:else}
  {@render children()}
{/if}

<style>
  /* The card fills what it is given, as it would without the switch round it. */
  .critical-switch-card {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    -webkit-touch-callout: none;
    user-select: none;
  }

  .critical-switch-card > :global(*:not(.critical-switch-card__reticle)) {
    flex: 1 1 auto;
    min-width: 0;
  }

  .critical-switch-card__reticle {
    position: absolute;
    inset: calc(-1 * var(--critical-switch-reticle-padding));
    pointer-events: none;
  }

  /* Doubled up to outrank the card's own frame, and never over the card's own alert. */
  .critical-switch-card.critical-switch-card--advising > :global(:not(.card--alert, .critical-switch-card__reticle)) {
    border-color: var(--critical-switch-advisory);
    animation: critical-switch-frame-breathe var(--critical-switch-breathe) ease-in-out var(--critical-switch-phase)
      infinite;
  }

  .critical-switch-card.critical-switch-card--advising > :global(:not(.card--alert)) :global(.card-title) {
    color: var(--critical-switch-advisory);
    animation: critical-switch-breathe var(--critical-switch-breathe) ease-in-out var(--critical-switch-phase) infinite;
  }

  @keyframes critical-switch-frame-breathe {
    50% {
      border-color: var(--color-faint);
    }
  }

  @keyframes critical-switch-breathe {
    50% {
      filter: brightness(0.45);
    }
  }
</style>
