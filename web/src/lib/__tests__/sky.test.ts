import { describe, expect, it } from "vitest";

import { curveValue, dayCurve, daylightAt, moonLitPath, SKY_WIDTH, skyAt, timeLeft } from "../sky";

const DAY_MS = 24 * 60 * 60 * 1000;
const HALF = 0.5;

const LATITUDE = 45;
const MINUTES_PER_DEGREE = 4;

/**
 * A longitude where this machine's clock reads roughly solar time.
 *
 * The sky is drawn by the local clock, so a fixed place would put its sunrise at the wrong hour for
 * whoever runs these in another timezone.
 */
function localLongitude(at: Date): number {
  return -at.getTimezoneOffset() / MINUTES_PER_DEGREE;
}

const sunrise = new Date(2026, 8, 10, 6);
const sunset = new Date(2026, 8, 10, 20);
const solarNoon = new Date(2026, 8, 10, 13);

describe("dayCurve", () => {
  const curve = dayCurve(sunrise, sunset, solarNoon, true);

  it("crosses the horizon at sunrise and at sunset", () => {
    expect(curveValue(curve, sunrise.getTime())).toBeCloseTo(0);
    expect(curveValue(curve, sunset.getTime())).toBeCloseTo(0);
  });

  it("peaks halfway through the daylight", () => {
    expect(curve.centre).toBe(solarNoon.getTime());
    expect(curveValue(curve, curve.centre)).toBeGreaterThan(0);
  });

  it("is below the horizon in the middle of the night", () => {
    expect(curveValue(curve, curve.centre + DAY_MS * HALF)).toBeLessThan(0);
  });

  it("draws a long day as a tall hill over a shallow trough", () => {
    const peak = curveValue(curve, curve.centre);
    const trough = -curveValue(curve, curve.centre + DAY_MS * HALF);

    expect(peak).toBeGreaterThan(trough);
  });

  it("keeps a midnight sun above the horizon, touching it once", () => {
    const polar = dayCurve(null, null, solarNoon, true);

    expect(curveValue(polar, polar.centre + DAY_MS * HALF)).toBeCloseTo(0);
    expect(curveValue(polar, polar.centre)).toBeGreaterThan(0);
  });

  it("keeps a polar night below the horizon, touching it once", () => {
    const polar = dayCurve(null, null, solarNoon, false);

    expect(curveValue(polar, polar.centre)).toBeCloseTo(0);
    expect(curveValue(polar, polar.centre + DAY_MS * HALF)).toBeLessThan(0);
  });
});

describe("skyAt", () => {
  const midday = new Date(2026, 8, 10, 12);
  const lateEvening = new Date(2026, 8, 10, 22);

  it("puts the morning's sunrise before the evening's sunset at midday", () => {
    const sky = skyAt(midday, LATITUDE, localLongitude(midday));

    expect(sky.sunriseX).not.toBeNull();
    expect(sky.sunsetX).not.toBeNull();
    expect(sky.sunriseX!).toBeGreaterThan(0);
    expect(sky.sunriseX!).toBeLessThan(sky.sunsetX!);
    expect(sky.sunsetX!).toBeLessThan(SKY_WIDTH);
  });

  it("has the sun above the horizon at midday", () => {
    const sky = skyAt(midday, LATITUDE, localLongitude(midday));

    expect(sky.sunUp).toBe(true);
    expect(sky.sun.y).toBeLessThan(sky.horizon);
  });

  it("has the sun below the horizon late in the evening", () => {
    const sky = skyAt(lateEvening, LATITUDE, localLongitude(lateEvening));

    expect(sky.sunUp).toBe(false);
    expect(sky.sun.y).toBeGreaterThan(sky.horizon);
  });

  it("keeps now in the middle, by day and by night", () => {
    expect(skyAt(midday, LATITUDE, localLongitude(midday)).sun.x).toBeCloseTo(SKY_WIDTH * HALF, 0);
    expect(skyAt(lateEvening, LATITUDE, localLongitude(lateEvening)).sun.x).toBeCloseTo(SKY_WIDTH * HALF, 0);
  });

  it("runs from the sunset just gone to the next morning's sunrise late in the evening", () => {
    const sky = skyAt(lateEvening, LATITUDE, localLongitude(lateEvening));

    expect(sky.sunsetX!).toBeLessThan(SKY_WIDTH * HALF);
    expect(sky.sunriseX!).toBeGreaterThan(SKY_WIDTH * HALF);
    expect(sky.sunrise!.getDate()).toBe(lateEvening.getDate() + 1);
  });
});

