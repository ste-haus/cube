<script lang="ts">
  import { ha } from "../lib/state.svelte";
  import type { Transcript } from "../lib/types";

  let { transcript }: { transcript: Transcript } = $props();

  const text = $derived(ha.state(transcript.entity_id));
</script>

{#if text}
  <!-- Keyed on the text so each new line retypes itself rather than resuming mid-animation. -->
  {#key text}
    <p class="transcript">
      <span
        class="transcript__line"
        style:--type-steps={text.length}
        style:--type-duration="{transcript.seconds}s"
      >{text}</span>
    </p>
  {/key}
{/if}

<style>
  .transcript {
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
    text-align: center;
    text-transform: lowercase;
    font-family: ui-monospace, monospace;
  }

  /*
   * The line is laid out at its full width from the first frame and revealed by moving a clip
   * across it. Growing the box instead is what made this crawl: a centred line in a box that
   * is widening is re-centred on every frame, so the words slid across the footer rather than
   * arriving one at a time. Clipping leaves the layout alone, so only the reveal moves.
   */
  .transcript__line {
    display: inline-block;
    animation: type var(--type-duration) steps(var(--type-steps), end) forwards;
  }

  .transcript::before {
    content: "> ";
    animation: pulse 2s infinite;
  }

  .transcript::after {
    content: " <";
    animation: pulse 2s infinite;
  }

  @keyframes type {
    from {
      clip-path: inset(0 100% 0 0);
    }
    to {
      clip-path: inset(0 0 0 0);
    }
  }
</style>
