<script lang="ts">
  import { faceVisibility } from "../lib/cube.svelte";
  import type { Frame } from "../lib/types";

  /*
   * Somebody else's page, edge to edge: no border, no title, no scrollbars, nothing of the
   * panel's drawn around it.
   *
   * It is loaded only while its face is being looked at. A page like a wind map animates for as
   * long as it is open, and a frame on a face turned away would go on doing that for nobody.
   * Unloading it is the frame's version of a camera closing its stream; the price is a reload on
   * the way back.
   *
   * It takes no touches unless it says so, so a swipe across it turns the cube rather than
   * panning a map nobody meant to move.
   */

  let { frame }: { frame: Frame } = $props();

  const visibility = faceVisibility();
</script>

<div class="frame">
  {#if visibility.showing}
    <iframe
      class="frame__page"
      class:frame__page--interactive={frame.interactive}
      src={frame.url}
      title={frame.title ?? frame.url}
      scrolling="no"
    ></iframe>
  {/if}
</div>

<style>
  .frame {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .frame__page {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    pointer-events: none;
  }

  .frame__page--interactive {
    pointer-events: auto;
  }
</style>