describe("daylightAt", () => {
  it("runs from this morning's sunrise to this evening's sunset while the sun is up", () => {
    const midday = new Date(2026, 8, 10, 12);
    const daylight = daylightAt(midday, LATITUDE, localLongitude(midday))!;

    expect(daylight.up).toBe(true);
    expect(daylight.from.getDate()).toBe(10);
    expect(daylight.to.getDate()).toBe(10);
    expect(daylight.progress).toBeGreaterThan(0);
    expect(daylight.progress).toBeLessThan(1);
  });

  it("runs from this evening's sunset to tomorrow's sunrise after dark", () => {
    const lateEvening = new Date(2026, 8, 10, 22);
    const daylight = daylightAt(lateEvening, LATITUDE, localLongitude(lateEvening))!;

    expect(daylight.up).toBe(false);
    expect(daylight.from.getDate()).toBe(10);
    expect(daylight.to.getDate()).toBe(11);
  });

  it("runs from last night's sunset before dawn", () => {
    const beforeDawn = new Date(2026, 8, 10, 3);
    const daylight = daylightAt(beforeDawn, LATITUDE, localLongitude(beforeDawn))!;

    expect(daylight.up).toBe(false);
    expect(daylight.from.getDate()).toBe(9);
    expect(daylight.to.getDate()).toBe(10);
  });

  it("fades each end over the share of the span the light takes to change", () => {
    const midday = new Date(2026, 8, 10, 12);
    const daylight = daylightAt(midday, LATITUDE, localLongitude(midday))!;

    // Golden hour is most of an hour against a day of about thirteen: a few percent at each end.
    for (const fade of [daylight.startFade, daylight.endFade]) {
      expect(fade).toBeGreaterThan(0.02);
      expect(fade).toBeLessThan(0.2);
    }
  });

  it("has nothing to say under a midnight sun", () => {
    const midsummer = new Date(2026, 5, 21, 12);

    expect(daylightAt(midsummer, 85, localLongitude(midsummer))).toBeNull();
  });
});

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** The reading as it lands on the panel: the number, then its unit. */
function timeUntil(milliseconds: number): string {
  const { amount, unit } = timeLeft(milliseconds);

  return `${amount}${unit}`;
}

describe("timeLeft", () => {
  it("keeps the number and its unit apart, so the number can be centred on its own", () => {
    expect(timeLeft(3 * HOUR + 5 * MINUTE)).toEqual({ amount: 3, unit: "h" });
  });
  it("gives whole hours, rounded down", () => {
    expect(timeUntil(9 * HOUR + 50 * MINUTE)).toBe("9h");
    expect(timeUntil(HOUR)).toBe("1h");
  });

  it("gives minutes under the hour, rounded up", () => {
    expect(timeUntil(55 * MINUTE + 10 * 1000)).toBe("56m");
    expect(timeUntil(12 * MINUTE)).toBe("12m");
  });

  it("never says 60m or 0m", () => {
    expect(timeUntil(59 * MINUTE + 30 * 1000)).toBe("59m");
    expect(timeUntil(20 * 1000)).toBe("1m");
  });
});

const RADIUS = 50;
const ARC = /A([\d.]+),[\d.]+ 0 0 (\d)/g;

/** The outer arc's sweep, and the terminator's width and sweep. */
function arcs(path: string): { outer: number; terminator: number; inner: number } {
  const [outer, inner] = [...path.matchAll(ARC)];

  return { outer: Number(outer[2]), terminator: Number(inner[1]), inner: Number(inner[2]) };
}

const CLOCKWISE = 1;
const ANTICLOCKWISE = 0;

describe("moonLitPath", () => {
  it("draws nothing lit at new moon", () => {
    // Out round the right edge and straight back along it.
    expect(arcs(moonLitPath(0, RADIUS, false))).toEqual({ outer: CLOCKWISE, terminator: RADIUS, inner: ANTICLOCKWISE });
  });

  it("lights the right half at first quarter in the north", () => {
    expect(arcs(moonLitPath(0.25, RADIUS, false))).toMatchObject({ outer: CLOCKWISE, terminator: 0 });
  });

  it("lights the left half at first quarter in the south", () => {
    expect(arcs(moonLitPath(0.25, RADIUS, true))).toMatchObject({ outer: ANTICLOCKWISE, terminator: 0 });
  });

  it("draws the whole disk at full moon", () => {
    // Down the left edge and back up the right.
    expect(arcs(moonLitPath(0.5, RADIUS, false))).toEqual({ outer: ANTICLOCKWISE, terminator: RADIUS, inner: ANTICLOCKWISE });
  });

  it("bulges the terminator away from the lit edge once past the quarter", () => {
    const gibbous = arcs(moonLitPath(0.375, RADIUS, false));

    expect(gibbous.outer).toBe(CLOCKWISE);
    expect(gibbous.inner).toBe(CLOCKWISE);
  });

  it("lights a waning crescent on the left in the north", () => {
    const crescent = arcs(moonLitPath(0.875, RADIUS, false));

    expect(crescent.outer).toBe(ANTICLOCKWISE);
    expect(crescent.inner).toBe(CLOCKWISE);
  });
});
