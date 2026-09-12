import type { ThresholdScale, TurningPoint } from "./types";

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

/*
 * A syllable is the unit speech actually spends time in, so it is what the reveal is paced
 * against. Counting vowel groups is a serviceable way to find them without a dictionary —
 * "a" has one, "announcement" has four — and it is wrong in the direction that does not
 * matter, because nothing here has to agree with the voice to the word.
 */
const VOWEL_GROUP = /[aeiouy]+/gi;
const WORDS_AND_GAPS = /(\s+)/;
const ONLY_WHITESPACE = /^\s+$/;

const MINIMUM_SYLLABLES = 1;

/** A gap between words is a beat of its own, and a short one. */
const SPACE_BEATS = 0.3;

/*
 * What a mark of punctuation is worth on top of the word it ends, in syllables. Speech slows at
 * a comma and stops at a full stop. Announcements often arrive with no punctuation at all,
 * which is why this only ever adds to a pace the syllables have already set.
 */
const DWELL: Record<string, number> = {
  ",": 0.5,
  ";": 0.7,
  ":": 0.7,
  "—": 0.5,
  ".": 1,
  "!": 1,
  "?": 1,
};

function syllablesIn(word: string): number {
  return word.match(VOWEL_GROUP)?.length || MINIMUM_SYLLABLES;
}

/**
 * What each character of a line is worth, in syllables.
 *
 * A word's syllables are shared out across its letters, so a long word takes longer than a
 * short one but not in proportion to how it is spelled — which is the difference between
 * reading and spooling.
 */
function beatsPerCharacter(text: string): number[] {
  const beats: number[] = [];

  for (const chunk of text.split(WORDS_AND_GAPS)) {
    if (chunk === "") {
      continue;
    }

    if (ONLY_WHITESPACE.test(chunk)) {
      beats.push(...[...chunk].map(() => SPACE_BEATS));
      continue;
    }

    const share = syllablesIn(chunk) / chunk.length;
    beats.push(...[...chunk].map((character) => share + (DWELL[character] ?? 0)));
  }

  return beats;
}

/**
 * When each character of a line is due, in beats from the start of the reveal.
 *
 * Cumulative, so whoever is drawing it reveals however many have come due by the moment they
 * ask. Beats rather than seconds, so the pace stays the caller's to set.
 *
 * This is counted out here rather than handed to CSS as a timing function because a line long
 * enough to wrap cannot be revealed by growing a box: the second line starts at the left
 * again, and no amount of width says so.
 */
export function revealSchedule(text: string): number[] {
  const schedule: number[] = [];
  let elapsed = 0;

  for (const beat of beatsPerCharacter(text)) {
    elapsed += beat;
    schedule.push(elapsed);
  }

  return schedule;
}

const HOURS_SUFFIX = "h";
const AHEAD = "+";
const BEHIND = "-";

/**
 * A turning point read out of an attribute, or null when there is none to show.
 *
 * The sensor writes an empty mapping when it has nothing, and anything without a temperature and
 * hours is treated the same way, so a half-written attribute shows the state rather than "NaN".
 * A point that does not say whether it is ahead is taken as ahead when its hours are.
 */
export function turningPoint(value: unknown): TurningPoint | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { temperature, hours, upcoming } = value as Partial<Record<keyof TurningPoint, unknown>>;
  if (typeof temperature !== "number" || typeof hours !== "number") {
    return null;
  }

  return { temperature, hours, upcoming: typeof upcoming === "boolean" ? upcoming : hours >= 0 };
}

/**
 * How far off a turning point is, as the panel shows it: "+5h" counting down to the next one,
 * "-3h" counting up from the last, and nothing at all while we are at it, since "0h" says nothing
 * the temperature beside it does not.
 */
export function turningPointHours(point: TurningPoint): string | null {
  if (point.hours === 0) {
    return null;
  }

  return `${point.upcoming ? AHEAD : BEHIND}${Math.abs(point.hours)}${HOURS_SUFFIX}`;
}

/** How much of a line is due by a given point, given what its schedule says. */
export function revealedBy(schedule: number[], beats: number): number {
  let count = 0;

  while (count < schedule.length && schedule[count] <= beats) {
    count += 1;
  }

  return count;
}
