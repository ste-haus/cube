<script lang="ts">
  import { onDestroy, type Snippet } from "svelte";
  import { cameraSnapshotUrl } from "../lib/api";
  import { faceVisibility, TAP_SLOP_PX } from "../lib/cube.svelte";
  import { go2rtcServer, playStream } from "../lib/go2rtc";
  import { containedBox, ratioOf, samePicture, type Box } from "../lib/picture";
  import type { Camera, StreamType } from "../lib/types";
  import CameraWindow from "./CameraWindow.svelte";
  import Reticle from "./Reticle.svelte";

  const MS_PER_SECOND = 1000;
  const GO2RTC: StreamType = "go2rtc";
  const CONTENT_TYPE_HEADER = "Content-Type";
  // A new still fades in over the one it replaces, which goes once it is covered
  const CROSSFADE_MS = 1000;
  const MAP_HOLD_MS = 600;
  const PRIMARY_BUTTON = 0;
  const RETICLE_RELEASE_MS = 260;
  const RETICLE_PADDING_PX = 7;
  const BOTH_SIDES = 2;

  interface Still {
    key: number;
    url: string;
    loaded: boolean;
    fading: boolean;
  }

  /**
   * `expanded` is the camera drawn inside its own window: no title, and nothing to tap. `banner`
   * is something the caller lays between the title and the picture.
   */
  let { camera, expanded = false, banner, onhold }: {
    camera: Camera;
    expanded?: boolean;
    banner?: Snippet;
    onhold?: (from: Box) => void;
  } = $props();

  const visibility = faceVisibility();
  const server = go2rtcServer();

  /*
   * Tapped, the tile opens a window with the same camera in it, big. While the window is open
   * the tile stops fetching, so the panel pulls one picture of the camera and not two, and
   * hides, so the window's brackets read as lifting it off the wall.
   */
  let opened = $state<{ from: Box; ratio: number } | null>(null);
  let away = $state(false);
  let image = $state<HTMLImageElement | null>(null);
  let pressedAt: { x: number; y: number } | null = null;
  let heldLong = false;
  let holdTimer: number | null = null;
  let cameraElement = $state<HTMLElement | null>(null);
  let reticle = $state<{ box: Box; holding: boolean; serial: number } | null>(null);
  let holdSerial = 0;

  function cancelHold(): void {
    if (holdTimer !== null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
    window.removeEventListener("pointermove", moveHold);
    window.removeEventListener("pointerup", cancelHold);
    window.removeEventListener("pointercancel", cancelHold);
    if (reticle?.holding) reticle.holding = false;
  }

  $effect(() => {
    if (reticle === null || reticle.holding) return;
    const timer = window.setTimeout(() => (reticle = null), RETICLE_RELEASE_MS);
    return () => window.clearTimeout(timer);
  });

  function moveHold(event: PointerEvent): void {
    if (pressedAt && Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > TAP_SLOP_PX) {
      cancelHold();
    }
  }

  $effect(() => {
    if (!visibility.showing || !onhold) cancelHold();
    return cancelHold;
  });

  const watching = $derived(visibility.showing && opened === null);

  /* Live when it says so and there is a go2rtc to reach; anything else is polled, so a camera
   * that cannot stream shows stills rather than nothing. */
  const live = $derived(camera.stream_type === GO2RTC && server.url !== null && camera.stream !== null);

  let requested = Date.now();
  let tick = $state(requested);
  let pending: number | null = null;
  let video = $state<HTMLVideoElement | null>(null);
  const frame = $derived(live ? video : image);

  /*
   * A polled camera's stills are fetched as files rather than pointed at by the frame, so one
   * that is the same file as the picture showing is dropped: the picture stays where it is, and
   * an animated one plays on rather than restarting at every poll. One that differs is stacked
   * over the picture showing, fades in once it has decoded, and takes the stills under it away
   * when it is fully in.
   */
  let stills = $state<Still[]>([]);
  let shown: Uint8Array | null = null;
  let nextKey = 0;

  function cancel(): void {
    if (pending !== null) {
      window.clearTimeout(pending);
      pending = null;
    }
  }

  function request(): void {
    requested = Date.now();
    tick = requested;
  }

  /*
   * The next still is asked for once this one has landed, and no sooner than the interval
   * after the last was asked for. One request in flight per camera, so a camera slower to
   * answer than its interval sets its own pace rather than stacking requests up behind it. A
   * still that fails comes round on the same clock rather than stopping the camera.
   */
  function arrived(): void {
    cancel();

    if (live || !watching) {
      return;
    }

    const wait = Math.max(0, requested + camera.polling_interval * MS_PER_SECOND - Date.now());
    pending = window.setTimeout(request, wait);
  }

  /*
   * A still is only worth fetching while somebody is looking at it, so a camera on a face
   * turned away asks for nothing: a panel's cameras cost what the face it is showing costs
   * rather than what every face it could show would. The face stays built, so the still it
   * last had is still on it when it comes back — the fetching stops, the picture does not.
   *
   * Coming back refreshes immediately rather than waiting out the interval, because the held
   * still is exactly as old as the panel has been turned away.
   */
  $effect(() => {
    if (live || !watching) {
      cancel();

      return;
    }

    request();

    return cancel;
  });

  /*
   * A live camera streams only while its face is being looked at, and the stream is torn down
   * the moment it is not — socket closed, decoder released — so a camera face turned away costs
   * the tablet and go2rtc nothing. Coming back asks for a fresh still to stand in as the poster
   * while the stream reconnects and waits for its first keyframe.
   */
  $effect(() => {
    if (!live || !watching || video === null || server.url === null || camera.stream === null) {
      return;
    }

    request();

    return playStream(video, server.url, camera.stream);
  });

  $effect(() => {
    if (live) {
      return;
    }

    const controller = new AbortController();
    fetchStill(cameraSnapshotUrl(camera.entity_id, tick), controller.signal);

    return () => controller.abort();
  });

  async function fetchStill(url: string, signal: AbortSignal): Promise<void> {
    let fetched: Uint8Array<ArrayBuffer>;
    let type: string;

    try {
      const response = await fetch(url, { signal });
      if (!response.ok) {
        arrived();

        return;
      }

      fetched = new Uint8Array(await response.arrayBuffer());
      type = response.headers.get(CONTENT_TYPE_HEADER) ?? "";
    } catch {
      // An abort means the next still has already been asked for
      if (!signal.aborted) {
        arrived();
      }

      return;
    }

    if (samePicture(shown, fetched)) {
      arrived();

      return;
    }

    shown = fetched;
    stills.push({ key: nextKey++, url: URL.createObjectURL(new Blob([fetched], { type })), loaded: false, fading: false });
  }

  function landed(still: Still, event: Event): void {
    image = event.currentTarget as HTMLImageElement;
    still.loaded = true;
    // The first still has nothing under it to fade over
    still.fading = stills.indexOf(still) > 0;
    arrived();
  }

  function failed(still: Still): void {
    URL.revokeObjectURL(still.url);
    stills.splice(stills.indexOf(still), 1);
    shown = null;
    arrived();
  }

  function covered(still: Still): void {
    still.fading = false;

    for (const under of stills.splice(0, stills.indexOf(still))) {
      URL.revokeObjectURL(under.url);
    }
  }

  onDestroy(() => {
    cancelHold();
    for (const still of stills) {
      URL.revokeObjectURL(still.url);
    }
  });

  function press(event: PointerEvent): void {
    cancelHold();
    heldLong = false;
    pressedAt = { x: event.clientX, y: event.clientY };
    if (!onhold || expanded || event.button !== PRIMARY_BUTTON || !event.isPrimary) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    if (frame === null || cameraElement === null) return;

    const natural = frame instanceof HTMLVideoElement
      ? { width: frame.videoWidth, height: frame.videoHeight }
      : { width: frame.naturalWidth, height: frame.naturalHeight };
    const box = containedBox(frame.getBoundingClientRect(), natural, getComputedStyle(frame).objectPosition);
    const within = cameraElement.getBoundingClientRect();
    const marked = {
      left: box.left - RETICLE_PADDING_PX,
      top: box.top - RETICLE_PADDING_PX,
      width: box.width + BOTH_SIDES * RETICLE_PADDING_PX,
      height: box.height + BOTH_SIDES * RETICLE_PADDING_PX,
    };
    reticle = {
      serial: ++holdSerial,
      holding: true,
      box: {
        ...marked,
        left: marked.left - within.left,
        top: marked.top - within.top,
      },
    };

    holdTimer = window.setTimeout(() => {
      cancelHold();
      if (!onhold || frame === null || !visibility.showing) return;
      heldLong = true;
      reticle = null;
      onhold(marked);
    }, MAP_HOLD_MS);
    window.addEventListener("pointermove", moveHold);
    window.addEventListener("pointerup", cancelHold);
    window.addEventListener("pointercancel", cancelHold);
  }

  function open(event: MouseEvent): void {
    cancelHold();
    const moved = pressedAt ? Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) : 0;
    pressedAt = null;

    if (heldLong || expanded || opened !== null || frame === null || moved > TAP_SLOP_PX) {
      return;
    }

    const natural =
      frame instanceof HTMLVideoElement
        ? { width: frame.videoWidth, height: frame.videoHeight }
        : { width: frame.naturalWidth, height: frame.naturalHeight };

    opened = {
      from: containedBox(frame.getBoundingClientRect(), natural, getComputedStyle(frame).objectPosition),
      ratio: ratioOf(natural),
    };
    away = true;
  }

  function closed(): void {
    opened = null;
    away = false;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<section
  bind:this={cameraElement}
  class="camera"
  class:camera--expandable={!expanded}
  class:camera--away={away}
  class:camera--holdable={!!onhold}
  style:--camera-crossfade="{CROSSFADE_MS}ms"
  onpointerdown={press}
  onclick={open}
  oncontextmenu={(event) => { if (onhold) event.preventDefault(); }}
>
  {#if camera.title && !expanded}
    <h2 class="panel-title panel-title--right">{camera.title}</h2>
  {/if}
  {@render banner?.()}
  {#if live}
    <video
      class="camera__frame"
      bind:this={video}
      poster={cameraSnapshotUrl(camera.entity_id, tick)}
      aria-label={camera.title ?? "Camera"}
      muted
      autoplay
      playsinline
    ></video>
  {:else}
    <div class="camera__stills">
      {#each stills as still (still.key)}
        <img
          class="camera__frame"
          class:camera__frame--waiting={!still.loaded}
          class:camera__frame--fading={still.fading}
          src={still.url}
          alt={camera.title ?? "Camera"}
          onload={(event) => landed(still, event)}
          onerror={() => failed(still)}
          onanimationend={() => covered(still)}
        />
      {/each}
    </div>
  {/if}
  {#if reticle}
    {#key reticle.serial}
      <div
        class="camera__hold-reticle"
        style:left="{reticle.box.left}px"
        style:top="{reticle.box.top}px"
        style:width="{reticle.box.width}px"
        style:height="{reticle.box.height}px"
      >
        <Reticle holding={reticle.holding} releasing={!reticle.holding} holdMs={MAP_HOLD_MS} releaseMs={RETICLE_RELEASE_MS} />
      </div>
    {/key}
  {/if}
</section>

{#if opened}
  <CameraWindow {camera} from={opened.from} ratio={opened.ratio} onlanding={() => (away = false)} onclose={closed} />
{/if}

<style>
  .camera {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .camera__hold-reticle {
    --reticle-bracket-size: 1.6rem;
    --reticle-bracket-weight: 3px;

    position: absolute;
    pointer-events: none;
  }

  .camera--holdable {
    overflow: visible;
  }

  /* When the column is tight the frame scales down whole rather than losing its bottom edge,
   * which is what clipping a map does to the part you were looking at. Where the slack goes is
   * the caller's business: against the top in a column of cards, centred on a face that is
   * nothing but frames. */
  .camera--expandable .camera__frame {
    cursor: zoom-in;
  }

  .camera--away .camera__frame {
    visibility: hidden;
  }

  /* The stills share one cell, so the one fading in lies exactly over the one it replaces, and
   * the cell takes the frame's place in the column. */
  .camera__stills {
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .camera__stills > .camera__frame {
    grid-area: 1 / 1;
  }

  .camera__frame--waiting {
    opacity: 0;
  }

  .camera__frame--fading {
    animation: camera-crossfade var(--camera-crossfade) ease-in-out;
  }

  @keyframes camera-crossfade {
    from {
      opacity: 0;
    }
  }

  .camera__frame {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    margin: 0 auto;
    object-fit: contain;
    object-position: var(--camera-anchor, top);
    filter: brightness(80%);
  }
</style>
