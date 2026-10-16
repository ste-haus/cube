<script lang="ts">
  import { SlidingLevel } from "../lib/level.svelte";

  /*
   * A figure that slides to its new value rather than jumping there, as a level does, counting
   * through the values between at the figure's own precision. The first value it is given it shows
   * at once, so nothing counts up from nought as a face comes into view.
   */

  let {
    value,
    format,
    fallback,
  }: { value: number | null; format: (value: number) => string; fallback: string } = $props();

  const level = new SlidingLevel();

  $effect(() => {
    if (value !== null) {
      level.follow(value);
    }
  });
</script>

{value === null ? fallback : format(level.current)}
