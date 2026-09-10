<script lang="ts">
  import { faceVisibility } from "../lib/cube.svelte";
  import { strftime } from "../lib/format";
  import type { Clock } from "../lib/types";

  const TICK_MS = 1000;

  let { clock }: { clock: Clock } = $props();

  const visibility = faceVisibility();

  let now = $state(new Date());

  /* A clock nobody is looking at does not need to be right, and a second's tick is the most
   * frequent thing the panel does. Reading the time again on the way back is what stops the
   * face coming up showing the minute it was turned away on. */
  $effect(() => {
    if (!visibility.showing) {
      return;
    }

    now = new Date();

    const timer = window.setInterval(() => {
      now = new Date();
    }, TICK_MS);

    return () => window.clearInterval(timer);
  });

  const date = $derived(strftime(now, clock.date_format));
  const time = $derived(strftime(now, clock.time_format));
  const display = $derived(clock.easter_egg_times.includes(time) ? clock.easter_egg_text : time);
</script>

<div class="clock">
  <div class="clock__date">{date}</div>
  <div class="clock__time">{display}</div>
</div>

<style>
  .clock__date {
    font-size: var(--clock-date-size);
    font-weight: var(--weight-thin);
    filter: brightness(60%);
  }

  .clock__time {
    font-size: var(--clock-time-size);
    font-weight: var(--weight-thin);
    line-height: 1;
  }
</style>
