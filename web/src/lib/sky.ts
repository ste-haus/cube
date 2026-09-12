/**
 * The day's sky, drawn as a curve against the horizon.
 *
 * The curve is not the sun's real elevation. That rises steeply and flattens off, which reads as
 * a lopsided hill and puts noon nowhere obvious. It is a cosine over the whole day instead,
 * peaking at the midpoint of the daylight and lifted just far enough that it crosses the horizon
 * exactly at sunrise and sunset. A long summer day is therefore a tall hill over a shallow
 * trough, and a winter one the other way round, which is the part of the real shape worth
 * keeping.
 */

import SunCalc from "suncalc";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const SAMPLE_MS = 10 * MINUTE_MS;
const MIDDAY_HOUR = 12;

const FULL_TURN = 2 * Math.PI;
const RIGHT_ANGLE = Math.PI / 2;
const HALF = 0.5;

/* The cosine before it is lifted: 1 at its peak, -1 at its trough, 2 from one to the other. */
const CURVE_PEAK = 1;
const CURVE_SPAN = 2;
const HORIZON = 0;

/* With no sunrise at all, the curve is lifted clear of the horizon and touches it once. */
const MIDNIGHT_SUN_LIFT = -1;
const POLAR_NIGHT_LIFT = 1;

/** The drawing's own units: the day across, the sky down. */
export const SKY_WIDTH = 1000;
export const SKY_HEIGHT = 1000;
/* Room above the peak and below the trough, so a marker riding either is not cut off. */
const SKY_MARGIN = 90;

const COORDINATE_DECIMALS = 1;

/* Phases, as SunCalc counts them: 0 new, 0.5 full, back to 1. */
const FULL_MOON_PHASE = 0.5;

export interface Point {
  x: number;
  y: number;
}

export interface DayCurve {
  /** When the curve peaks, in epoch milliseconds. */
  centre: number;
  /** How far the cosine is lowered, so that it reads zero at sunrise and sunset. */
  lift: number;
}

export interface Sky {
  /** The sunrise and the sunset within half a day of now, on whichever side of it they fall. */
  sunrise: Date | null;
  sunset: Date | null;
  sunriseX: number | null;
  sunsetX: number | null;
  horizon: number;
  /** The curve from half a day before now to half a day after. */
  curve: string;
  /** What has been lit in the half day before now, between the curve and the horizon. */
  day: string;
  /** What has been dark in the half day before now, between the horizon and the curve. */
  night: string;
  sun: Point;
  sunUp: boolean;
  moon: Point;
  moonUp: boolean;
  moonPhase: number;
}

function valid(date: Date | undefined): Date | null {
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** The curve for a day, given its sunrise and sunset, or whether the sun is up at all without them. */
export function dayCurve(sunrise: Date | null, sunset: Date | null, solarNoon: Date, sunAtNoon: boolean): DayCurve {
  if (sunrise && sunset) {
    const halfDaylight = (sunset.getTime() - sunrise.getTime()) * HALF;

    return {
      centre: sunrise.getTime() + halfDaylight,
      lift: Math.cos((FULL_TURN * halfDaylight) / DAY_MS),
    };
  }

  return { centre: solarNoon.getTime(), lift: sunAtNoon ? MIDNIGHT_SUN_LIFT : POLAR_NIGHT_LIFT };
}

/** Where the curve is at a moment: above zero is day, below it night. */
export function curveValue(curve: DayCurve, at: number): number {
  return Math.cos((FULL_TURN * (at - curve.centre)) / DAY_MS) - curve.lift;
}

function path(points: Point[]): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";

      return `${command}${point.x.toFixed(COORDINATE_DECIMALS)},${point.y.toFixed(COORDINATE_DECIMALS)}`;
    })
    .join(" ");
}

/* The sky is drawn from half a day before now to half a day after, so now is always its middle. */
const HALF_DAY_MS = DAY_MS * HALF;

