import { describe, expect, it } from "vitest";

import { formatTime, parseTime, stepTime } from "../alarm";

const QUARTER = 15;

describe("parseTime", () => {
  it("reads the time an input_datetime holds, seconds and all", () => {
    expect(parseTime("07:30:00")).toEqual({ hours: 7, minutes: 30 });
    expect(parseTime("7:05")).toEqual({ hours: 7, minutes: 5 });
  });

  it("reads nothing from something that is not a time", () => {
    expect(parseTime("unknown")).toBeNull();
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime(null)).toBeNull();
  });
});

describe("formatTime", () => {
  it("pads both halves to two figures", () => {
    expect(formatTime({ hours: 6, minutes: 5 })).toBe("06:05");
  });
});

describe("stepTime", () => {
  it("steps the hours round the day", () => {
    expect(stepTime({ hours: 23, minutes: 0 }, "hours", 1, QUARTER)).toEqual({ hours: 0, minutes: 0 });
    expect(stepTime({ hours: 0, minutes: 0 }, "hours", -1, QUARTER)).toEqual({ hours: 23, minutes: 0 });
  });

  it("steps the minutes round the hour without carrying into it", () => {
    expect(stepTime({ hours: 6, minutes: 45 }, "minutes", 1, QUARTER)).toEqual({ hours: 6, minutes: 0 });
    expect(stepTime({ hours: 6, minutes: 0 }, "minutes", -1, QUARTER)).toEqual({ hours: 6, minutes: 45 });
  });

  it("lands a minute that is off the step on the step it was pressed towards", () => {
    expect(stepTime({ hours: 6, minutes: 10 }, "minutes", 1, QUARTER)).toEqual({ hours: 6, minutes: 15 });
    expect(stepTime({ hours: 6, minutes: 10 }, "minutes", -1, QUARTER)).toEqual({ hours: 6, minutes: 0 });
  });
});
