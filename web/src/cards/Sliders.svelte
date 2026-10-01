<script lang="ts">
  import SliderBar from "./SliderBar.svelte";
  import type { Slider } from "../lib/types";

  /* The guest face's bars, one above another. */

  let { sliders }: { sliders: Slider[] } = $props();
</script>

<div class="sliders">
  {#each sliders as slider (slider.entity_id)}
    <SliderBar {slider} />
  {/each}
</div>

<style>
  .sliders {
    display: flex;
    flex-direction: column;
    gap: var(--slider-gap);
  }

</style>
