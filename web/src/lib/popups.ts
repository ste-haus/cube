import type { Popup } from "./types";

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const TWO_DIGITS = 2;
const WAITING_PREFIX = "+";

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

/**
 * How long a popup's sensor has been on, `+0:42`, `+12:05`, or `+1:02:03` once it runs past the
 * hour: how long somebody has been waiting, which is what the band shows in place of the time.
 */
export function waitingLabel(since: Date, now: Date): string {
  const seconds = Math.max(Math.floor((now.getTime() - since.getTime()) / MILLISECONDS_PER_SECOND), 0);
  const pad = (value: number) => String(value).padStart(TWO_DIGITS, "0");

  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const rest = pad(seconds % SECONDS_PER_MINUTE);

  return hours > 0
    ? `${WAITING_PREFIX}${hours}:${pad(minutes)}:${rest}`
    : `${WAITING_PREFIX}${minutes}:${rest}`;
}
