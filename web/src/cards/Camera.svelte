<script lang="ts">
  import { cameraStreamUrl } from "../lib/api";
  import type { Camera } from "../lib/types";

  let { camera }: { camera: Camera } = $props();
</script>

<section class="camera">
  {#if camera.title}
    <h2 class="panel-title panel-title--right">{camera.title}</h2>
  {/if}
  <img class="camera__frame" src={cameraStreamUrl(camera.entity_id)} alt={camera.title ?? "Camera"} />
</section>

<style>
  .camera__frame {
    display: block;
    width: 90%;
    margin: 0 auto;
    filter: brightness(80%);
  }
</style>
