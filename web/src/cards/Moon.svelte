<script lang="ts">
  import { moonLitPath } from "../lib/sky";

  /*
   * The moon at its phase: a dark disk with its lit part laid over it. Both the horizon and the
   * daylight bar draw it from here, so the two always show the same moon. It fills whatever box
   * it is put in.
   */

  const RADIUS = 50;
  const BOX = RADIUS + RADIUS;

  let { phase, southern = false }: { phase: number; southern?: boolean } = $props();
</script>

<svg class="moon" viewBox="0 0 {BOX} {BOX}" aria-hidden="true">
  <circle class="moon__dark" cx={RADIUS} cy={RADIUS} r={RADIUS} />
  <path class="moon__lit" d={moonLitPath(phase, RADIUS, southern)} />
</svg>

<style>
  .moon {
    display: block;
    width: 100%;
    height: 100%;
  }

  .moon__dark {
    fill: var(--horizon-moon-dark-color);
  }

  .moon__lit {
    fill: var(--horizon-moon-lit-color);
  }
</style>
