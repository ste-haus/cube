import { describe, expect, it } from "vitest";

import { bandPositions, minimumSpread, weekday } from "../forecast.svelte";

const TOP = 10;
const BOTTOM = 40;
const MIDDLE = 25;

describe("weekday", () => {
  it("names the day a bare date falls on where the panel is", () => {
    // Read as UTC midnight instead, this is Wednesday evening anywhere west of Greenwich.
    expect(weekday("2026-09-10")).toBe("Thu");
  });
});

describe("bandPositions", () => {
  it("puts the warmest at the top of the band and the coldest at the bottom", () => {
    expect(bandPositions([70, 60, 65], TOP, BOTTOM)).toEqual([TOP, BOTTOM, MIDDLE]);
  });

  it("runs a week of one temperature across the middle", () => {
    expect(bandPositions([62, 62, 62], TOP, BOTTOM)).toEqual([MIDDLE, MIDDLE, MIDDLE]);
  });

  it("leaves a missing value missing and scales around it", () => {
    expect(bandPositions([70, null, 60], TOP, BOTTOM)).toEqual([TOP, null, BOTTOM]);
  });

  it("places nothing when nothing is known", () => {
    expect(bandPositions([null, null], TOP, BOTTOM)).toEqual([null, null]);
  });

  it("draws a spread narrower than its minimum across only the middle of the band", () => {
    // 62 and 60 either side of 61, in a band ten degrees tall: four and six tenths down it.
    const [warmer, cooler] = bandPositions([62, 60], TOP, BOTTOM, 10);

    expect(warmer).toBeCloseTo(22);
    expect(cooler).toBeCloseTo(28);
  });

  it("leaves a spread wider than its minimum as it is", () => {
    expect(bandPositions([70, 60, 65], TOP, BOTTOM, 5)).toEqual([TOP, BOTTOM, MIDDLE]);
  });
});

describe("minimumSpread", () => {
  it("is ten degrees in Fahrenheit, and when the unit is not known", () => {
    expect(minimumSpread("°F")).toBe(10);
    expect(minimumSpread(null)).toBe(10);
  });

  it("is the same spread of temperature in Celsius", () => {
    expect(minimumSpread("°C")).toBeCloseTo(5.56, 2);
  });
});
