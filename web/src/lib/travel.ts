import { strftime } from "./format";
import type { HistoryState, TravelTime } from "./types";

/*
 * A travel time sensor reads below nought while its route is not being kept up to date, so a
 * reading of nought or more is a trip under way and anything else, unknown and unavailable
 * included, is no trip at all.
 */

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
const DEPARTURE_FORMAT = "%H:%M";
export const MINUS_SIGN = "\u2212";
const SECONDS_PER_HOUR = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = HOURS_PER_DAY * SECONDS_PER_HOUR;
// What Home Assistant calls a person who is at home.
const HOME = "home";

export type Urgency = "imminent" | "soon";

export interface ActiveRoute {
  route: TravelTime;
  minutes: number;
}

export interface Thresholds {
  imminent_minutes: number;
  soon_minutes: number;
}

/**
 * The routes under way, with their minutes rounded: the trips tied to a time to leave first,
 * then the ones that are always there, each in the order the config gives them.
 */
export function activeRoutes(routes: TravelTime[], read: (entityId: string) => string | null): ActiveRoute[] {
  const active = routes.flatMap((route) => {
    const state = read(route.entity_id);
    const minutes = state === null ? NaN : Number(state);

    return Number.isFinite(minutes) && minutes >= 0 ? [{ route, minutes: Math.round(minutes) }] : [];
  });

  return [...active.filter(isTrip), ...active.filter((entry) => !isTrip(entry))];
}

function isTrip({ route }: ActiveRoute): boolean {
  return route.departure_entity_id !== null;
}

/**
 * The cards a looping carousel lays out at `offset`: the ones showing, with one more either side
 * for a swipe to slide in from, wrapping round the ends of the list.
 */
export function carouselStrip<T>(items: T[], offset: number, showing: number): T[] {
  const count = items.length;

  return Array.from({ length: showing + 2 }, (_, slot) => items[(((offset + slot - 1) % count) + count) % count]);
}

/** When to leave, from a Unix timestamp; nothing for anything else. */
export function departureAt(state: string | null): Date | null {
  const seconds = state === null ? NaN : Number(state);

  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * MS_PER_SECOND) : null;
}

// A cleared stamp is the epoch, give or take the timezone it was written in, and means the
// route has not been asked about since its destination last changed.
const NEVER_BEFORE_SECONDS = SECONDS_PER_DAY;

/**
 * A moment from whatever holds one: an `input_datetime`'s `timestamp` attribute, a state that is
 * a Unix timestamp, or a state written as a local date and time the way Home Assistant writes
 * one, `2026-10-01 08:30:00`. A cleared stamp, or anything else, is no moment at all.
 */
export function momentOf(state: string | null, timestamp: unknown = null): Date | null {
  const numeric = typeof timestamp === "number" ? timestamp : state === null ? NaN : Number(state);
  if (Number.isFinite(numeric)) {
    return numeric > NEVER_BEFORE_SECONDS ? new Date(numeric * MS_PER_SECOND) : null;
  }

  const written = localMoment(state);

  return written && written.getTime() > NEVER_BEFORE_SECONDS * MS_PER_SECOND ? written : null;
}

/** A local date and time as Home Assistant writes one, space and all; nothing for anything else. */
export function localMoment(text: string | null): Date | null {
  if (!text) {
    return null;
  }

  const moment = new Date(text.replace(" ", "T"));

  return Number.isNaN(moment.getTime()) ? null : moment;
}

/**
 * How long ago a moment was, in words, the way moment.js's `fromNow` puts it: "4 minutes ago",
 * "1 hour ago", in the largest whole unit that fits.
 */
export function timeAgo(then: Date, now: Date, locale?: string): string {
  const seconds = Math.max(Math.round((now.getTime() - then.getTime()) / MS_PER_SECOND), 0);
  const words = new Intl.RelativeTimeFormat(locale, { numeric: "always" });

  if (seconds < SECONDS_PER_MINUTE) {
    return words.format(-seconds, "second");
  }

  if (seconds < SECONDS_PER_HOUR) {
    return words.format(-Math.floor(seconds / SECONDS_PER_MINUTE), "minute");
  }

  if (seconds < SECONDS_PER_DAY) {
    return words.format(-Math.floor(seconds / SECONDS_PER_HOUR), "hour");
  }

  return words.format(-Math.floor(seconds / SECONDS_PER_DAY), "day");
}

const ROUTE_SEPARATOR = "_to_";
const WORD_SEPARATOR = "_";
const ENTITY_DOMAIN_SEPARATOR = ".";

/**
 * Where a route goes, from its entity's name when it is named `<from>_to_<to>`, the way a route
 * that is always there tends to be: `sensor.travel_time_home_to_lab` goes to "Lab". Anything not
 * named that way says nothing.
 */
