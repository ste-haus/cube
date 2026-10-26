import type { BinStates } from "./types";

/** What Home Assistant reports for an entity it cannot read. */
const UNREADABLE_STATES = new Set(["unknown", "unavailable"]);

// A state becomes a class, so anything that would not survive as one is swapped out: a space,
// for one, would split it into two classes.
const UNSAFE_CLASS_CHARACTERS = /[^A-Za-z0-9_-]/g;
const SAFE_CLASS_CHARACTER = "_";

/**
 * The class a bin is drawn with, or null when its state cannot be read.
 *
 * A level's `bin_states` renames an installation's own states onto the four the bundled
 * stylesheet draws. Any other state is passed through as itself, so a house with states of its
 * own can style them in `resources/floorplan.css`.
 */
export function binState(state: string | null, binStates: BinStates): string | null {
  if (!state || UNREADABLE_STATES.has(state)) {
    return null;
  }

  const renamed = Object.entries(binStates).find(([, own]) => own === state)?.[0];

  return (renamed ?? state).replace(UNSAFE_CLASS_CHARACTERS, SAFE_CLASS_CHARACTER);
}
