<script lang="ts">
  import { strftime } from "../lib/format";
  import type { Box } from "../lib/picture";
  import type { Camera as CameraConfig } from "../lib/types";
  import Camera from "./Camera.svelte";
  import PanelWindow from "./PanelWindow.svelte";

  /*
   * One camera, big, in a window opened out of the tile that was tapped.
   *
   * Its band is the quiet one, with no glint: it is a closer look, not an alert. Nothing in it is
   * something to press, so a tap anywhere closes it.
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

  const MILLISECONDS_PER_SECOND = 1000;
  const CLOCK_FORMAT = "%H:%M:%S";
  const UNTITLED = "Camera";
  // As wide as it may run, unless a picture that wide would be taller than it may be.
  const width = $derived(`min(var(--camera-window-width), calc(var(--camera-window-picture-height) * ${ratio}))`);

  let now = $state(new Date());

  $effect(() => {
    const ticker = window.setInterval(() => (now = new Date()), MILLISECONDS_PER_SECOND);

    return () => window.clearInterval(ticker);
  });
</script>

{#snippet band()}
  <h2 class="camera-window__title">{camera.title}</h2>
  <time class="camera-window__clock">{strftime(now, CLOCK_FORMAT)}</time>
{/snippet}

<PanelWindow {from} label={camera.title ?? UNTITLED} {width} header={camera.title ? band : undefined} {onlanding} {onclose}>
  <div class="camera-window__picture" style:aspect-ratio={ratio}>
    <Camera {camera} expanded />
  </div>
</PanelWindow>

<style>
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
  }

  .camera-window__picture > :global(*) {
    flex: 1 1 auto;
  }
</style>
