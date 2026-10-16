import { describe, expect, it } from "vitest";

import { averaged, bootedAt, BUSY, CAUTION, FULL, RESTING, loadOf, END, INTERCHANGE, STOP, TAP, TERMINUS, WARNING, formatLatency, formatRuntime, formatSpan, formatStat, heartbeatSlices, layoutMap, routeBetween, tierOf, uptimeSlices } from "../network";
import type { HistoryState, NetworkStop } from "../types";

function stop(name: string, extra: Partial<NetworkStop> = {}): NetworkStop {
  return {
    name,
    name_entity_id: null,
    entity_id: null,
    up_states: ["on"],
    latency_entity_id: null,
    tap: false,
    branches: [],
    ...extra,
  };
}

describe("layoutMap", () => {
  const map = {
    upstream: [stop("one"), stop("two")],
    line: [
      stop("head"),
      stop("dns", { tap: true }),
      stop("router", { branches: [stop("outer"), stop("hub", { branches: [stop("a"), stop("b")] }), stop("inner")] }),
      stop("last"),
    ],
  };
  const layout = layoutMap(map);
  const row = (name: string) => layout.rows.find((each) => each.stop.name === name)!;
  const at = (name: string) => layout.rows.indexOf(row(name));

  it("puts the upstream above the head, each on its own rail", () => {
    expect(layout.rows.slice(0, 2).map((each) => [each.stop.name, each.rail, each.kind])).toEqual([
      ["one", 0, TERMINUS],
      ["two", 1, TERMINUS],
    ]);
    expect(row("head")).toMatchObject({ kind: INTERCHANGE, span: 2 });
  });

  it("leaves a hub on the rails beside it, side by side, the first branch outermost", () => {
    expect(["outer", "hub", "inner"].map((name) => row(name).rail)).toEqual([3, 2, 1]);
  });

  it("takes the rails beside a branch afresh, since the outer ones have ended", () => {
    expect(["a", "b"].map((name) => row(name).rail)).toEqual([4, 3]);
    expect(layout.rails).toBe(5);
  });

  it("names each kind of stop", () => {
    expect(row("dns").kind).toBe(TAP);
    expect(row("router")).toMatchObject({ kind: INTERCHANGE, span: 4 });
    expect(row("hub")).toMatchObject({ kind: INTERCHANGE, span: 3 });
    expect(row("last").kind).toBe(END);
    expect(layoutMap({ upstream: [], line: [stop("solo"), stop("next"), stop("end")] }).rows[1].kind).toBe(STOP);
  });

  it("gives every stop its own rail from where it leaves", () => {
    const into = (name: string) => layout.segments.find((segment) => segment.stop.name === name)!;

    expect(into("outer")).toMatchObject({ from: at("router"), to: at("outer"), turns: true });
    expect(into("a")).toMatchObject({ from: at("hub"), turns: true });
    expect(into("hub").turns).toBe(false);
  });

  it("runs the line through a tap to the next stop, in that stop's colour", () => {
    const into = layout.segments.find((segment) => segment.stop.name === "router")!;

    expect([into.from, into.to]).toEqual([at("head"), at("router")]);
    expect(layout.segments.some((segment) => segment.stop.name === "dns")).toBe(false);
  });
});

describe("a tap among a hub's branches", () => {
  const layout = layoutMap({
    upstream: [],
    line: [stop("head"), stop("gateway", { branches: [stop("dns", { tap: true }), stop("a"), stop("b")] })],
  });

  it("sits just under the hub and takes no rail of its own", () => {
    expect(layout.rows.map((row) => [row.stop.name, row.kind, row.rail])).toEqual([
      ["head", STOP, 0],
      ["gateway", INTERCHANGE, 0],
      ["dns", TAP, 0],
      ["a", TERMINUS, 2],
      ["b", TERMINUS, 1],
    ]);
    expect(layout.rows[1].span).toBe(3);
  });
});

describe("routeBetween", () => {
  const layout = layoutMap({
    upstream: [stop("cloud")],
    line: [
      stop("head"),
      stop("dns", { tap: true }),
      stop("router", { branches: [stop("nas"), stop("hub", { branches: [stop("a"), stop("b")] })] }),
      stop("last"),
    ],
  });
  const at = (name: string) => layout.rows.findIndex((row) => row.stop.name === name);
  const named = (steps: { segment: number; reverse: boolean }[] | null) =>
    steps?.map(({ segment, reverse }) => `${reverse ? "^" : "v"}${layout.segments[segment].stop.name}`);

  it("climbs to the shared hub and comes down the other side", () => {
    expect(named(routeBetween(layout, at("a"), at("nas")))).toEqual(["^a", "^hub", "vnas"]);
  });

  it("runs the line from the house out to the internet", () => {
    expect(named(routeBetween(layout, at("b"), at("cloud")))).toEqual(["^b", "^hub", "^router", "vcloud"]);
  });

  it("goes straight down when one is under the other", () => {
    expect(named(routeBetween(layout, at("head"), at("last")))).toEqual(["vrouter", "vlast"]);
  });

  it("has no route to or from a tap, or to itself", () => {
    expect(routeBetween(layout, at("dns"), at("a"))).toBeNull();
    expect(routeBetween(layout, at("a"), at("a"))).toBeNull();
  });
});

