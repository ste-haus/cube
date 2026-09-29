import { beforeEach, describe, expect, it } from "vitest";

import { percentAlong, percentRound, pointRound, sliderPercent } from "../slider";
import { ha } from "../state.svelte";
import type { EntityState } from "../types";

const LIGHT = "light.guest";
const COVER = "cover.blinds";
const BAR = { left: 100, width: 200 };

function entity(state: string, attributes: Record<string, unknown> = {}): EntityState {
  return { state, attributes } as unknown as EntityState;
}

beforeEach(() => {
  ha.entities = {};
});

describe("percentAlong", () => {
  it("reads a point on the bar to the whole percent", () => {
    expect(percentAlong(181, BAR)).toBe(41);
    expect(percentAlong(186, BAR)).toBe(43);
  });

  it("holds a drag past either end at that end", () => {
    expect(percentAlong(0, BAR)).toBe(0);
    expect(percentAlong(900, BAR)).toBe(100);
  });
});

describe("sliderPercent", () => {
  it("reads a light's brightness out of a hundred", () => {
    ha.entities = { [LIGHT]: entity("on", { brightness: 128 }) };

    expect(sliderPercent(LIGHT)).toBe(50);
  });

  it("reads a light that is off as nothing, whatever brightness it last had", () => {
    ha.entities = { [LIGHT]: entity("off", { brightness: 128 }) };

    expect(sliderPercent(LIGHT)).toBe(0);
  });

  it("reads a light on with no brightness as all the way on", () => {
    ha.entities = { [LIGHT]: entity("on") };

    expect(sliderPercent(LIGHT)).toBe(100);
  });

  it("reads a cover's position, or its state when it gives none", () => {
    ha.entities = { [COVER]: entity("open", { current_position: 35 }) };
    expect(sliderPercent(COVER)).toBe(35);

    ha.entities = { [COVER]: entity("open") };
    expect(sliderPercent(COVER)).toBe(100);

    ha.entities = { [COVER]: entity("closed") };
    expect(sliderPercent(COVER)).toBe(0);
  });
});

describe("percentRound", () => {
  it("reads the dial from its lower left, clockwise round to its lower right", () => {
    expect(percentRound(-1, 1)).toBe(0);
    expect(percentRound(0, -1)).toBe(50);
    expect(percentRound(1, 1)).toBe(100);
  });

  it("sends a point in the gap at the bottom to the nearer end", () => {
    expect(percentRound(-0.2, 1)).toBe(0);
    expect(percentRound(0.2, 1)).toBe(100);
  });
});

describe("pointRound", () => {
  it("puts a reading back where percentRound reads it", () => {
    const { x, y } = pointRound(25, 0, 0, 10);

    expect(percentRound(x, y)).toBe(25);
  });
});
