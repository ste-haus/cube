import { describe, expect, it } from "vitest";

import { DEFAULT_REFERENCE, parseHex, tints, type Rgb } from "../tint";

// The palette the drawn styles shipped with before it was worked out from a reference.
const SHIPPED_REST = "#2c4a6e";
const SHIPPED_PEAK = "#dff0ff";
const TOLERANCE = 1;
const GREY = "#808080";
const MAGENTA = "#f205f2";

function near(actual: Rgb, expected: string): void {
  const want = parseHex(expected) as Rgb;
  actual.forEach((channel, index) => expect(Math.abs(channel - want[index])).toBeLessThanOrEqual(TOLERANCE));
}

describe("tints", () => {
  it("gives back the shipped palette for the shipped reference", () => {
    const palette = tints(DEFAULT_REFERENCE);

    expect(palette.body).toEqual(parseHex(DEFAULT_REFERENCE));
    near(palette.rest, SHIPPED_REST);
    near(palette.peak, SHIPPED_PEAK);
  });

  it("falls back to the shipped reference without one, or with one it cannot read", () => {
    expect(tints(null)).toEqual(tints(DEFAULT_REFERENCE));
    expect(tints("tomato")).toEqual(tints(DEFAULT_REFERENCE));
  });

  it("keeps the reference itself as the body", () => {
    expect(tints(MAGENTA).body).toEqual(parseHex(MAGENTA));
  });

  it("leaves a grey reference grey", () => {
    const { rest, peak } = tints(GREY);

    for (const [red, green, blue] of [rest, peak]) {
      expect(red).toBe(green);
      expect(green).toBe(blue);
    }
  });

  it("reads short hex", () => {
    expect(parseHex("#abc")).toEqual(parseHex("#aabbcc"));
  });
});
