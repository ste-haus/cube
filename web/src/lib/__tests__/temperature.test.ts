import { describe, expect, it } from "vitest";

import { colorAt, cssGradient, gradientBetween, percentAlong } from "../temperature";

const BLACK = "#000000";
const WHITE = "#ffffff";
const GREY = "#808080";

const TWO_STOPS = [
  { at: 50, color: BLACK },
  { at: 70, color: WHITE },
];

const THREE_STOPS = [
  { at: 50, color: BLACK },
  { at: 60, color: GREY },
  { at: 70, color: WHITE },
];

describe("colorAt", () => {
  it("blends between the stops either side", () => {
    expect(colorAt(TWO_STOPS, 60)).toBe(GREY);
  });

  it("holds the end colors past either end", () => {
    expect(colorAt(TWO_STOPS, 20)).toBe(BLACK);
    expect(colorAt(TWO_STOPS, 90)).toBe(WHITE);
  });

  it("reads a short hex color", () => {
    expect(colorAt([{ at: 50, color: "#000" }, { at: 70, color: "#fff" }], 60)).toBe(GREY);
  });

  it("takes the lower color outright when a stop cannot be blended", () => {
    expect(colorAt([{ at: 50, color: "teal" }, { at: 70, color: WHITE }], 60)).toBe("teal");
  });
});

describe("gradientBetween", () => {
  it("keeps the configured stops that fall inside the range where they fall", () => {
    const stops = gradientBetween(THREE_STOPS, 55, 65);

    expect(stops.map((stop) => stop.offset)).toEqual([0, 50, 100]);
    expect(stops[1].color).toBe(GREY);
  });

  it("colors the ends by the temperatures they stand for", () => {
    const stops = gradientBetween(TWO_STOPS, 50, 70);

    expect(stops[0].color).toBe(BLACK);
    expect(stops[stops.length - 1].color).toBe(WHITE);
  });

  it("paints one color when the range has no width", () => {
    const stops = gradientBetween(TWO_STOPS, 60, 60);

    expect(new Set(stops.map((stop) => stop.color))).toEqual(new Set([GREY]));
  });

  it("writes a left-to-right CSS gradient", () => {
    expect(cssGradient(gradientBetween(TWO_STOPS, 50, 70))).toBe(
      `linear-gradient(to right, ${BLACK} 0%, ${WHITE} 100%)`,
    );
  });
});

describe("percentAlong", () => {
  it("places a value between its bounds", () => {
    expect(percentAlong(60, 50, 70)).toBe(50);
  });

  it("holds a value outside the bounds at the nearer end", () => {
    expect(percentAlong(40, 50, 70)).toBe(0);
    expect(percentAlong(80, 50, 70)).toBe(100);
  });

  it("centres a value when the bounds meet", () => {
    expect(percentAlong(60, 60, 60)).toBe(50);
  });
});
