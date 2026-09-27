<script lang="ts">
  import { faceVisibility } from "../lib/cube.svelte";
  import { revealSchedule, revealedBy } from "../lib/format";
  import { ha } from "../lib/state.svelte";
  import {
    PENDING,
    phaseOnArrival,
    READING,
    SAID,
    startedAnnouncing,
    type Phase,
    type Playback,
  } from "../lib/transcript";
  import type { Transcript } from "../lib/types";

  const MS_PER_SECOND = 1000;
  const CONTENT_ATTRIBUTE = "media_content_id";
  // Long enough for the slowest render to reach the speaker; past it, the speaker is not coming.
  const PENDING_TIMEOUT_MS = 30000;

  let {
    transcript,
    mediaPlayer,
  }: { transcript: Transcript; mediaPlayer: string | null } = $props();

  const visibility = faceVisibility();

  const text = $derived(ha.state(transcript.entity_id) ?? "");
  /* Length sets the duration rather than the panel setting it, so a long announcement and a
   * short one are read at the same pace instead of taking the same time. */
  const schedule = $derived(revealSchedule(text));

  const playback: Playback = $derived({
    state: ha.state(mediaPlayer),
    content: ha.attribute<string>(mediaPlayer, CONTENT_ATTRIBUTE),
  });

  // Whatever the panel finds already written was said before it was looking.
  let phase = $state<Phase>(SAID);
  let revealed = $state(0);

  const shown = $derived(phase === SAID ? text : phase === READING ? text.slice(0, revealed) : "");

  /*
   * The last text and playback seen, held outside the reactive graph: what matters is how each
   * reading differs from the one before, and only the effect below compares them. The text is
   * not taken until the entity has arrived at all, so the snapshot a panel loads with is not
   * mistaken for a new announcement.
   */
  let lastText: string | null = null;
  let lastPlayback: Playback | null = null;

  $effect(() => {
    const current = text;
    const now = playback;
    const before = lastPlayback;
    lastPlayback = now;

    if (!(transcript.entity_id in ha.entities)) {
      return;
    }

    if (lastText === null) {
      lastText = current;

      return;
    }

    if (current !== lastText) {
      lastText = current;
      phase = phaseOnArrival(mediaPlayer, now, transcript.content_marker);

      return;
    }

    if (phase === PENDING && before && startedAnnouncing(before, now, transcript.content_marker)) {
      phase = READING;
    }
  });

  /* A speaker that never starts — the speech failed, or the speaker is off — still leaves the
   * words on the wall, whole, rather than holding them for whatever it plays next. */
  $effect(() => {
    if (phase !== PENDING) {
      return;
    }

    const timeout = setTimeout(() => (phase = SAID), PENDING_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  });

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
    if (phase !== READING) {
      return;
    }

    // Read here rather than only in the frame callback, so a line replaced mid-reveal starts over.
    const beatsOf = schedule;

    if (!visibility.showing) {
      phase = SAID;

      return;
    }

    const rate = transcript.syllables_per_second;
    const started = performance.now();

    let frame = 0;

    const step = () => {
      const beats = ((performance.now() - started) / MS_PER_SECOND) * rate;
      revealed = revealedBy(beatsOf, beats);

      if (revealed < beatsOf.length) {
        frame = requestAnimationFrame(step);
      } else {
        phase = SAID;
      }
    };

    revealed = 0;
    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  });
</script>

{#if text && phase !== PENDING}
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
    /* Over the announcement overlay as well as the panel: the words are what it is for. */
    z-index: 4;
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
