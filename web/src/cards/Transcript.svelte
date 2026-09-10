<script lang="ts">
  import { faceVisibility } from "../lib/cube.svelte";
  import { revealSchedule, revealedBy } from "../lib/format";
  import { ha } from "../lib/state.svelte";
  import type { Transcript } from "../lib/types";

  const MS_PER_SECOND = 1000;

  let { transcript }: { transcript: Transcript } = $props();

  const visibility = faceVisibility();

  const text = $derived(ha.state(transcript.entity_id) ?? "");
  /* Length sets the duration rather than the panel setting it, so a long announcement and a
   * short one are read at the same pace instead of taking the same time. */
  const schedule = $derived(revealSchedule(text));

  let revealed = $state(0);

  const shown = $derived(text.slice(0, revealed));

  /*
   * The reveal is counted out here rather than animated in CSS, because a line long enough to
   * wrap cannot be revealed by growing a box — the second line begins at the left again, and a
   * width cannot say that. Each character is shown as its beat comes due, so the pacing is the
   * same one the schedule describes.
   *
   * A face nobody is looking at does not animate: the line is simply there, whole, when the
   * cube comes back to it.
   */
  $effect(() => {
    if (!text) {
      return;
    }

    if (!visibility.showing) {
      revealed = text.length;

      return;
    }

    const rate = transcript.syllables_per_second;
    const started = performance.now();

    let frame = 0;

    const step = () => {
      const beats = ((performance.now() - started) / MS_PER_SECOND) * rate;
      revealed = revealedBy(schedule, beats);

      if (revealed < schedule.length) {
        frame = requestAnimationFrame(step);
      }
    };

    revealed = 0;
    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  });
</script>

{#if text}
  <p class="transcript">
    <span class="transcript__frame">
      <span class="transcript__marker">&raquo;</span>
      <span class="transcript__line">{shown}</span>
      <span class="transcript__marker">&laquo;</span>
    </span>
  </p>
{/if}

<style>
  /*
   * The line and the two marks that bracket it are centred as a group, and the line is only as
   * wide as what has been revealed — so the marks close in around a part-read announcement
   * rather than standing off at the width it will eventually reach. They sit on the middle of
   * the line however many rows it has grown to, rather than on its first.
   */
  /*
   * Laid over the panel rather than laid out in it. An announcement is a moment: it is there
   * for a few seconds and gone, and anything that reserves room for one leaves the panel
   * arranged differently depending on whether somebody has spoken lately. It occupies nothing,
   * whatever it says and however many rows it grows to.
   */
  .transcript {
    position: absolute;
    z-index: 1;
    right: 0;
    bottom: calc(var(--panel-padding) + var(--transcript-lift));
    left: 0;
    display: flex;
    justify-content: center;
    margin: 0;
    text-transform: lowercase;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--transcript-size);
    font-weight: var(--weight-light);
    line-height: var(--transcript-line-height);
  }

  /*
   * What the announcement is drawn on. It floats over whatever the panel was already showing,
   * so it carries enough of the background with it to be read against a floorplan rather than
   * competing with one. Sized to its contents, so the backing grows with the reveal instead of
   * laying a band across the whole panel.
   */
  .transcript__frame {
    display: flex;
    align-items: center;
    /* The marks stand a character off the words rather than the words carrying spaces of their
     * own, so the gap holds while the line between them grows. */
    gap: 1ch;
    padding: var(--transcript-padding-block) var(--transcript-padding-inline);
    border-radius: var(--transcript-radius);
    /* Flat first, for anything that cannot mix a colour; the mix below carries the panel's own
     * background through so a themed panel is backed in its own colour rather than in black. */
    background-color: rgba(0, 0, 0, 0.72);
    background-color: color-mix(in srgb, var(--color-background) 82%, transparent);
  }

  .transcript__marker {
    flex: none;
    animation: pulse 2s infinite;
  }

  /*
   * Grows with what has been read until it reaches the width it is allowed, and wraps from
   * there. Anything past the last row it is allowed ends in an ellipsis: an announcement long
   * enough to need a fourth line is long enough that the wall is the wrong place to read it.
   *
   * `-webkit-box` is what carries `line-clamp`, and is the spelling every engine these panels
   * run actually implements.
   */
  .transcript__line {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--transcript-lines);
    line-clamp: var(--transcript-lines);
    overflow: hidden;
    max-width: var(--transcript-max-width);
    text-align: center;
  }
</style>
