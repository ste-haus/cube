import { describe, expect, it } from "vitest";

import { adjustable, decimals, modeColour, running, sameRange, stepRange, stripModes } from "../thermostat";

const WHOLE_DEGREE = 1;
const HALF_DEGREE = 0.5;
const MIN = 60;
const MAX = 80;
const UP = 1;
const DOWN = -1;

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

describe("stepRange", () => {
  it("steps the one setpoint and leaves the other", () => {
    expect(stepRange({ low: 64, high: 72 }, "low", UP, WHOLE_DEGREE, MIN, MAX)).toEqual({ low: 65, high: 72 });
    expect(stepRange({ low: 64, high: 72 }, "high", DOWN, WHOLE_DEGREE, MIN, MAX)).toEqual({ low: 64, high: 71 });
  });

  it("holds within the thermostat's limits", () => {
    expect(stepRange({ low: 60, high: 72 }, "low", DOWN, WHOLE_DEGREE, MIN, MAX)).toEqual({ low: 60, high: 72 });
    expect(stepRange({ low: 64, high: 80 }, "high", UP, WHOLE_DEGREE, MIN, MAX)).toEqual({ low: 64, high: 80 });
  });

  it("keeps a step between the low and the high", () => {
    expect(stepRange({ low: 70, high: 71 }, "low", UP, WHOLE_DEGREE, MIN, MAX)).toEqual({ low: 70, high: 71 });
    expect(stepRange({ low: 70, high: 71 }, "high", DOWN, WHOLE_DEGREE, MIN, MAX)).toEqual({ low: 70, high: 71 });
  });

  it("lands a setpoint set elsewhere back on the step", () => {
    expect(stepRange({ low: 64.3, high: 72 }, "low", UP, HALF_DEGREE, MIN, MAX)).toEqual({ low: 65, high: 72 });
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
