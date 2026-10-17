import type { CriticalSwitch } from "./types";

/*
 * A switch held behind a card, for something that should not go off by accident.
 *
 * A tap anywhere on it flips it, and what that does depends on what Home Assistant says it is now,
 * not on what it was when its window opened: while it is on, a tap asks first; while it is off, a
 * tap turns it on at once; while it is neither, unknown or unavailable, there is nothing a toggle
 * could promise, so a tap does nothing.
 */

export const SWITCH_ON = "on";
export const SWITCH_OFF = "off";

const LABEL_PLACEHOLDER = "{label}";

export type SwitchFlip = "ask" | "send" | "nothing";

/** What a tap on the switch does while Home Assistant says it is `state`. */
export function flip(state: string | null): SwitchFlip {
  if (state === SWITCH_ON) {
    return "ask";
  }

  return state === SWITCH_OFF ? "send" : "nothing";
}

/** Whether a question asked while the switch was on still stands: only while it still is. */
export function stillAsking(state: string | null): boolean {
  return state === SWITCH_ON;
}

/** Whether the card says the switch is off, by breathing in the secondary colour. */
export function advising(critical: CriticalSwitch | null, state: string | null): boolean {
  return critical !== null && critical.advise_when_off && state === SWITCH_OFF;
}

/** The colour the card takes while the switch is off, or null when it takes none. */
export function offColour(critical: CriticalSwitch, advisory: string): string | null {
  return critical.advise_when_off ? advisory : null;
}

/** What turning the switch off asks: its own words, or the labels' with its name in them. */
export function confirmation(critical: CriticalSwitch, template: string): string {
  return critical.confirm ?? template.replaceAll(LABEL_PLACEHOLDER, critical.label);
}
