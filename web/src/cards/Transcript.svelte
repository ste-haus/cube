<script lang="ts">
  import { ha } from "../lib/state.svelte";
  import type { Transcript } from "../lib/types";

  let { transcript }: { transcript: Transcript } = $props();

  const text = $derived(ha.state(transcript.entity_id));
</script>

{#if text}
  <!-- Keyed on the text so each new line retypes itself rather than resuming mid-animation. -->
  {#key text}
    <p
      class="transcript"
      style:--type-steps={transcript.characters}
      style:--type-duration="{transcript.seconds}s"
    >
      {text}
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
      width: 0;
    }
    to {
      width: 100%;
    }
  }
</style>