/** Everything the horizon card draws for one moment, at one place, with that moment in the middle. */
export function skyAt(now: Date, latitude: number, longitude: number): Sky {
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();

  // Now stays put and the day and night move past it, so the sun and the moon never leave the
  // middle of the card.
  const at = now.getTime();
  const windowStart = at - HALF_DAY_MS;
  const windowEnd = at + HALF_DAY_MS;
  const inWindow = (event: Date | null) =>
    event !== null && event.getTime() >= windowStart && event.getTime() <= windowEnd;

  const times = SunCalc.getTimes(new Date(year, month, date, MIDDAY_HOUR), latitude, longitude);
  const sunAtNoon = SunCalc.getPosition(times.solarNoon, latitude, longitude).altitude > HORIZON;

  // Half a day either way of now reaches into yesterday or tomorrow, so their sunrises and sunsets
  // are looked for too. Today's curve stands in for theirs, which differ from it by a minute or two.
  const days = NEIGHBOURING_DAYS.map((offset) =>
    SunCalc.getTimes(new Date(year, month, date + offset, MIDDAY_HOUR), latitude, longitude),
  );
  const sunrise = days.map((day) => valid(day.sunrise)).find(inWindow) ?? null;
  const sunset = days.map((day) => valid(day.sunset)).find(inWindow) ?? null;

  const curve = dayCurve(valid(times.sunrise), valid(times.sunset), times.solarNoon, sunAtNoon);
  const top = CURVE_PEAK - curve.lift;
  const bottom = top - CURVE_SPAN;
  const drawable = SKY_HEIGHT - SKY_MARGIN - SKY_MARGIN;

  const x = (moment: number) => ((moment - windowStart) / (windowEnd - windowStart)) * SKY_WIDTH;
  const y = (value: number) => SKY_MARGIN + ((top - value) / CURVE_SPAN) * drawable;
  const pointAt = (moment: number, value: number) => ({ x: x(moment), y: y(value) });

  // Sunrise, sunset, and now are sampled exactly, so the fills meet the horizon where the sun does.
  const samples: number[] = [];
  for (let moment = windowStart; moment < windowEnd; moment += SAMPLE_MS) {
    samples.push(moment);
  }
  samples.push(windowEnd, at);
  for (const event of [sunrise, sunset]) {
    if (event) {
      samples.push(event.getTime());
    }
  }
  samples.sort((first, second) => first - second);

  const horizon = y(HORIZON);
  const elapsed = samples.filter((moment) => moment <= at);

  const fill = (clamp: (value: number) => number) =>
    `${path([
      { x: x(windowStart), y: horizon },
      ...elapsed.map((moment) => pointAt(moment, clamp(curveValue(curve, moment)))),
      { x: x(at), y: horizon },
    ])} Z`;

  const sunValue = curveValue(curve, at);

  /*
   * The moon has a real altitude and the curve does not, so the moon is placed by how its
   * altitude compares with the sun's own extremes today: as high as the sun gets is the top of
   * the hill, as low as it gets is the bottom of the trough.
   */
  const moonAltitude = SunCalc.getMoonPosition(now, latitude, longitude).altitude;
  const sunHighest = SunCalc.getPosition(new Date(curve.centre), latitude, longitude).altitude;
  const sunLowest = SunCalc.getPosition(new Date(curve.centre + DAY_MS * HALF), latitude, longitude).altitude;

  const moonValue =
    moonAltitude >= HORIZON
      ? (moonAltitude / (sunHighest > HORIZON ? sunHighest : RIGHT_ANGLE)) * top
      : (moonAltitude / (sunLowest < HORIZON ? -sunLowest : RIGHT_ANGLE)) * -bottom;

  return {
    sunrise,
    sunset,
    sunriseX: sunrise ? x(sunrise.getTime()) : null,
    sunsetX: sunset ? x(sunset.getTime()) : null,
    horizon,
    curve: path(samples.map((moment) => pointAt(moment, curveValue(curve, moment)))),
    day: fill((value) => Math.max(value, HORIZON)),
    night: fill((value) => Math.min(value, HORIZON)),
    sun: pointAt(at, sunValue),
    sunUp: sunValue > HORIZON,
    moon: pointAt(at, Math.min(Math.max(moonValue, bottom), top)),
    moonUp: moonAltitude > HORIZON,
    moonPhase: moonPhase(now),
  };
}

/* Yesterday, today, and tomorrow: enough sunrises and sunsets that one is always either side of now. */
const NEIGHBOURING_DAYS = [-1, 0, 1];

const MINUTES_PER_HOUR = 60;
const HOUR_SUFFIX = "h";
const MINUTE_SUFFIX = "m";

export interface Daylight {
  /** Whether the sun is up: the span runs sunrise to sunset when it is, sunset to sunrise when not. */
  up: boolean;
  from: Date;
  to: Date;
  /** How far from `from` to `to` now is, from 0 to 1. */
  progress: number;
  /** How much of the span, from its start, the light is still changing over, from 0 to 1. */
  startFade: number;
  /** The same, back from its end. */
  endFade: number;
}

/**
 * A sunrise or sunset, and how long the light is changing either side of it.
 *
 * By day that is golden hour, which SunCalc ends and begins with the sun six degrees up. By night
 * it is civil twilight, which ends and begins with the sun six degrees down. Either way it is the
 * part of the span that is neither one thing nor the other.
 */
