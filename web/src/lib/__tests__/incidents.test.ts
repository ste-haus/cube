import { describe, expect, it } from "vitest";

import { bannerText, byCriticality, incidentsOf, incidentTime, roadOf, wantsLightType, worstSeverity } from "../incidents";

const LABELS = {
  incidents: "Active incidents",
  incidents_other: "and {count} other",
  incidents_others: "and {count} others",
  incidents_unnamed: "Unnamed road",
};

function incident(road: string | null, criticality = "minor", extra: Record<string, unknown> = {}) {
  return { road, criticality, ...extra };
}

describe("incidentsOf", () => {
  it("reads nothing from anything but a list", () => {
    expect(incidentsOf(null)).toEqual([]);
    expect(incidentsOf("[]")).toEqual([]);
  });

  it("skips entries that are not records and blanks empty text", () => {
    const [only, ...rest] = incidentsOf([incident(" "), 4, null]);

    expect(rest).toEqual([]);
    expect(only.road).toBeNull();
    expect(only.road_closed).toBe(false);
  });
});

describe("worstSeverity", () => {
  it("is minor while every incident is", () => {
    expect(worstSeverity(incidentsOf([incident("A"), incident("B", "lowImpact")]))).toBe("minor");
  });

  it("is the worst of them", () => {
    expect(worstSeverity(incidentsOf([incident("A"), incident("B", "major")]))).toBe("major");
    expect(worstSeverity(incidentsOf([incident("A", "critical"), incident("B", "major")]))).toBe("critical");
  });

  it("is minor with none", () => {
    expect(worstSeverity([])).toBe("minor");
  });

  it("counts an unknown criticality as minor", () => {
    expect(worstSeverity(incidentsOf([incident("A", "dire")]))).toBe("minor");
  });
});

describe("wantsLightType", () => {
  it("keeps dark type on the master warning's red and the panel's own colours", () => {
    expect(wantsLightType("#ff3030")).toBe(false);
    expect(wantsLightType("#f205f2")).toBe(false);
    expect(wantsLightType("#00bfff")).toBe(false);
  });

  it("takes light type on a deep red", () => {
    expect(wantsLightType("#a00000")).toBe(true);
  });

  it("keeps dark type on a colour it cannot read", () => {
    expect(wantsLightType("var(--color-primary)")).toBe(false);
  });
});

describe("byCriticality", () => {
  it("puts the worst first and otherwise keeps the order", () => {
    const sorted = byCriticality(incidentsOf([incident("A"), incident("B", "critical"), incident("C"), incident("D", "major")]));

    expect(sorted.map((item) => item.road)).toEqual(["B", "D", "A", "C"]);
  });
});

describe("roadOf", () => {
  it("falls back to the location, then the summary, then the label", () => {
    const [location, summary, nothing] = incidentsOf([
      incident(null, "minor", { location: "At exit 4" }),
      incident(null, "minor", { summary: "Crash" }),
      incident(null),
    ]);

    expect(roadOf(location, LABELS.incidents_unnamed)).toBe("At exit 4");
    expect(roadOf(summary, LABELS.incidents_unnamed)).toBe("Crash");
    expect(roadOf(nothing, LABELS.incidents_unnamed)).toBe("Unnamed road");
  });
});

describe("bannerText", () => {
  it("names one road", () => {
    expect(bannerText(incidentsOf([incident("I-135")]), LABELS)).toBe("Active incidents: I-135");
  });

  it("names up to three roads, worst first, each once", () => {
    const incidents = incidentsOf([incident("I-135"), incident("K-96", "major"), incident("I-135"), incident("US-54")]);

    expect(bannerText(incidents, LABELS)).toBe("Active incidents: K-96, I-135, US-54");
  });

  it("counts one road past three as another", () => {
    const incidents = incidentsOf(["A", "B", "C", "D"].map((road) => incident(road)));

    expect(bannerText(incidents, LABELS)).toBe("Active incidents: A, B, C, and 1 other");
  });

  it("counts roads past three as others", () => {
    const incidents = incidentsOf(["A", "B", "C", "D", "E", "D"].map((road) => incident(road)));

    expect(bannerText(incidents, LABELS)).toBe("Active incidents: A, B, C, and 2 others");
  });
});

describe("incidentTime", () => {
  const NOW = new Date(2026, 9, 5, 9, 0);

  it("gives a time of day for today", () => {
    expect(incidentTime(new Date(2026, 9, 5, 7, 42).toISOString(), NOW)).toBe("07:42");
  });

  it("gives the date for another day", () => {
    expect(incidentTime(new Date(2026, 8, 28, 22, 5).toISOString(), NOW)).toBe("28 Sep 22:05");
  });

  it("gives nothing for nothing", () => {
    expect(incidentTime(null, NOW)).toBeNull();
    expect(incidentTime("soon", NOW)).toBeNull();
  });
});
