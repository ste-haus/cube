import { describe, expect, it } from "vitest";

import { alertTime, elapsedLabel, masterLook, offsetLabel, readAlerts, tierSince } from "../mcw";

const LEAK = {
  entity_id: "binary_sensor.mcw_warning_water_leak",
  message: "Water leak: Kitchen sink",
  triggered: "2026-09-29T04:20:20.130334+00:00",
  cleared: false,
};

describe("reading a master's alerts", () => {
  it("keeps each alert as Home Assistant listed it", () => {
    expect(readAlerts([LEAK])).toEqual([LEAK]);
  });

  it("reads anything but a list as no alerts", () => {
    expect(readAlerts(null)).toEqual([]);
    expect(readAlerts("[]")).toEqual([]);
  });

  it("leaves out an alert with nothing to say", () => {
    expect(readAlerts([{ entity_id: LEAK.entity_id }, LEAK])).toEqual([LEAK]);
  });

  it("reads a missing trigger time as none, and anything but true as not cleared", () => {
    expect(readAlerts([{ ...LEAK, triggered: "", cleared: "true" }])).toEqual([
      { ...LEAK, triggered: null, cleared: false },
    ]);
  });
});

describe("how a master looks", () => {
  it("is lit while its tier has an uncleared alert", () => {
    expect(masterLook(true, readAlerts([LEAK]))).toBe("lit");
  });

  it("goes dark but stays while its cleared alerts are still active", () => {
    expect(masterLook(false, readAlerts([{ ...LEAK, cleared: true }]))).toBe("dark");
  });

  it("is not there at all with no alerts", () => {
    expect(masterLook(false, [])).toBe("hidden");
  });
});

describe("when an alert triggered", () => {
  it("writes an offset the way a clock reads it", () => {
    expect(offsetLabel(120)).toBe("+02:00");
    expect(offsetLabel(-210)).toBe("-03:30");
    expect(offsetLabel(0)).toBe("+00:00");
  });

  it("says nothing for a time it cannot read", () => {
    expect(alertTime(null)).toBe("");
    expect(alertTime("not a time")).toBe("");
  });

  it("ends in the zone it is written in", () => {
    expect(alertTime(LEAK.triggered)).toMatch(/^\w{3} \d{1,2}, \d{2}:\d{2} \S+$/);
  });
});

describe("how long a tier has been up", () => {
  const since = new Date("2026-09-29T04:00:00Z");

  it("counts from the oldest alert still on the list, cleared or not", () => {
    const older = { ...LEAK, triggered: since.toISOString(), cleared: true };

    expect(tierSince(readAlerts([LEAK, older]))).toEqual(since);
  });

  it("has no start when no alert says when it triggered", () => {
    expect(tierSince(readAlerts([{ ...LEAK, triggered: "" }]))).toBeNull();
  });

  it("reads as mission elapsed time", () => {
    expect(elapsedLabel(since, new Date("2026-09-29T05:02:03Z"))).toBe("T+01:02:03");
  });

  it("runs past a day rather than rolling over", () => {
    expect(elapsedLabel(since, new Date("2026-10-01T04:00:00Z"))).toBe("T+48:00:00");
  });

  it("never runs backwards on a clock that is behind", () => {
    expect(elapsedLabel(since, new Date("2026-09-29T03:59:00Z"))).toBe("T+00:00:00");
  });
});
