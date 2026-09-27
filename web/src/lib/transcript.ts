/**
 * When a transcript is read out.
 *
 * The words are written before the speaker says them — the text is set while the speech is
 * still being rendered — so a transcript waits for its speaker to start rather than for its
 * own text to arrive.
 */

export const PLAYING = "playing";

/** What a speaker is doing, as far as a transcript cares. */
export interface Playback {
  state: string | null;
  content: string | null;
}

/**
 * Where a transcript stands.
 *
 * - `pending`: written, but the speaker has not started saying it.
 * - `reading`: being typed out alongside the speech.
 * - `said`: shown whole, with nothing left to animate.
 */
export type Phase = "pending" | "reading" | "said";

export const PENDING: Phase = "pending";
export const READING: Phase = "reading";
export const SAID: Phase = "said";

/**
 * Whether the speaker is saying an announcement rather than playing anything else.
 *
 * Without a marker there is no telling the two apart, and anything playing counts.
 */
export function announcing(playback: Playback, marker: string | null): boolean {
  if (playback.state !== PLAYING) {
    return false;
  }

  return !marker || (!!playback.content && playback.content.includes(marker));
}

/**
 * Whether the speaker has started an announcement between two readings of it.
 *
 * Starting to announce from anything else counts, and so does the content changing under a
 * speaker that stays announcing. Music stopping for an announcement does not have to go
 * through idle — the content is swapped under a player that stays `playing` — so it is the
 * announcement arriving that is looked for, not the speaker waking.
 */
export function startedAnnouncing(before: Playback, after: Playback, marker: string | null): boolean {
  if (!announcing(after, marker)) {
    return false;
  }

  return !announcing(before, marker) || before.content !== after.content;
}

/**
 * Where a newly written transcript starts.
 *
 * Without a speaker to wait for it is read at once, as it is when the speaker is already
 * announcing — the text can land after the speech has begun, and by then the start has passed.
 * A speaker playing anything else is still to say it.
 */
export function phaseOnArrival(speaker: string | null, playback: Playback, marker: string | null): Phase {
  if (!speaker || announcing(playback, marker)) {
    return READING;
  }

  return PENDING;
}
