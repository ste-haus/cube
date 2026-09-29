<script lang="ts">
  import { faceVisibility } from "../lib/cube.svelte";
  import { strftime } from "../lib/format";
  import type { Box } from "../lib/picture";
  import { portal } from "../lib/portal";
  import type { Camera as CameraConfig } from "../lib/types";
  import Camera from "./Camera.svelte";

  /*
   * One camera, big. It opens the way the master caution's list does, out of the tile that was
   * tapped: the corner brackets leave the tile's corners for the window's, the title band wipes
   * across between them, and the picture drops down under it. Closing folds the picture back up
   * into the band, holds a beat, and sends the brackets home to the tile as the band wipes out.
   *
   * Grey rather than a tier's colour, and with no glint: it is a closer look, not an alert.
   */

  let {
    camera,
    from,
    ratio,
    onlanding,
    onclose,
  }: {
    camera: CameraConfig;
    /** The tapped tile's picture, where the brackets start and where they go back to. */
    from: Box;
    /** The picture's width over its height, which the window is shaped to. */
    ratio: number;
    /** The brackets are nearly home, so the tile can be shown again under them. */
    onlanding: () => void;
    onclose: () => void;
  } = $props();

  const visibility = faceVisibility();

  // The same beats as the master caution's list, so the panel has one way of opening a window.
  const FLY_MS = 300;
  const WIPE_MS = 200;
  const EXPAND_MS = 240;
  const HOLD_MS = 150;
  // How far into the flight home the tile shows again, so the brackets land on a picture.
  const LANDING_SHARE = 0.6;
  const MILLISECONDS = "ms";
  const MILLISECONDS_PER_SECOND = 1000;
  const PIXELS = "px";
  const CLOCK_FORMAT = "%H:%M:%S";
  const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];

  let windowElement = $state<HTMLElement | null>(null);
  let header = $state<HTMLElement | null>(null);
  let closing = $state(false);
  let now = $state(new Date());
  const timers: number[] = [];
  // Whether a press began on the glass. A touchscreen sends the tap that opened the window a
  // click of its own, aimed at wherever the tap landed, and by then the glass is what is there.
  let armed = false;

  $effect(() => {
    const ticker = window.setInterval(() => (now = new Date()), MILLISECONDS_PER_SECOND);

    return () => {
      window.clearInterval(ticker);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  });

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
   * Tells each bracket how far its corner of the window is from the same corner of the tile,
   * and how much of the window lies under the band, which is what folds away.
   */
  function measure(node: HTMLElement) {
    const box = node.getBoundingClientRect();
    const band = header?.getBoundingClientRect().height ?? 0;

    node.style.setProperty("--camera-from-left", `${from.left - box.left}${PIXELS}`);
    node.style.setProperty("--camera-from-top", `${from.top - box.top}${PIXELS}`);
    node.style.setProperty("--camera-from-right", `${from.left + from.width - box.right}${PIXELS}`);
    node.style.setProperty("--camera-from-bottom", `${from.top + from.height - box.bottom}${PIXELS}`);
    node.style.setProperty("--camera-header-height", `${band}${PIXELS}`);
    node.style.setProperty("--camera-body-height", `${box.height - band}${PIXELS}`);
  }

  function dismiss() {
    if (!armed || closing) {
      return;
    }

    armed = false;
    closing = true;

    const home = EXPAND_MS + HOLD_MS;
    timers.push(window.setTimeout(onlanding, home + FLY_MS * LANDING_SHARE));
    timers.push(window.setTimeout(onclose, home + FLY_MS));
  }
</script>

<!-- Anywhere on the glass closes it: a wall panel has no keyboard, and nothing in the window is
     itself something to press. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="camera-window"
  class:camera-window--closing={closing}
  style:--camera-ratio={ratio}
  style:--camera-fly="{FLY_MS}{MILLISECONDS}"
  style:--camera-expand="{EXPAND_MS}{MILLISECONDS}"
  style:--camera-wipe="{WIPE_MS}{MILLISECONDS}"
  style:--camera-pause="{HOLD_MS}{MILLISECONDS}"
  use:portal
  onpointerdown={() => (armed = true)}
  onclick={dismiss}
>
  <div class="camera-window__window" bind:this={windowElement}>
    {#each CORNERS as corner (corner)}
      <span class="bracket bracket--{corner} camera-window__bracket camera-window__bracket--{corner}" aria-hidden="true"
      ></span>
    {/each}

    <div class="camera-window__panel" role="dialog" aria-label={camera.title ?? "Camera"}>
      {#if camera.title}
        <header class="camera-window__header" bind:this={header}>
          <h2 class="camera-window__title">{camera.title}</h2>
          <time class="camera-window__clock">{strftime(now, CLOCK_FORMAT)}</time>
        </header>
      {/if}

      <div class="camera-window__picture">
        <Camera {camera} expanded />
      </div>
    </div>
  </div>
</div>

<style>
  .camera-window {
    --bracket-size: 1.6rem;
    --bracket-weight: 3px;
    --bracket-inset: -6px;
    --bracket-color: var(--color-muted);
    /* One curve both ways, so flying home takes as long, and feels as long, as flying out. */
    --camera-flight: cubic-bezier(0.65, 0, 0.35, 1);
    --camera-leaving: calc(var(--camera-expand) + var(--camera-pause));

    position: fixed;
    inset: 0;
    /* Over the announcement overlay, and under the masters: a warning is still the first thing
     * on the panel, whatever is being looked at. */
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 0.65);
    animation: camera-fade var(--camera-fly) ease-out both;
  }

  .camera-window--closing {
    animation: camera-fade-out var(--camera-fly) ease-in var(--camera-leaving) both;
  }

  .camera-window__window {
    --camera-from-left: 0px;
    --camera-from-top: 0px;
    --camera-from-right: 0px;
    --camera-from-bottom: 0px;
    --camera-header-height: 0px;
    --camera-body-height: 0px;

    position: relative;
    width: min(var(--camera-window-width), calc(var(--camera-window-picture-height) * var(--camera-ratio)));
  }

  .camera-window__bracket {
    /* Where each bracket rests while only the band is showing: the top pair are already home,
     * and the bottom pair sit up at the band's bottom edge. */
    --camera-band-only: translate(0, 0);

    z-index: 1;
    /* The second only holds forwards, so while the first is flying it is not also applied. */
    animation:
      camera-fly var(--camera-fly) var(--camera-flight) both,
      camera-open var(--camera-expand) ease-out var(--camera-fly) forwards;
  }

  .camera-window--closing .camera-window__bracket {
    animation:
      camera-close var(--camera-expand) ease-in both,
      camera-return var(--camera-fly) var(--camera-flight) var(--camera-leaving) forwards;
  }

  /* Each corner starts on the same corner of the tile it came out of. */
  .camera-window__bracket--top-left {
    --camera-start: translate(var(--camera-from-left), var(--camera-from-top));
  }

  .camera-window__bracket--top-right {
    --camera-start: translate(var(--camera-from-right), var(--camera-from-top));
  }

  .camera-window__bracket--bottom-left {
    --camera-start: translate(var(--camera-from-left), var(--camera-from-bottom));
    --camera-band-only: translateY(calc(-1 * var(--camera-body-height)));
  }

  .camera-window__bracket--bottom-right {
    --camera-start: translate(var(--camera-from-right), var(--camera-from-bottom));
    --camera-band-only: translateY(calc(-1 * var(--camera-body-height)));
  }

  /* Clipped rather than resized, so the picture inside it does not reflow as it opens. */
  .camera-window__panel {
    overflow: hidden;
    border: 2px solid var(--color-dim);
    border-radius: 0.6rem;
    background: var(--color-background);
    animation: camera-unfold var(--camera-expand) ease-out var(--camera-fly) both;
  }

  .camera-window--closing .camera-window__panel {
    animation:
      camera-fold var(--camera-expand) ease-in both,
      camera-wipe-out var(--camera-wipe) ease-in var(--camera-leaving) forwards;
  }

  .camera-window__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 2rem;
    padding: 0.6rem 1.4rem;
    background: var(--color-faint);
    color: var(--color-foreground);
  }

  .camera-window__title {
    margin: 0;
    font-size: var(--camera-window-title-size);
    font-weight: var(--weight-medium);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .camera-window__clock {
    color: var(--color-muted);
    font-family: "Roboto Mono", monospace;
    font-size: var(--camera-window-clock-size);
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
  }

  .camera-window__picture {
    --camera-anchor: center;

    display: flex;
    aspect-ratio: var(--camera-ratio);
  }

  .camera-window__picture > :global(*) {
    flex: 1 1 auto;
  }

  @keyframes camera-fade {
    from {
      opacity: 0;
    }
  }

  @keyframes camera-fade-out {
    to {
      opacity: 0;
    }
  }

  /* Out of the tile to the corners of the band. */
  @keyframes camera-fly {
    from {
      opacity: 0;
      transform: var(--camera-start);
    }

    25% {
      opacity: 1;
    }

    to {
      transform: var(--camera-band-only);
    }
  }

  @keyframes camera-open {
    from {
      transform: var(--camera-band-only);
    }

    to {
      transform: none;
    }
  }

  @keyframes camera-close {
    from {
      transform: none;
    }

    to {
      transform: var(--camera-band-only);
    }
  }

  /* Home again: the way out, backwards. */
  @keyframes camera-return {
    from {
      transform: var(--camera-band-only);
    }

    75% {
      opacity: 1;
    }

    to {
      opacity: 0;
      transform: var(--camera-start);
    }
  }

  /*
   * The window's outline as a band, its right edge in the second and third points, and a
   * picture under it, its bottom edge in the last two. Written as one shape so the band can
   * wipe across while the picture drops, which two clips on one element cannot do. With no
   * title there is no band, and the picture simply drops.
   */
  @keyframes camera-unfold {
    from {
      clip-path: polygon(
        0 0,
        0 0,
        0 var(--camera-header-height),
        100% var(--camera-header-height),
        100% var(--camera-header-height),
        0 var(--camera-header-height)
      );
    }

    to {
      clip-path: polygon(
        0 0,
        100% 0,
        100% var(--camera-header-height),
        100% var(--camera-header-height),
        100% 100%,
        0 100%
      );
    }
  }

  @keyframes camera-fold {
    from {
      clip-path: polygon(
        0 0,
        100% 0,
        100% var(--camera-header-height),
        100% var(--camera-header-height),
        100% 100%,
        0 100%
      );
    }

    to {
      clip-path: polygon(
        0 0,
        100% 0,
        100% var(--camera-header-height),
        100% var(--camera-header-height),
        100% var(--camera-header-height),
        0 var(--camera-header-height)
      );
    }
  }

  @keyframes camera-wipe-out {
    from {
      clip-path: polygon(
        0 0,
        100% 0,
        100% var(--camera-header-height),
        100% var(--camera-header-height),
        100% var(--camera-header-height),
        0 var(--camera-header-height)
      );
    }

    to {
      clip-path: polygon(
        0 0,
        0 0,
        0 var(--camera-header-height),
        100% var(--camera-header-height),
        100% var(--camera-header-height),
        0 var(--camera-header-height)
      );
    }
  }
</style>
