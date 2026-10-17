import { describe, expect, it } from "vitest";

import {
  adjustable,
  decimals,
  DialArc,
  dialFade,
  dialHashes,
  dialPosition,
  modeColour,
  moveSetpoint,
  nearestHash,
  running,
  sameRange,
  strainGrowth,
  stripModes,
} from "../thermostat";

const WHOLE_DEGREE = 1;
const HALF_DEGREE = 0.5;
const MIN = 60;
const MAX = 80;
const SWEEP = Math.PI / 3;
const CLOSE = 3;

describe("adjustable", () => {
  it("steps the low while heating and the high while cooling", () => {
    expect(adjustable("heat")).toBe("low");
    expect(adjustable("cool")).toBe("high");
  });

  it("steps nothing in auto, off, or a mode it does not know", () => {
    expect(adjustable("auto")).toBeNull();
    expect(adjustable("off")).toBeNull();
    expect(adjustable(null)).toBeNull();
  });
});

describe("modeColour", () => {
  it("is the primary for heat and the secondary for cool, whatever the equipment is doing", () => {
    expect(modeColour("heat", "heating")).toBe("primary");
    expect(modeColour("cool", "cooling")).toBe("secondary");
  });

  it("keeps the mode's colour while the equipment idles", () => {
    expect(modeColour("heat", "idle")).toBe("primary");
    expect(modeColour("cool", "idle")).toBe("secondary");
  });

  it("follows the equipment in auto", () => {
    expect(modeColour("auto", "heating", 70, { low: 64, high: 72 })).toBe("primary");
    expect(modeColour("auto", "cooling", 66, { low: 64, high: 72 })).toBe("secondary");
  });

  it("idling in auto, takes whichever it would do next: the setpoint the house is nearer", () => {
    expect(modeColour("auto", "idle", 66, { low: 64, high: 72 })).toBe("primary");
    expect(modeColour("auto", "idle", 70, { low: 64, high: 72 })).toBe("secondary");
    expect(modeColour("auto", "idle", 68, { low: 64, high: 72 })).toBe("primary");
  });

  it("is grey in auto when it cannot tell which it would do next", () => {
    expect(modeColour("auto", "idle")).toBeNull();
  });

  it("is grey while off or unknown", () => {
    expect(modeColour("off", "off")).toBeNull();
    expect(modeColour(null, null)).toBeNull();
  });
});

describe("running", () => {
  it("is only heating or cooling", () => {
    expect(running("heating")).toBe(true);
    expect(running("cooling")).toBe(true);
    expect(running("idle")).toBe(false);
    expect(running("fan")).toBe(false);
    expect(running(null)).toBe(false);
  });
});

describe("moveSetpoint", () => {
  it("moves the one setpoint and leaves the other", () => {
    expect(moveSetpoint({ low: 64, high: 72 }, "low", 66, WHOLE_DEGREE, MIN, MAX)).toEqual({ low: 66, high: 72 });
    expect(moveSetpoint({ low: 64, high: 72 }, "high", 75.4, WHOLE_DEGREE, MIN, MAX)).toEqual({ low: 64, high: 75.4 });
  });

  it("holds within the thermostat's limits", () => {
    expect(moveSetpoint({ low: 64, high: 72 }, "low", 55, WHOLE_DEGREE, MIN, MAX)).toEqual({ low: 60, high: 72 });
    expect(moveSetpoint({ low: 64, high: 72 }, "high", 85, WHOLE_DEGREE, MIN, MAX)).toEqual({ low: 64, high: 80 });
  });

  it("keeps a step between the low and the high", () => {
    expect(moveSetpoint({ low: 64, high: 72 }, "low", 75, WHOLE_DEGREE, MIN, MAX)).toEqual({ low: 71, high: 72 });
    expect(moveSetpoint({ low: 64, high: 72 }, "high", 62, WHOLE_DEGREE, MIN, MAX)).toEqual({ low: 64, high: 65 });
  });
});

describe("strainGrowth", () => {
  const MOST = 1.6;
  const SOFTNESS = 3;

  it("is its own size with no strain", () => {
    expect(strainGrowth(0, MOST, SOFTNESS)).toBe(1);
    expect(strainGrowth(-2, MOST, SOFTNESS)).toBe(1);
  });

  it("grows with the strain, less with each degree, towards the most and never past it", () => {
    const one = strainGrowth(1, MOST, SOFTNESS);
    const two = strainGrowth(2, MOST, SOFTNESS);
    const far = strainGrowth(100, MOST, SOFTNESS);

    expect(one).toBeGreaterThan(1);
    expect(two - one).toBeLessThan(one - 1);
    expect(far).toBeCloseTo(MOST, CLOSE);
    expect(far).toBeLessThanOrEqual(MOST);
  });
});

