import { strftime } from "./format";

/**
 * Master warning and master caution, read from the masters' own state.
 *
 * Home Assistant decides what is lit and what has been cleared; the panel only reads it. A
 * master is `on` while its tier has an alert nobody has cleared, and its `alerts` attribute
 * lists every alert still active, cleared or not, newest first.
 */

export interface Alert {
  entity_id: string;
  message: string;
  triggered: string | null;
  cleared: boolean;
}

/** Lit wants attention; dark still has alerts to look at; hidden has nothing at all. */
export type MasterLook = "lit" | "dark" | "hidden";

const ALERT_TIME_FORMAT = "%b %-d, %H:%M";
const TIME_ZONE_PART = "timeZoneName";
const TIME_ZONE_LOCALE = "en-US";
// What the locale names a zone it has no abbreviation for: `GMT+2`, `GMT-3:30`.
const UNNAMED_ZONE = /^GMT[+-]/;
const MINUTES_PER_HOUR = 60;
const TWO_DIGITS = 2;

/** The alerts a master lists, leaving out anything too malformed to show. */
export function readAlerts(value: unknown): Alert[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .filter((item) => typeof item.entity_id === "string" && typeof item.message === "string")
    .map((item) => ({
      entity_id: item.entity_id as string,
      message: item.message as string,
      triggered: typeof item.triggered === "string" && item.triggered ? item.triggered : null,
      cleared: item.cleared === true,
    }));
}

export function masterLook(lit: boolean, alerts: Alert[]): MasterLook {
  if (lit) {
    return "lit";
  }

  return alerts.length > 0 ? "dark" : "hidden";
}

/** A UTC offset the way a clock reads it, `+02:00`, from minutes east of Greenwich. */
export function offsetLabel(minutesEast: number): string {
  const sign = minutesEast < 0 ? "-" : "+";
  const minutes = Math.abs(minutesEast);
  const pad = (value: number) => String(value).padStart(TWO_DIGITS, "0");

  return `${sign}${pad(Math.floor(minutes / MINUTES_PER_HOUR))}:${pad(minutes % MINUTES_PER_HOUR)}`;
}

/** The zone's abbreviation where it has a familiar one, and its offset where it does not. */
export function zoneLabel(date: Date): string {
  const parts = new Intl.DateTimeFormat(TIME_ZONE_LOCALE, { timeZoneName: "short" }).formatToParts(date);
  const name = parts.find((part) => part.type === TIME_ZONE_PART)?.value ?? "";

  // getTimezoneOffset counts minutes west, the opposite way to how an offset is written.
  return !name || UNNAMED_ZONE.test(name) ? offsetLabel(-date.getTimezoneOffset()) : name;
}

/** When an alert triggered, in the panel's own time and zone, or nothing if it does not say. */
export function alertTime(triggered: string | null): string {
  if (!triggered) {
    return "";
  }

  const date = new Date(triggered);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${strftime(date, ALERT_TIME_FORMAT)} ${zoneLabel(date)}`;
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const MILLISECONDS_PER_SECOND = 1000;
const ELAPSED_PREFIX = "T+";

/** When the tier's oldest alert still on the list began, or null if none of them says. */
export function tierSince(alerts: Alert[]): Date | null {
  const times = alerts
    .map((alert) => (alert.triggered ? new Date(alert.triggered).getTime() : Number.NaN))
    .filter((time) => Number.isFinite(time));

  return times.length > 0 ? new Date(Math.min(...times)) : null;
}

/** Mission elapsed time, `T+01:02:03`, hours running on past a day rather than rolling over. */
export function elapsedLabel(since: Date, now: Date): string {
  const seconds = Math.max(Math.floor((now.getTime() - since.getTime()) / MILLISECONDS_PER_SECOND), 0);
  const pad = (value: number) => String(value).padStart(TWO_DIGITS, "0");

  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);

  return `${ELAPSED_PREFIX}${pad(hours)}:${pad(minutes)}:${pad(seconds % SECONDS_PER_MINUTE)}`;
}