interface Crossing {
  at: number;
  rising: boolean;
  before: number;
  after: number;
}

function between(from: Date | null, to: Date | null): number {
  return from && to ? Math.max(to.getTime() - from.getTime(), 0) : 0;
}

/**
 * The stretch of daylight or darkness now is in: the sunrise or sunset it began with, and the
 * one it ends with. Null where there is not one of each within a day of now, which is a polar
 * summer or winter.
 */
export function daylightAt(now: Date, latitude: number, longitude: number): Daylight | null {
  const crossings: Crossing[] = [];

  for (const offset of NEIGHBOURING_DAYS) {
    const midday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, MIDDAY_HOUR);
    const times = SunCalc.getTimes(midday, latitude, longitude);

    const sunrise = valid(times.sunrise);
    const sunset = valid(times.sunset);

    if (sunrise) {
      crossings.push({
        at: sunrise.getTime(),
        rising: true,
        before: between(valid(times.dawn), sunrise),
        after: between(sunrise, valid(times.goldenHourEnd)),
      });
    }

    if (sunset) {
      crossings.push({
        at: sunset.getTime(),
        rising: false,
        before: between(valid(times.goldenHour), sunset),
        after: between(sunset, valid(times.dusk)),
      });
    }
  }

  crossings.sort((first, second) => first.at - second.at);

  const at = now.getTime();
  const nextIndex = crossings.findIndex((crossing) => crossing.at > at);
  if (nextIndex <= 0) {
    return null;
  }

  const previous = crossings[nextIndex - 1];
  const next = crossings[nextIndex];
  const length = next.at - previous.at;

  // Each end may take at most half, so a short span near the poles fades rather than inverts.
  return {
    up: previous.rising,
    from: new Date(previous.at),
    to: new Date(next.at),
    progress: (at - previous.at) / length,
    startFade: Math.min(previous.after / length, HALF),
    endFade: Math.min(next.before / length, HALF),
  };
}

/**
 * How long until something, in one unit: whole hours down to the last one, then minutes.
 *
 * Hours are rounded down, so a reading never claims more time than is left, and minutes are
 * rounded up and held under the hour, so the last minute reads "1m" rather than "0m" and the
 * reading never says "60m".
 */
export function timeLeft(milliseconds: number): { amount: number; unit: string } {
  const minutes = milliseconds / MINUTE_MS;

  if (minutes >= MINUTES_PER_HOUR) {
    return { amount: Math.floor(minutes / MINUTES_PER_HOUR), unit: HOUR_SUFFIX };
  }

  return { amount: Math.min(Math.max(Math.ceil(minutes), 1), MINUTES_PER_HOUR - 1), unit: MINUTE_SUFFIX };
}

/** Whether the sun is above the horizon at a moment, at a place. */
export function sunIsUp(at: Date, latitude: number, longitude: number): boolean {
  return SunCalc.getPosition(at, latitude, longitude).altitude > HORIZON;
}

/** Where the moon is in its month: 0 new, 0.5 full, and back round to 1. */
export function moonPhase(at: Date): number {
  return SunCalc.getMoonIllumination(at).phase;
}

/**
 * The lit part of the moon, as a path over a disk of `radius` centred in a box twice that wide.
 *
 * Drawn as one semicircle on the lit side and back along the terminator, which is half an
 * ellipse whose width shrinks to nothing at the quarters. Before full the terminator bulges
 * toward the lit edge and leaves a crescent; after it, away, and leaves a gibbous moon. Which
 * edge is lit depends on the hemisphere: waxing is lit on the right in the north and on the
 * left in the south.
 */
export function moonLitPath(phase: number, radius: number, southern: boolean): string {
  const waxing = phase < FULL_MOON_PHASE;
  const litOnRight = waxing !== southern;

  const cosine = Math.cos(FULL_TURN * phase);
  const crescent = cosine > 0;
  const terminator = radius * Math.abs(cosine);

  // An SVG arc's sweep flag is 1 for clockwise. From the top clockwise is round the right edge;
  // from the bottom clockwise is round the left.
  const outerSweep = litOnRight ? 1 : 0;
  const innerSweep = litOnRight === crescent ? 0 : 1;

  const centre = radius;
  const topEdge = 0;
  const bottomEdge = radius + radius;

  return [
    `M${centre},${topEdge}`,
    `A${radius},${radius} 0 0 ${outerSweep} ${centre},${bottomEdge}`,
    `A${terminator.toFixed(COORDINATE_DECIMALS)},${radius} 0 0 ${innerSweep} ${centre},${topEdge}`,
    "Z",
  ].join(" ");
}