describe("nearestHash", () => {
  it("lands on the nearest whole degree", () => {
    expect(nearestHash(67.4)).toBe(67);
    expect(nearestHash(67.6)).toBe(68);
  });
});

describe("dialHashes", () => {
  it("has a hash for every degree, every fifth a long one", () => {
    const hashes = dialHashes(MIN, MAX);

    expect(hashes).toHaveLength(21);
    expect(hashes[0]).toEqual({ value: 60, major: true });
    expect(hashes[1]).toEqual({ value: 61, major: false });
    expect(hashes.filter((hash) => hash.major).map((hash) => hash.value)).toEqual([60, 65, 70, 75, 80]);
  });

  it("starts at the first whole degree inside limits that are not whole", () => {
    expect(dialHashes(7.5, 10).map((hash) => hash.value)).toEqual([8, 9, 10]);
  });
});

describe("dialPosition", () => {
  const SPAN = 20;

  it("puts the selected setpoint in the middle and the rest either side by the span", () => {
    expect(dialPosition(70, 70, SPAN)).toBe(0.5);
    expect(dialPosition(75, 70, SPAN)).toBe(0.75);
    expect(dialPosition(60, 70, SPAN)).toBe(0);
    expect(dialPosition(59, 70, SPAN)).toBeLessThan(0);
  });
});

describe("dialFade", () => {
  it("shows a hash fully in the middle and fades it to nothing at the ends", () => {
    expect(dialFade(0.5)).toBe(1);
    expect(dialFade(0)).toBe(0);
    expect(dialFade(1)).toBe(0);
    expect(dialFade(-0.2)).toBe(0);
    expect(dialFade(0.05)).toBeCloseTo(1 / 3, CLOSE);
  });
});

describe("DialArc", () => {
  const oval = { cx: 0, cy: 0, rx: 100, ry: 150 };
  const arc = new DialArc(oval, SWEEP);

  it("runs from the bottom round the far side to the top", () => {
    const bottom = arc.mark(0);
    const far = arc.mark(0.5);
    const top = arc.mark(1);

    expect(bottom.x).toBeCloseTo(100 * Math.cos(SWEEP), CLOSE);
    expect(bottom.y).toBeCloseTo(150 * Math.sin(SWEEP), CLOSE);
    expect(far.x).toBeCloseTo(100, CLOSE);
    expect(far.y).toBeCloseTo(0, CLOSE);
    expect(top.y).toBeCloseTo(-bottom.y, CLOSE);
  });

  it("points into the oval", () => {
    const far = arc.mark(0.5, 10);

    expect(far.x).toBeCloseTo(90, CLOSE);
    expect(far.nx).toBeCloseTo(-1, CLOSE);
  });

  it("spaces fractions evenly along the curve", () => {
    const steps = [0, 0.25, 0.5].map((fraction) => arc.mark(fraction));
    const first = Math.hypot(steps[1].x - steps[0].x, steps[1].y - steps[0].y);
    const second = Math.hypot(steps[2].x - steps[1].x, steps[2].y - steps[1].y);

    expect(first / second).toBeCloseTo(1, 1);
  });

  it("finds how far along a point is, and holds it to the ends", () => {
    const quarter = arc.mark(0.25);

    expect(arc.fractionToward(quarter.x * 0.5, quarter.y * 0.5)).toBeCloseTo(0.25, CLOSE);
    expect(arc.fractionToward(10, 1000)).toBe(0);
    expect(arc.fractionToward(10, -1000)).toBe(1);
  });
});

describe("decimals", () => {
  it("shows whole degrees for a whole step and a decimal for a finer one", () => {
    expect(decimals(WHOLE_DEGREE)).toBe(0);
    expect(decimals(HALF_DEGREE)).toBe(1);
  });
});

describe("sameRange", () => {
  it("is the same low and high", () => {
    expect(sameRange({ low: 64, high: 72 }, { low: 64, high: 72 })).toBe(true);
    expect(sameRange({ low: 64, high: 72 }, { low: 65, high: 72 })).toBe(false);
    expect(sameRange(null, { low: 64, high: 72 })).toBe(false);
  });
});

describe("stripModes", () => {
  it("offers the four it knows in its own order, of those the thermostat takes", () => {
    expect(stripModes(["auto", "cool", "off", "heat", "dry"])).toEqual(["off", "heat", "cool", "auto"]);
    expect(stripModes(["off", "heat"])).toEqual(["off", "heat"]);
    expect(stripModes(null)).toEqual([]);
  });
});
