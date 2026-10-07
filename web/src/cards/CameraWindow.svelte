<script lang="ts">
  import { strftime } from "../lib/format";
  import type { Box } from "../lib/picture";
  import { waitingLabel } from "../lib/popups";
  import { beatPhase, PULSE_MS } from "../lib/travel";
  import type { Camera as CameraConfig } from "../lib/types";
  import Camera from "./Camera.svelte";
  import PanelWindow from "./PanelWindow.svelte";

  /*
   * One camera, big, in a window opened out of the tile that was tapped.
   *
   * Its band is the quiet one, with no glint: it is a closer look, not an alert. Nothing in it is
   * something to press, so a tap anywhere closes it, unless it is `sticky`: then only a tap on the
   * glass around it does, for a window nobody asked for, which a tap meant for the face under it
   * should not put away.
   *
   * Raised by an `alert`, somebody at the door, it is something to act on now rather than a closer
   * look: its band is solid in the secondary colour and glints as it lands, its brackets pulse in
   * the same colour, as an imminent trip's do, and the band counts up from `since` in place of the
   * time of day, since how long they have been waiting is what matters.
   */

  let {
    camera,
    from,
    ratio,
    sticky = false,
    alert = false,
    since = null,
    onlanding,
    onclose,
  }: {
    camera: CameraConfig;
    /** The tapped tile's picture, where the brackets start and where they go back to. */
    from: Box;
    /** The picture's width over its height, which the window is shaped to. */
    ratio: number;
    sticky?: boolean;
    alert?: boolean;
    /** When the alert began, which the band counts up from; with none, it keeps the time of day. */
    since?: Date | null;
    /** The brackets are nearly home, so the tile can be shown again under them. */
    onlanding?: () => void;
    onclose: () => void;
  } = $props();

  const MILLISECONDS_PER_SECOND = 1000;
  const CLOCK_FORMAT = "%H:%M:%S";
  const UNTITLED = "Camera";
  const MILLISECONDS = "ms";
  const ALERT_COLOUR = "var(--color-secondary)";
  const ALERT_BEAT_LOW = "var(--travel-pulse-opacity)";
  // As wide as it may run, unless a picture that wide would be taller than it may be.
  const width = $derived(`min(var(--camera-window-width), calc(var(--camera-window-picture-height) * ${ratio}))`);

  let now = $state(new Date());

  // In step with every other pulse on the panel.
  const beat = $derived(
    alert ? { period: `${PULSE_MS}${MILLISECONDS}`, phase: beatPhase(PULSE_MS), low: ALERT_BEAT_LOW } : null,
  );
  let panel = $state<ReturnType<typeof PanelWindow> | null>(null);

  /** Folds the window back into where it came from, as a tap on the glass does. */
  export function close() {
    panel?.close();
  }

  $effect(() => {
    const ticker = window.setInterval(() => (now = new Date()), MILLISECONDS_PER_SECOND);

    return () => window.clearInterval(ticker);
  });
</script>

{#snippet band()}
  <h2 class="camera-window__title">{camera.title}</h2>
  <time class="camera-window__clock" class:camera-window__clock--alert={alert}>
    {alert && since ? waitingLabel(since, now) : strftime(now, CLOCK_FORMAT)}
  </time>
{/snippet}

<PanelWindow
  bind:this={panel}
  {from}
  label={camera.title ?? UNTITLED}
  {width}
  interactive={sticky}
  band={alert ? "solid" : "quiet"}
  tint={alert ? ALERT_COLOUR : null}
  bracketColor={alert ? ALERT_COLOUR : null}
  {beat}
  glint={alert}
  header={camera.title ? band : undefined}
  {onlanding}
  {onclose}
>
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

  /* Over the solid band, the band's own dark type rather than a grey that would not read on it. */
  .camera-window__clock--alert {
    color: inherit;
  }

  .camera-window__picture {
    --camera-anchor: center;

    display: flex;
  }

  .camera-window__picture > :global(*) {
    flex: 1 1 auto;
  }
</style>
