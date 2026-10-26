/** The states a bin is drawn by; the floorplan stylesheet has a rule for each. */
export const BIN_STATES = new Set(["home", "away", "take_out", "picked_up"]);

/**
 * The state a bin is drawn as, or null when the stylesheet has no rule for it.
 *
 * A level's `bin_states` maps an installation's own states onto these first, so a house whose
 * sensors say something else can be drawn without renaming anything in Home Assistant.
 */
export function binState(state: string | null, binStates: Record<string, string>): string | null {
  if (state === null) {
    return null;
  }

  const drawn = binStates[state] ?? state;

  return BIN_STATES.has(drawn) ? drawn : null;
}
