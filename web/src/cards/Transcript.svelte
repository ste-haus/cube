<script lang="ts">
  import { revealBeats, revealEasing } from "../lib/format";
  import { ha } from "../lib/state.svelte";
  import type { Transcript } from "../lib/types";

  let { transcript }: { transcript: Transcript } = $props();

  const text = $derived(ha.state(transcript.entity_id));

  /* Length sets the duration rather than the panel setting it, so a long announcement and a
   * short one are read at the same pace instead of taking the same time. */
  const seconds = $derived(text ? revealBeats(text) / transcript.characters_per_second : 0);
</script>

{#if text}
  <!-- Keyed on the text so each new line retypes itself rather than resuming mid-animation. -->
  {#key text}
    <p class="transcript">
      <span class="transcript__marker">&raquo;</span>
      <span
        class="transcript__line"
        style:--type-characters={text.length}
        style:--type-duration="{seconds}s"
        style:--type-easing={revealEasing(text)}
      >{text}</span>
      <span class="transcript__marker">&laquo;</span>
    </p>
  {/key}
{/if}

<style>
  /*
   * The line and the two marks that bracket it are centred as a group, and the line is only as
   * wide as what has been revealed — so the marks close in around a part-read announcement
   * rather than standing off at the width it will eventually reach.
   *
   * The text inside the line is anchored left and does not re-centre as the line grows. That
   * is the whole difference between this and the version that crawled: there, the text was
   * centred inside a widening box, so every frame slid it sideways and what you could see was
   * the middle of the sentence rather than the start of it.
   */
  .transcript {
    display: flex;
    align-items: center;
    justify-content: center;
    /* The marks stand a character off the words rather than the words carrying spaces of their
     * own, so the gap holds while the line between them grows. */
    gap: 1ch;
    margin: 0;
    text-transform: lowercase;
    font-family: ui-monospace, monospace;
    font-size: var(--transcript-size);
  }

  .transcript__marker {
    flex: none;
    animation: pulse 2s infinite;
  }

  .transcript__line {
    flex: none;
    overflow: hidden;
    white-space: nowrap;
    text-align: left;
    animation: type var(--type-duration) forwards;
    /* Even steps first, so a browser that cannot parse the generated timing still types the
     * line out. The one below replaces it where `linear()` is understood, and is the same
     * staircase with a longer tread wherever the voice would have paused. */
    animation-timing-function: steps(var(--type-characters), end);
    animation-timing-function: var(--type-easing);
  }

  /* The face is monospace, so a character is exactly one `ch` and the line can be sized in
   * them — which is what lets it stop at the text's own width rather than the footer's. */
  @keyframes type {
    from {
      width: 0;
    }
    to {
      width: calc(var(--type-characters) * 1ch);
    }
  }
</style>
