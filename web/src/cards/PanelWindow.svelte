<script lang="ts">
  import type { Snippet } from "svelte";
  import { faceVisibility } from "../lib/cube.svelte";
  import type { Box } from "../lib/picture";
  import { portal } from "../lib/portal";

  /*
   * A window over the panel, opened out of the thing that asked for it and closed back into it.
   *
   * It opens the way the master caution's list does: the corner brackets leave the origin's corners
   * for the window's, the title band wipes across between them, and the body drops down under it.
   * Closing folds the body back up into the band, holds a beat, and sends the brackets home as the
   * band wipes out.
   *
   * What goes in it, and the band's words, are the caller's. The band is either `quiet`, a dark
   * strip with light type, for a closer look at something, or `solid`, a grey band with dark type
   * drawn the way a lit master's is, for a control's window, and may be tinted with what the control
   * is set to. Neither glints: that is for an alert.
   *
   * A window of things to look at closes at a tap anywhere. A window of things to press
   * (`interactive`) closes only at a tap on the glass around it.
   */

  type Band = "quiet" | "solid";

  let {
    from,
    label,
    width = null,
    band = "quiet",
    tint = null,
    lightType = false,
    interactive = false,
    header,
    children,
    onlanding,
    onclose,
  }: {
    /** Where the window came out of, and where its brackets go back to. */
    from: Box;
    /** What the window is called to anything reading the panel. */
    label: string;
    /** How wide the window is, as CSS; unset, as wide as what is in it. */
    width?: string | null;
    band?: Band;
    /** A colour for a solid band in place of its grey, as CSS, with light type over it if it is dark. */
    tint?: string | null;
    lightType?: boolean;
    interactive?: boolean;
    /** What the band says; with none, there is no band, and the body simply drops. */
    header?: Snippet;
    children: Snippet;
    /** The brackets are nearly home, so the origin can be shown again under them. */
    onlanding?: () => void;
    onclose: () => void;
  } = $props();

  const visibility = faceVisibility();

  // The same beats as the master caution's list, so the panel has one way of opening a window.
  const FLY_MS = 300;
  const WIPE_MS = 200;
  const EXPAND_MS = 240;
  const HOLD_MS = 150;
  // How far into the flight home the origin shows again, so the brackets land on it.
  const LANDING_SHARE = 0.6;
  const MILLISECONDS = "ms";
  const PIXELS = "px";
  const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];

  let windowElement = $state<HTMLElement | null>(null);
  let headerElement = $state<HTMLElement | null>(null);
  let panelElement = $state<HTMLElement | null>(null);
  let closing = $state(false);
  const timers: number[] = [];
  // Whether a press began where a tap closes the window. A touchscreen sends the tap that opened
  // the window a click of its own, aimed at wherever the tap landed, and by then the glass is what
  // is there.
  let armed = false;

  $effect(() => () => timers.forEach((timer) => window.clearTimeout(timer)));

  $effect(() => {
    if (windowElement) {
      measure(windowElement);
    }
  });

  // A face turned away takes its window with it, at once: nobody is there to watch it fold.
  $effect(() => {
    if (!visibility.showing) {
      onclose();
    }
  });

  /**
   * Tells each bracket how far its corner of the window is from the same corner of the origin,
   * and how much of the window lies under the band, which is what folds away.
   */
  function measure(node: HTMLElement) {
    const box = node.getBoundingClientRect();
    const bandHeight = headerElement?.getBoundingClientRect().height ?? 0;

    node.style.setProperty("--window-from-left", `${from.left - box.left}${PIXELS}`);
    node.style.setProperty("--window-from-top", `${from.top - box.top}${PIXELS}`);
    node.style.setProperty("--window-from-right", `${from.left + from.width - box.right}${PIXELS}`);
    node.style.setProperty("--window-from-bottom", `${from.top + from.height - box.bottom}${PIXELS}`);
    node.style.setProperty("--window-header-height", `${bandHeight}${PIXELS}`);
    node.style.setProperty("--window-body-height", `${box.height - bandHeight}${PIXELS}`);
  }

  function closes(target: EventTarget | null): boolean {
    return !interactive || !(target instanceof Node && panelElement?.contains(target));
  }

  function press(event: PointerEvent) {
    armed = closes(event.target);
  }

  function dismiss(event: MouseEvent) {
    if (armed && closes(event.target)) {
      close();
    }
  }

  /** Folds the window back into where it came from, as a tap on the glass does. */
  export function close() {
    if (closing) {
      return;
    }

    armed = false;
    closing = true;

    const home = EXPAND_MS + HOLD_MS;
    if (onlanding) {
      timers.push(window.setTimeout(onlanding, home + FLY_MS * LANDING_SHARE));
    }
    timers.push(window.setTimeout(onclose, home + FLY_MS));
  }
