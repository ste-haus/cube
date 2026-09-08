<script lang="ts">
  import { cameraSnapshotUrl } from "../lib/api";
  import type { Camera } from "../lib/types";

  const MS_PER_SECOND = 1000;

  let { camera }: { camera: Camera } = $props();

  let tick = $state(Date.now());

  $effect(() => {
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
   * which is what clipping a map does to the part you were looking at. */
  .camera__frame {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    margin: 0 auto;
    object-fit: contain;
    object-position: top;
    filter: brightness(80%);
  }
</style>