describe("uptimeSlices", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();

  it("splits the time spent up across the slices", () => {
    const history: HistoryState[] = [
      { state: "on", last_changed: at(5) },
      { state: "off", last_changed: at(3) },
      { state: "on", last_changed: at(2.5) },
    ];

    expect(uptimeSlices(history, ["on"], now, 4, 4)).toEqual([1, 0.5, 1, 1]);
  });

  it("leaves a slice Home Assistant knew nothing of as null", () => {
    expect(uptimeSlices([{ state: "on", last_changed: at(1) }], ["on"], now, 2, 2)).toEqual([null, 1]);
  });
});

describe("heartbeatSlices", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const beatsBetween = (fromMinutesAgo: number, toMinutesAgo: number): HistoryState[] =>
    Array.from({ length: fromMinutesAgo - toMinutesAgo }, (_, index) => ({
      state: "beat",
      last_changed: new Date(now.getTime() - (fromMinutesAgo - index) * 60_000).toISOString(),
    }));

  it("is up for a slice that got every beat", () => {
    expect(heartbeatSlices(beatsBetween(120, 0), now, 2, 2, 60)).toEqual([1, 1]);
  });

  it("reads a gap in the beats as time down", () => {
    const history = [...beatsBetween(120, 90), ...beatsBetween(60, 0)];

    expect(heartbeatSlices(history, now, 2, 2, 60)).toEqual([0.5, 1]);
  });

  it("is down for a slice with no beats at all", () => {
    expect(heartbeatSlices(beatsBetween(60, 0), now, 2, 2, 60)).toEqual([0, 1]);
  });
});

describe("averaged", () => {
  const now = new Date("2026-10-15T12:00:00Z").getTime();
  const hoursAgo = (hours: number) => now - hours * 3_600_000;

  it("means each stretch, placed at its middle", () => {
    const readings = [
      { at: hoursAgo(1.9), value: 70 },
      { at: hoursAgo(1.1), value: 74 },
      { at: hoursAgo(0.5), value: 80 },
    ];

    expect(averaged(readings, now, 2, 2)).toEqual([
      { at: hoursAgo(1.5), value: 72 },
      { at: hoursAgo(0.5), value: 80 },
    ]);
  });

  it("carries the last reading through a quiet stretch, and leaves out one before any", () => {
    const readings = [{ at: hoursAgo(2.5), value: 70 }, { at: hoursAgo(0.5), value: 76 }];

    expect(averaged(readings, now, 2, 2).map((point) => point.value)).toEqual([70, 76]);
    expect(averaged([{ at: hoursAgo(0.5), value: 76 }], now, 2, 2).map((point) => point.value)).toEqual([76]);
  });
});

describe("loadOf", () => {
  it("rests under half, is busy to three quarters, and full past them", () => {
    expect(loadOf(0.49, 0.5, 0.75)).toBe(RESTING);
    expect(loadOf(0.5, 0.5, 0.75)).toBe(BUSY);
    expect(loadOf(0.74, 0.5, 0.75)).toBe(BUSY);
    expect(loadOf(0.75, 0.5, 0.75)).toBe(FULL);
  });
});

describe("tierOf", () => {
  it("is a caution from its threshold and a warning from the next", () => {
    expect(tierOf(89.9, 90, 100)).toBeNull();
    expect(tierOf(90, 90, 100)).toBe(CAUTION);
    expect(tierOf(100, 90, 100)).toBe(WARNING);
  });

  it("is nothing without a reading or a threshold", () => {
    expect(tierOf(null, 90, 100)).toBeNull();
    expect(tierOf(120, null, null)).toBeNull();
    expect(tierOf(95, null, 100)).toBeNull();
  });
});

describe("formatting", () => {
  it("reads latency finely while small", () => {
    expect(formatLatency(0.487)).toBe("0.5");
    expect(formatLatency(82.3)).toBe("82");
  });

  it("reads a stat grouped, to its places, with its unit", () => {
    expect(formatStat("8188", 0, null)).toBe((8188).toLocaleString());
    expect(formatStat("0.8146", 1, "%")).toBe(`${(0.8).toLocaleString(undefined, { minimumFractionDigits: 1 })}%`);
    expect(formatStat("unknown", 0, null)).toBeNull();
    expect(formatStat(null, 0, null)).toBeNull();
  });

  it("reads a span in its two largest units", () => {
    const minute = 60_000;

    expect(formatSpan(30_000)).toBe("<1m");
    expect(formatSpan(4 * minute)).toBe("4m");
    expect(formatSpan((5 * 60 + 12) * minute)).toBe("5h 12m");
    expect(formatSpan((12 * 24 + 4) * 60 * minute)).toBe("12d 4h");
  });

  it("reads a span in its largest unit alone when asked", () => {
    const hour = 3_600_000;

    expect(formatSpan((86 * 24 + 9) * hour, 1)).toBe("86d");
    expect(formatSpan(5.5 * hour, 1)).toBe("5h");
  });

  it("reads a boot time with a zone as given, and one without as local", () => {
    expect(bootedAt("2026-10-11T18:58:58+00:00")?.toISOString()).toBe("2026-10-11T18:58:58.000Z");
    expect(bootedAt("2026-10-14 11:12:34")?.getTime()).toBe(new Date(2026, 9, 14, 11, 12, 34).getTime());
    expect(bootedAt("unknown")).toBeNull();
    expect(bootedAt(null)).toBeNull();
  });

  it("reads runtime as minutes, then hours", () => {
    expect(formatRuntime(1320)).toBe("22 min");
    expect(formatRuntime(5400)).toBe("1:30");
  });
});