</script>

<!-- The glass closes it: a wall panel has no keyboard. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="panel-window"
  class:panel-window--closing={closing}
  style:--window-fly="{FLY_MS}{MILLISECONDS}"
  style:--window-expand="{EXPAND_MS}{MILLISECONDS}"
  style:--window-wipe="{WIPE_MS}{MILLISECONDS}"
  style:--window-pause="{HOLD_MS}{MILLISECONDS}"
  use:portal
  onpointerdown={press}
  onclick={dismiss}
>
  <div class="panel-window__window" style:width bind:this={windowElement}>
    {#each CORNERS as corner (corner)}
      <span class="bracket bracket--{corner} panel-window__bracket panel-window__bracket--{corner}" aria-hidden="true"
      ></span>
    {/each}

    <div class="panel-window__panel" role="dialog" aria-label={label} bind:this={panelElement}>
      {#if header}
        <header
          class="panel-window__header panel-window__header--{band}"
          class:panel-window__header--light-type={tint !== null && lightType}
          style:--window-band={tint}
          bind:this={headerElement}
        >
          {@render header()}
        </header>
      {/if}

      {@render children()}
    </div>
  </div>
</div>

<style>
  .panel-window {
    --bracket-size: 1.6rem;
    --bracket-weight: 3px;
    --bracket-inset: -6px;
    --bracket-color: var(--color-muted);
    /* One curve both ways, so flying home takes as long, and feels as long, as flying out. */
    --window-flight: cubic-bezier(0.65, 0, 0.35, 1);
    --window-leaving: calc(var(--window-expand) + var(--window-pause));

    position: fixed;
    inset: 0;
    /* Over the announcement overlay, and under the masters: a warning is still the first thing
     * on the panel, whatever is being looked at. */
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 0.65);
    animation: window-fade var(--window-fly) ease-out both;
  }

  .panel-window--closing {
    animation: window-fade-out var(--window-fly) ease-in var(--window-leaving) both;
  }

  .panel-window__window {
    --window-from-left: 0px;
    --window-from-top: 0px;
    --window-from-right: 0px;
    --window-from-bottom: 0px;
    --window-header-height: 0px;
    --window-body-height: 0px;

    position: relative;
  }

  .panel-window__bracket {
    /* Where each bracket rests while only the band is showing: the top pair are already home,
     * and the bottom pair sit up at the band's bottom edge. */
    --window-band-only: translate(0, 0);

    z-index: 1;
    /* The second only holds forwards, so while the first is flying it is not also applied. */
    animation:
      window-fly var(--window-fly) var(--window-flight) both,
      window-open var(--window-expand) ease-out var(--window-fly) forwards;
  }

  .panel-window--closing .panel-window__bracket {
    animation:
      window-close var(--window-expand) ease-in both,
      window-return var(--window-fly) var(--window-flight) var(--window-leaving) forwards;
  }

  /* Each corner starts on the same corner of what it came out of. */
  .panel-window__bracket--top-left {
    --window-start: translate(var(--window-from-left), var(--window-from-top));
  }

  .panel-window__bracket--top-right {
    --window-start: translate(var(--window-from-right), var(--window-from-top));
  }

  .panel-window__bracket--bottom-left {
    --window-start: translate(var(--window-from-left), var(--window-from-bottom));
    --window-band-only: translateY(calc(-1 * var(--window-body-height)));
  }

  .panel-window__bracket--bottom-right {
    --window-start: translate(var(--window-from-right), var(--window-from-bottom));
    --window-band-only: translateY(calc(-1 * var(--window-body-height)));
  }

  /* Clipped rather than resized, so what is inside does not reflow as it opens. */
  .panel-window__panel {
    overflow: hidden;
    border: 2px solid var(--color-dim);
    border-radius: 0.6rem;
    background: var(--color-background);
    animation: window-unfold var(--window-expand) ease-out var(--window-fly) both;
  }

  .panel-window--closing .panel-window__panel {
    animation:
      window-fold var(--window-expand) ease-in both,
      window-wipe-out var(--window-wipe) ease-in var(--window-leaving) forwards;
  }

  .panel-window__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 2rem;
  }

  /* A closer look at something: dark, with the type light. */
  .panel-window__header--quiet {
    padding: 0.6rem 1.4rem;
    background: var(--color-faint);
    color: var(--color-foreground);
  }

  /* A control's window: drawn the way a lit master's list is, a solid band with dark type, but in
   * grey, since it is nothing to be alarmed by. */
  .panel-window__header--solid {
    padding: 0.7rem 2rem;
    background: var(--window-band, var(--color-muted));
    color: var(--color-background);
    transition:
      background-color var(--colour-fade) ease,
      color var(--colour-fade) ease;
  }

  /* A band tinted dark enough that dark type would not read on it. */
  .panel-window__header--light-type {
    color: var(--color-foreground);
  }

  @keyframes window-fade {
    from {
      opacity: 0;
    }
  }

  @keyframes window-fade-out {
    to {
      opacity: 0;
    }
  }

  /* Out of the origin to the corners of the band. */
  @keyframes window-fly {
    from {
      opacity: 0;
      transform: var(--window-start);
    }

    25% {
      opacity: 1;
    }

    to {
      transform: var(--window-band-only);
    }
  }

  @keyframes window-open {
    from {
      transform: var(--window-band-only);
    }

    to {
      transform: none;
    }
  }

  @keyframes window-close {
    from {
      transform: none;
    }

    to {
      transform: var(--window-band-only);
    }
  }

  /* Home again: the way out, backwards. */
  @keyframes window-return {
    from {
      transform: var(--window-band-only);
    }

    75% {
      opacity: 1;
    }

    to {
      opacity: 0;
      transform: var(--window-start);
    }
  }

  /*
   * The window's outline as a band, its right edge in the second and third points, and a body
   * under it, its bottom edge in the last two. Written as one shape so the band can wipe across
   * while the body drops, which two clips on one element cannot do. With no band, the body simply
   * drops.
   */
  @keyframes window-unfold {
    from {
      clip-path: polygon(
        0 0,
        0 0,
        0 var(--window-header-height),
        100% var(--window-header-height),
        100% var(--window-header-height),
        0 var(--window-header-height)
      );
    }

    to {
      clip-path: polygon(
        0 0,
        100% 0,
        100% var(--window-header-height),
        100% var(--window-header-height),
        100% 100%,
        0 100%
      );
    }
  }

  @keyframes window-fold {
    from {
      clip-path: polygon(
        0 0,
        100% 0,
        100% var(--window-header-height),
        100% var(--window-header-height),
        100% 100%,
        0 100%
      );
    }

    to {
      clip-path: polygon(
        0 0,
        100% 0,
        100% var(--window-header-height),
        100% var(--window-header-height),
        100% var(--window-header-height),
        0 var(--window-header-height)
      );
    }
  }

  @keyframes window-wipe-out {
    from {
      clip-path: polygon(
        0 0,
        100% 0,
        100% var(--window-header-height),
        100% var(--window-header-height),
        100% var(--window-header-height),
        0 var(--window-header-height)
      );
    }

    to {
      clip-path: polygon(
        0 0,
        0 0,
        0 var(--window-header-height),
        100% var(--window-header-height),
        100% var(--window-header-height),
        0 var(--window-header-height)
      );
    }
  }
</style>
