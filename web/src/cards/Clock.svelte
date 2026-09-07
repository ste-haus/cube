<script lang="ts">
  import { strftime } from "../lib/format";
  import type { Clock } from "../lib/types";

  const TICK_MS = 1000;

  let { clock }: { clock: Clock } = $props();

  let now = $state(new Date());

  $effect(() => {
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
