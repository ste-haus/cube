<script lang="ts">
  import Camera from "../cards/Camera.svelte";
  import type { CameraHeroOptions } from "../lib/types";

  /*
   * One camera worth actually watching, with the rest kept in view beside it. The column is a
   * fixed share of the width however many cameras are in it, so the hero frame is the same
   * size on every panel that uses this face.
   */

  let { options }: { options: CameraHeroOptions } = $props();

  const side = $derived(options.side ?? []);
</script>

<div class="camera-hero" class:camera-hero--alone={side.length === 0}>
  <Camera camera={options.hero} />

  {#if side.length > 0}
    <div class="camera-hero__side">
      {#each side as camera, position (position)}
        <Camera {camera} />
      {/each}
    </div>
  {/if}
</div>
