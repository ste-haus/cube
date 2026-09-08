<script lang="ts">
  /** Shown only if rendering threw. Retries on a timer, since there is nobody to press it. */

  const RETRY_MS = 15000;

  let { reset }: { reset: () => void } = $props();

  $effect(() => {
    const timer = window.setInterval(reset, RETRY_MS);

    return () => window.clearInterval(timer);
  });
</script>

<div class="blank-face">recovering</div>