export function destinationFromName(entityId: string): string | null {
  const objectId = entityId.slice(entityId.indexOf(ENTITY_DOMAIN_SEPARATOR) + 1);
  const at = objectId.lastIndexOf(ROUTE_SEPARATOR);
  if (at < 0) {
    return null;
  }

  const words = objectId
    .slice(at + ROUTE_SEPARATOR.length)
    .split(WORD_SEPARATOR)
    .filter(Boolean);

  return words.length > 0 ? words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") : null;
}

/** The whole minutes traffic adds to a route, or nought when it adds none. */
export function trafficDelay(minutes: number, freeFlow: number | null): number {
  return freeFlow === null ? 0 : Math.max(Math.round(minutes - freeFlow), 0);
}

/** When to leave, on a 24-hour clock. */
export function departureTime(leave: Date): string {
  return strftime(leave, DEPARTURE_FORMAT);
}

/** Any time of day the travel card shows, on the same 24-hour clock as when to leave. */
export const clockTime = departureTime;

function minutesLeft(leave: Date, now: Date): number {
  return (leave.getTime() - now.getTime()) / MS_PER_MINUTE;
}

/**
 * The countdown to the time to leave, in whole minutes below nought, as a launch counts down, or
 * null once the time has come. It rounds away from nought, as a timer does, so it never reads
 * nought while there is still time: half a minute to go is minus one.
 */
export function countdown(leave: Date, now: Date): number | null {
  const left = minutesLeft(leave, now);

  return left > 0 ? -Math.ceil(left) : null;
}

const CLOCK_PAD = 2;

/**
 * The countdown to the time to leave to the second, as a clock reads it, `−11:42`, or `−1:05:09`
 * an hour or more out, or null once the time has come.
 */
export function countdownClock(leave: Date, now: Date): string | null {
  const left = Math.ceil((leave.getTime() - now.getTime()) / MS_PER_SECOND);
  if (left <= 0) {
    return null;
  }

  const hours = Math.floor(left / SECONDS_PER_HOUR);
  const minutes = Math.floor((left % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = String(left % SECONDS_PER_MINUTE).padStart(CLOCK_PAD, "0");

  const clock = hours > 0 ? `${hours}:${String(minutes).padStart(CLOCK_PAD, "0")}:${seconds}` : `${minutes}:${seconds}`;

  return `${MINUS_SIGN}${clock}`;
}

/**
 * Whether a trip is still waiting to leave from here: always, unless it names who takes it and
 * they are somewhere other than home, in which case they have left already or are leaving from
 * elsewhere. A person Home Assistant cannot place might still be at the door, so the trip is
 * treated as theirs to leave on: a tracker that drops out never silences a late trip.
 */
export function leavesFromHome(route: TravelTime, read: (entityId: string) => string | null): boolean {
  if (route.person_entity_id === null) {
    return true;
  }

  const where = read(route.person_entity_id);

  return where === null || where === HOME;
}

/** How near the time to leave is: imminent once it is close or gone, soon as it nears. */
export function urgency(leave: Date, now: Date, thresholds: Thresholds): Urgency | null {
  const left = minutesLeft(leave, now);

  if (left < thresholds.imminent_minutes) {
    return "imminent";
  }

  return left < thresholds.soon_minutes ? "soon" : null;
}

/*
 * How a due trip moves. A soon one breathes as a lit caution does; an imminent one pulses, quicker
 * and deeper, but smoothly, since a hard blink is a master warning's alone. Anything beating with a
 * trip keeps in step with everything else that is by `beatPhase`.
 */
export const BREATHE_MS = 3000;
export const PULSE_MS = 900;

/** How long a beat of each kind takes. */
export const BEAT_MS: Record<Urgency, number> = {
  soon: BREATHE_MS,
  imminent: PULSE_MS,
};

/**
 * A delay that starts a repeating animation part of the way through, so that anything started
 * with one, whenever, is at the same point of its beat as everything else on the page that was:
 * the phase is taken from the page's clock rather than from when the animation began.
 */
export function beatPhase(beatMs: number, now: number = performance.now()): string {
  return `${-(now % beatMs)}ms`;
}

/**
 * How many minutes a route's time moved the last time it did, from its recorded history, oldest
 * first: against the last reading that differed from now, as long as the route was being kept up
 * to date the whole time between. A gap where it read below nought is a different trip, and says
 * nothing about this one. Below nought when it has got quicker.
 */
export function trendOf(history: HistoryState[], minutes: number): number | null {
  for (let at = history.length - 1; at >= 0; at -= 1) {
    const { state } = history[at];
    const reading = state === null ? NaN : Number(state);

    if (!Number.isFinite(reading) || reading < 0) {
      return null;
    }

    const rounded = Math.round(reading);
    if (rounded !== minutes) {
      return minutes - rounded;
    }
  }

  return null;
}

const PLACE_GAP = /\s+/g;
const PLACE_GAP_TO = " ";

/** Whether two places are written the same, give or take case and spacing. */
export function samePlace(one: string | null, other: string | null): boolean {
  const plain = (place: string) => place.trim().replace(PLACE_GAP, PLACE_GAP_TO).toLowerCase();

  return Boolean(one && other) && plain(one as string) === plain(other as string);
}
