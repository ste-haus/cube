import { describe, expect, it } from "vitest";

import { turningPoint, turningPointHours } from "../format";

describe("turningPoint", () => {
  it("reads a whole turning point", () => {
    expect(turningPoint({ time: "2026-09-11T21:00:00Z", temperature: 66, upcoming: true, hours: 3 })).toEqual({
      temperature: 66,
      hours: 3,
      upcoming: true,
    });
  });

  it("has nothing to show for the empty mapping the sensor writes when it has nothing", () => {
    expect(turningPoint({})).toBeNull();
  });

  it("has nothing to show for an attribute that is missing or not a mapping", () => {
    expect(turningPoint(null)).toBeNull();
    expect(turningPoint(undefined)).toBeNull();
    expect(turningPoint(3)).toBeNull();
  });

  it("has nothing to show when the temperature or hours are missing", () => {
    expect(turningPoint({ temperature: 66, upcoming: true })).toBeNull();
    expect(turningPoint({ hours: 3, upcoming: true })).toBeNull();
  });

  it("takes a point that does not say whether it is ahead from the sign of its hours", () => {
    expect(turningPoint({ temperature: 50, hours: -2 })?.upcoming).toBe(false);
    expect(turningPoint({ temperature: 50, hours: 4 })?.upcoming).toBe(true);
  });
});

describe("turningPointHours", () => {
  it("counts down to one still to come", () => {
    expect(turningPointHours({ temperature: 66, hours: 5, upcoming: true })).toBe("+5h");
  });

  it("counts up from one just gone", () => {
    expect(turningPointHours({ temperature: 66, hours: -3, upcoming: false })).toBe("-3h");
  });

  it("says nothing at all while we are at the turning point, on either side of it", () => {
    expect(turningPointHours({ temperature: 66, hours: 0, upcoming: false })).toBeNull();
    expect(turningPointHours({ temperature: 66, hours: 0, upcoming: true })).toBeNull();
  });
});
