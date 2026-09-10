<script lang="ts">
  import { cameraSnapshotUrl } from "../lib/api";
  import { faceVisibility } from "../lib/cube.svelte";
  import type { Camera } from "../lib/types";

  const MS_PER_SECOND = 1000;

  let { camera }: { camera: Camera } = $props();

  const visibility = faceVisibility();

  let tick = $state(Date.now());

  /*
   * A frame is only worth fetching while somebody is looking at it, so a camera on a face
   * turned away asks for nothing: a panel's cameras cost what the face it is showing costs
   * rather than what every face it could show would. The face stays built, so the frame it
   * last had is still on it when it comes back — the fetching stops, the picture does not.
   *
   * Coming back refreshes immediately rather than waiting out the interval, because the held
   * frame is exactly as old as the panel has been turned away. The browser keeps showing it
   * until the new one has decoded, so the swap is a frame changing rather than a gap.
   */
  $effect(() => {
    if (!visibility.showing) {
      return;
    }

    tick = Date.now();

    const timer = window.setInterval(
      () => {
        tick = Date.now();
      },
      camera.refresh_seconds * MS_PER_SECOND,
    );

    return () => window.clearInterval(timer);
  });
</script>

<section class="camera">
  {#if camera.title}
    <h2 class="panel-title panel-title--right">{camera.title}</h2>
  {/if}
  <img class="camera__frame" src={cameraSnapshotUrl(camera.entity_id, tick)} alt={camera.title ?? "Camera"} />
</section>

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
