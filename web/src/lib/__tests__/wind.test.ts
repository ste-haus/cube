import { describe, expect, it } from "vitest";

import { along, bearingDegrees, downwind, meaningfulGust } from "../wind";

describe("bearingDegrees", () => {
  it("takes degrees as they are, brought round into a single turn", () => {
    expect(bearingDegrees(357)).toBe(357);
    expect(bearingDegrees(-10)).toBe(350);
    expect(bearingDegrees(370)).toBe(10);
  });

  it("reads a compass point, whatever its case", () => {
    expect(bearingDegrees("NW")).toBe(315);
    expect(bearingDegrees("nne")).toBe(22.5);
  });

  it("reads degrees given as text", () => {
    expect(bearingDegrees("270")).toBe(270);
  });

  it("has no bearing for anything else", () => {
    expect(bearingDegrees(null)).toBeNull();
    expect(bearingDegrees("")).toBeNull();
    expect(bearingDegrees("gusty")).toBeNull();
    expect(bearingDegrees(Number.NaN)).toBeNull();
  });
});

describe("downwind", () => {
  it("points the opposite way to where the wind comes from", () => {
    expect(downwind(357)).toBe(177);
    expect(downwind(90)).toBe(270);
  });
});

describe("meaningfulGust", () => {
  const THRESHOLD = 15;

  it("gives a gust that reaches the threshold, in whole units", () => {
    expect(meaningfulGust(10, 22.4, THRESHOLD)).toBe(22);
    expect(meaningfulGust(10, 14.6, THRESHOLD)).toBe(15);
  });

  it("gives nothing for a gust under the threshold", () => {
    expect(meaningfulGust(2, 3, THRESHOLD)).toBeNull();
  });

  it("gives nothing for a gust no stronger than the wind it gusts over", () => {
    expect(meaningfulGust(20, 20.2, THRESHOLD)).toBeNull();
  });

  it("gives nothing without both readings", () => {
    expect(meaningfulGust(null, 22, THRESHOLD)).toBeNull();
    expect(meaningfulGust(10, null, THRESHOLD)).toBeNull();
  });
});

describe("along", () => {
  it("runs north up, east right, and south down", () => {
    const north = along(0, 1);
    const east = along(90, 1);
    const south = along(180, 2);

    expect(north.x).toBeCloseTo(0);
    expect(north.y).toBeCloseTo(-1);
    expect(east.x).toBeCloseTo(1);
    expect(east.y).toBeCloseTo(0);
    expect(south.x).toBeCloseTo(0);
    expect(south.y).toBeCloseTo(2);
  });
});
