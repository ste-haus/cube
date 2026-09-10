<script lang="ts">
  import Camera from "../cards/Camera.svelte";
  import type { CameraGridOptions } from "../lib/types";

  /*
   * A wall of cameras, laid out exactly as the config writes them: one row per inner list,
   * read left to right. Rows share the height between them and tiles share their row's width,
   * so a ragged last row spreads out rather than leaving a hole.
   */

  let { options }: { options: CameraGridOptions } = $props();
</script>

<div class="camera-grid">
  {#each options.rows as row, index (index)}
    <div class="camera-grid__row">
      {#each row as camera, position (position)}
        <Camera {camera} />
      {/each}
    </div>
  {/each}
</div>
