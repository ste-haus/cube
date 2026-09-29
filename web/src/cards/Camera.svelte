<script lang="ts">
  import { cameraSnapshotUrl } from "../lib/api";
  import { faceVisibility } from "../lib/cube.svelte";
  import { go2rtcServer, playStream } from "../lib/go2rtc";
  import { containedBox, ratioOf, type Box } from "../lib/picture";
  import type { Camera, StreamType } from "../lib/types";
  import CameraWindow from "./CameraWindow.svelte";

  const MS_PER_SECOND = 1000;
  const GO2RTC: StreamType = "go2rtc";
  // Further than this between press and release is a swipe across the tile, not a tap on it.
  const TAP_SLOP_PX = 10;

  /** `expanded` is the camera drawn inside its own window: no title, and nothing to tap. */
  let { camera, expanded = false }: { camera: Camera; expanded?: boolean } = $props();

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

  const watching = $derived(visibility.showing && opened === null);

  /* Live when it says so and there is a go2rtc to reach; anything else is polled, so a camera
   * that cannot stream shows stills rather than nothing. */
  const live = $derived(camera.stream_type === GO2RTC && server.url !== null && camera.stream !== null);

  let requested = Date.now();
  let tick = $state(requested);
  let pending: number | null = null;
  let video = $state<HTMLVideoElement | null>(null);
  const frame = $derived(live ? video : image);

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

  function press(event: PointerEvent): void {
    pressedAt = { x: event.clientX, y: event.clientY };
  }

  function open(event: MouseEvent): void {
    const moved = pressedAt ? Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) : 0;
    pressedAt = null;

    if (expanded || opened !== null || frame === null || moved > TAP_SLOP_PX) {
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
<section class="camera" class:camera--expandable={!expanded} class:camera--away={away} onpointerdown={press} onclick={open}>
  {#if camera.title && !expanded}
    <h2 class="panel-title panel-title--right">{camera.title}</h2>
  {/if}
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
    <img
      class="camera__frame"
      bind:this={image}
      src={cameraSnapshotUrl(camera.entity_id, tick)}
      alt={camera.title ?? "Camera"}
      onload={arrived}
      onerror={arrived}
    />
  {/if}
</section>

{#if opened}
  <CameraWindow {camera} from={opened.from} ratio={opened.ratio} onlanding={() => (away = false)} onclose={closed} />
{/if}

<style>
  .camera {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
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
