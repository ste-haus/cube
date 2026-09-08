import type { ThresholdScale } from "./types";

/** Compass points at 22.5° intervals, indexed by rounded bearing / 22.5. */
const COMPASS_POINTS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N",
];

const DEGREES_PER_POINT = 22.5;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TEENS_START = 11;
const TEENS_END = 13;
const ORDINAL_SUFFIXES: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
const DEFAULT_ORDINAL_SUFFIX = "th";

const TWO_DIGITS = 2;
const HOURS_PER_HALF_DAY = 12;

export function compassPoint(bearing: number): string {
  const index = Math.round(bearing / DEGREES_PER_POINT) % COMPASS_POINTS.length;

  return COMPASS_POINTS[index];
}

export function ordinal(day: number): string {
  const suffix =
    day >= TEENS_START && day <= TEENS_END
      ? DEFAULT_ORDINAL_SUFFIX
      : (ORDINAL_SUFFIXES[day % 10] ?? DEFAULT_ORDINAL_SUFFIX);

  return `${day}${suffix}`;
}

export function thresholdColor(scale: ThresholdScale | null | undefined, value: number): string | null {
  if (!scale) {
    return null;
  }

  for (const band of [...scale.bands].sort((a, b) => b.at - a.at)) {
    if (value >= band.at) {
      return band.color;
    }
  }

  return scale.default_color;
}

/**
 * A small strftime, so date and time formats stay in the same notation the rest of a Home
 * Assistant config uses. `%o` is an addition: the day of the month with its ordinal suffix.
 */
export function strftime(date: Date, format: string): string {
  const pad = (value: number) => String(value).padStart(TWO_DIGITS, "0");
  const hours12 = date.getHours() % HOURS_PER_HALF_DAY || HOURS_PER_HALF_DAY;

  const tokens: Record<string, string> = {
    A: WEEKDAYS[date.getDay()],
    a: WEEKDAYS[date.getDay()].slice(0, 3),
    B: MONTHS[date.getMonth()],
    b: MONTHS[date.getMonth()].slice(0, 3),
    d: pad(date.getDate()),
    "-d": String(date.getDate()),
    o: ordinal(date.getDate()),
    m: pad(date.getMonth() + 1),
    Y: String(date.getFullYear()),
    H: pad(date.getHours()),
    I: pad(hours12),
    M: pad(date.getMinutes()),
    S: pad(date.getSeconds()),
    p: date.getHours() < HOURS_PER_HALF_DAY ? "AM" : "PM",
    "%": "%",
  };

  return format.replace(/%(-?\w|%)/g, (match, token: string) => tokens[token] ?? match);
}

/** Formats an event's start as a wall-clock time, or nothing at all for an all-day event. */
export function eventTime(start: string | null, allDay: boolean): string {
  if (allDay || !start) {
    return "";
  }

  return strftime(new Date(start), "%H:%M");
}

/** How far through an event we are, as a percentage, or null when it is not under way. */
export function eventProgress(start: string | null, end: string | null, now: Date): number | null {
  if (!start || !end) {
    return null;
  }

  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  const at = now.getTime();

  if (at < from || at > to || to <= from) {
    return null;
  }

  const PERCENT = 100;

  return ((at - from) / (to - from)) * PERCENT;
}
