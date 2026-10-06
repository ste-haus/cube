import type { Popup } from "./types";

/**
 * Which popup should be up: the first, in the order the config lists them, whose sensor is on
 * and that has not been put away since it came on. One at a time, since each covers the panel.
 */
export function popupToShow(
  popups: Popup[],
  isOn: (entityId: string) => boolean,
  dismissed: ReadonlySet<string>,
): Popup | null {
  return popups.find((popup) => isOn(popup.entity_id) && !dismissed.has(popup.entity_id)) ?? null;
}

/**
 * The put-away popups whose sensors are still on. One whose sensor has gone off is forgotten,
 * so it comes up again the next time the sensor comes on.
 */
export function stillDismissed(dismissed: ReadonlySet<string>, isOn: (entityId: string) => boolean): Set<string> {
  return new Set([...dismissed].filter(isOn));
}

/**
 * The put-away popups once one's window has closed.
 *
 * Only a tap on the glass puts one away. A window folded away because its sensor went off, or
 * because a popup listed before it came on, was not put away by anybody, even if its sensor is
 * on again by the time it lands: then it is wanted, and comes straight back up.
 */
export function dismissedAfterClose(
  dismissed: ReadonlySet<string>,
  closed: Popup,
  foldedAway: boolean,
  isOn: (entityId: string) => boolean,
): ReadonlySet<string> {
  if (foldedAway || !isOn(closed.entity_id)) {
    return dismissed;
  }

  return new Set([...dismissed, closed.entity_id]);
}
