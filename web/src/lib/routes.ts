import { daysUntil, strftime } from "./format";
import { fill } from "./incidents";
import { METRES_PER } from "./radar";
import type { DistanceUnit, Labels } from "./types";

export interface BaseRouteDetails {
  trip: string;
  name: string;
  color: string;
  destination_address: string | null;
  kind: string;
  source: string | null;
  length_m: number | null;
  cached_at: string | null;
  via_count: number;
  suggested: boolean;
  congestion_available: boolean;
}

const DISTANCE_DECIMALS = 1;
const TIME_FORMAT = "%H:%M";
const SHORT_WEEKDAY_FORMAT = "%a";
const TODAY = 0;
const YESTERDAY = 1;
// Younger than this, a base was built just now
const JUST_NOW_MS = 60_000;
// From this many days old an age is told in weeks, until it is a calendar month
const WEEKS_FROM_DAYS = 14;
const DAYS_PER_WEEK = 7;
const MONTHS_PER_YEAR = 12;
const ONE = 1;
const NO_AGE = 0;
// Day zero of a month is the last day of the month before it
const DAY_BEFORE_FIRST = 0;
const ADDRESS_SEPARATOR = /[\r\n,]/;
const FIRST_LINE = 0;
const DISTANCE_UNITS: DistanceUnit[] = ["mi", "km"];
const DEFAULT_UNIT: DistanceUnit = "km";

/** The unit the face's own distance sensors report in, so both windows agree; km when none says. */
export function routeUnit(units: (string | null | undefined)[]): DistanceUnit {
  return (units.find((unit) => DISTANCE_UNITS.includes(unit as DistanceUnit)) as DistanceUnit | undefined) ?? DEFAULT_UNIT;
}

export function firstAddressLine(address: string | null, labels: Labels): string {
  return address?.trim().split(ADDRESS_SEPARATOR)[FIRST_LINE].trim() || labels.route_tools_unknown_destination;
}

export function routeSummary(
  route: Pick<BaseRouteDetails, "destination_address" | "length_m" | "via_count">,
  unit: DistanceUnit,
  labels: Labels,
): string {
  const via = fill(labels.route_tools_via, { count: String(route.via_count) });

  return `${firstAddressLine(route.destination_address, labels)} · ${routeDistance(route.length_m, unit, labels)} · ${via}`;
}

export function routeDistance(metres: number | null, unit: DistanceUnit, labels: Labels): string {
  return metres === null || !Number.isFinite(metres)
    ? labels.route_tools_unknown
    : `${(metres / METRES_PER[unit]).toFixed(DISTANCE_DECIMALS)} ${unit}`;
}

interface Age {
  years: number;
  months: number;
  days: number;
}

// `date` moved on by whole months, kept to the last day of a month too short for its day: Jan 31
// a month on is Feb 28
function monthsOn(date: Date, months: number): Date {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + months + 1, DAY_BEFORE_FIRST).getDate();

  return new Date(date.getFullYear(), date.getMonth() + months, Math.min(date.getDate(), lastDay));
}

/**
 * How old `then` is at `now` in local time: the whole months that fit, as years and months, and
 * the calendar days left over.
 */
export function ageOf(then: Date, now: Date): Age {
  let months = (now.getFullYear() - then.getFullYear()) * MONTHS_PER_YEAR + now.getMonth() - then.getMonth();

  if (months > NO_AGE && daysUntil(monthsOn(then, months), now) > NO_AGE) {
    months -= 1;
  }

  const days = daysUntil(now, monthsOn(then, Math.max(months, NO_AGE)));

  return {
    years: Math.floor(Math.max(months, NO_AGE) / MONTHS_PER_YEAR),
    months: Math.max(months, NO_AGE) % MONTHS_PER_YEAR,
    days,
  };
}

type AgeUnit = "day" | "week" | "month" | "year";

/** An age in the one largest unit that fits: days, weeks from two weeks old, then months, then years. */
export function wholeAge(then: Date, now: Date): { count: number; unit: AgeUnit } {
  const age = ageOf(then, now);
  const days = Math.max(-daysUntil(then, now), NO_AGE);

  if (age.years >= ONE) return { count: age.years, unit: "year" };
  if (age.months >= ONE) return { count: age.months, unit: "month" };
  if (days >= WEEKS_FROM_DAYS) return { count: Math.floor(days / DAYS_PER_WEEK), unit: "week" };

  return { count: days, unit: "day" };
}

/** An age as words: "1 week", "3 days". */
export function ageText(age: { count: number; unit: AgeUnit }, labels: Labels): string {
  const units: Record<AgeUnit, [string, string]> = {
    day: [labels.route_tools_day, labels.route_tools_days],
    week: [labels.route_tools_week, labels.route_tools_weeks],
    month: [labels.route_tools_month, labels.route_tools_months],
    year: [labels.route_tools_year, labels.route_tools_years],
  };
  const [one, many] = units[age.unit];

  return `${age.count} ${age.count === ONE ? one : many}`;
}

function builtAt(value: string | null): Date | null {
  const date = value ? new Date(value) : null;

  return date === null || Number.isNaN(date.getTime()) ? null : date;
}

/**
 * When a route's base was built: "Cached just now", "Cached today · 09:15", "Cached yesterday ·
 * 10:04", and after that by its age with its weekday and time, "Cached 3 days ago · Sun 14:30".
 */
export function routeCachedAt(value: string | null, now: Date, labels: Labels): string {
  const date = builtAt(value);

  if (date === null) {
    return fill(labels.route_tools_cached, { when: labels.route_tools_unknown });
  }

  if (Math.abs(now.getTime() - date.getTime()) < JUST_NOW_MS) {
    return fill(labels.route_tools_cached, { when: labels.route_tools_just_now });
  }

  const daysAgo = -daysUntil(date, now);
  const time = strftime(date, TIME_FORMAT);
  let when: string;

  if (daysAgo <= TODAY) {
    when = fill(labels.route_tools_when, { day: labels.route_tools_today, time });
  } else if (daysAgo === YESTERDAY) {
    when = fill(labels.route_tools_when, { day: labels.route_tools_yesterday, time });
  } else {
    when = fill(labels.route_tools_age, {
      age: ageText(wholeAge(date, now), labels),
      weekday: strftime(date, SHORT_WEEKDAY_FORMAT),
      time,
    });
  }

  return fill(labels.route_tools_cached, { when });
}

/** What replacing a route's base asks: "Replace today's route?", or "Replace the route from 3 days ago?". */
export function routeQuestion(value: string | null, now: Date, labels: Labels): string {
  const date = builtAt(value);

  if (date === null) {
    return labels.route_tools_confirm_unknown;
  }

  const daysAgo = -daysUntil(date, now);

  if (daysAgo <= TODAY) return fill(labels.route_tools_confirm, { day: labels.route_tools_today });
  if (daysAgo === YESTERDAY) return fill(labels.route_tools_confirm, { day: labels.route_tools_yesterday });

  return fill(labels.route_tools_confirm_age, { age: ageText(wholeAge(date, now), labels) });
}
