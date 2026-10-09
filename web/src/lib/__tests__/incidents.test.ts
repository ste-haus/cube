import { describe, expect, it } from "vitest";

import {
  bannerText,
  byCriticality,
  incidentIcon,
  incidentsOf,
  incidentsTitle,
  incidentTime,
  incidentWhen,
  roadOf,
  typeName,
  wantsLightType,
  worstSeverity,
} from "../incidents";

const LABELS = {
  incidents: "Active incidents",
  incidents_other: "and {count} other",
  incidents_others: "and {count} others",
  incidents_unnamed: "Unnamed road",
  incidents_type_unknown: "Incident",
};

function incident(
  road: string | null,
  criticality = "minor",
  extra: Record<string, unknown> = {},
) {
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
    expect(
      worstSeverity(incidentsOf([incident("A"), incident("B", "lowImpact")])),
    ).toBe("minor");
  });

  it("is the worst of them", () => {
    expect(
      worstSeverity(incidentsOf([incident("A"), incident("B", "major")])),
    ).toBe("major");
    expect(
      worstSeverity(
        incidentsOf([incident("A", "critical"), incident("B", "major")]),
      ),
    ).toBe("critical");
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
    const sorted = byCriticality(
      incidentsOf([
        incident("A"),
        incident("B", "critical"),
        incident("C"),
        incident("D", "major"),
      ]),
    );

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

describe("typeName", () => {
  it("splits HERE's camelCase into words", () => {
    expect(
      typeName(
        incidentsOf([incident("A", "minor", { type: "disabledVehicle" })])[0],
        "Incident",
      ),
    ).toBe("Disabled vehicle");
    expect(
      typeName(
        incidentsOf([incident("A", "minor", { type: "construction" })])[0],
        "Incident",
      ),
    ).toBe("Construction");
  });

  it("falls back for an incident with no type", () => {
    expect(typeName(incidentsOf([incident("A")])[0], "Incident")).toBe(
      "Incident",
    );
  });
});

describe("incidentsTitle", () => {
  it("calls a lone incident by its type", () => {
    expect(
      incidentsTitle(
        incidentsOf([incident("A", "minor", { type: "roadHazard" })]),
        LABELS,
      ),
    ).toBe("Road hazard");
  });

  it("calls several of them incidents, whatever their types", () => {
    const incidents = incidentsOf([
      incident("A", "minor", { type: "accident" }),
      incident("B", "minor", { type: "accident" }),
    ]);

    expect(incidentsTitle(incidents, LABELS)).toBe("Active incidents");
  });
});

describe("incidentIcon", () => {
  it("digs for construction", () => {
    expect(
      incidentIcon(
        incidentsOf([incident("A", "minor", { type: "construction" })])[0],
      ),
    ).toBe("mdi:bulldozer");
  });
});

describe("bannerText", () => {
  it("names a lone incident by its type, and its road", () => {
    expect(
      bannerText(
        incidentsOf([incident("I-135", "minor", { type: "disabledVehicle" })]),
        LABELS,
      ),
    ).toBe("Disabled vehicle: I-135");
  });

  it("names a lone incident with no type as an incident", () => {
    expect(bannerText(incidentsOf([incident("I-135")]), LABELS)).toBe(
      "Incident: I-135",
    );
  });

  it("names up to three roads, worst first, each once", () => {
    const incidents = incidentsOf([
      incident("I-135"),
      incident("K-96", "major"),
      incident("I-135"),
      incident("US-54"),
    ]);

    expect(bannerText(incidents, LABELS)).toBe(
      "Active incidents: K-96, I-135, US-54",
    );
  });

  it("counts one road past three as another", () => {
    const incidents = incidentsOf(
      ["A", "B", "C", "D"].map((road) => incident(road)),
    );

    expect(bannerText(incidents, LABELS)).toBe(
      "Active incidents: A, B, C, and 1 other",
    );
  });

  it("counts roads past three as others", () => {
    const incidents = incidentsOf(
      ["A", "B", "C", "D", "E", "D"].map((road) => incident(road)),
    );

    expect(bannerText(incidents, LABELS)).toBe(
      "Active incidents: A, B, C, and 2 others",
    );
  });
});

describe("incidentTime", () => {
  const NOW = new Date(2026, 9, 5, 9, 0);

  it("gives a time of day for today", () => {
    expect(incidentTime(new Date(2026, 9, 5, 7, 42).toISOString(), NOW)).toBe(
      "07:42",
    );
  });

  it("gives the date for another day", () => {
    expect(incidentTime(new Date(2026, 8, 28, 22, 5).toISOString(), NOW)).toBe(
      "Sep 28 22:05",
    );
  });

  it("gives nothing for nothing", () => {
    expect(incidentTime(null, NOW)).toBeNull();
    expect(incidentTime("soon", NOW)).toBeNull();
  });
});

describe("incidentWhen", () => {
  // A Monday.
  const NOW = new Date(2026, 9, 5, 11, 22);
  const WHEN_LABELS = {
    minutes: "min",
    incidents_hours: "hr",
    incidents_today: "Today",
    incidents_since: "Since",
    incidents_until: "until",
    incidents_range: "{start} to {end}",
    incidents_clears_in: "Clears in ~{duration}",
    incidents_clears_on: "Clears {day}",
    incidents_cleared_at: "Should have cleared at {time}",
    incidents_cleared_on: "Should have cleared {day}",
    incidents_starts_in: "Starts in {duration}",
    incidents_starts_on: "Starts {day}",
    incidents_ongoing: "ongoing since {day}",
  };

  function when(start: Date | null, end: Date | null) {
    const [only] = incidentsOf([
      incident("I-135", "minor", {
        start_time: start?.toISOString() ?? null,
        end_time: end?.toISOString() ?? null,
      }),
    ]);

    return incidentWhen(only, NOW, WHEN_LABELS);
  }

  const at = (day: number, hour: number, minute = 0) =>
    new Date(2026, 9, day, hour, minute);

  it("counts down one of a day or less, with its times", () => {
    expect(when(at(5, 11, 0), at(5, 12, 37))).toBe(
      "Clears in ~1 hr 15 min (11:00 to 12:37)",
    );
    expect(when(at(5, 11, 0), at(5, 12, 7))).toBe(
      "Clears in ~45 min (11:00 to 12:07)",
    );
    expect(when(at(5, 11, 0), at(5, 13, 22))).toBe(
      "Clears in ~2 hr (11:00 to 13:22)",
    );
  });

  it("rounds a part minute up", () => {
    const end = new Date(NOW.getTime() + 30_000);

    expect(when(at(5, 11, 0), end)).toBe(
      "Clears in ~1 min (11:00 to 11:22)",
    );
  });

  it("gives no dates for one that crosses midnight", () => {
    expect(when(at(4, 23, 40), at(5, 13, 10))).toBe(
      "Clears in ~1 hr 48 min (23:40 to 13:10)",
    );
  });

  it("tells an ongoing one by the day it clears", () => {
    expect(when(at(1, 16, 7), at(5, 18, 0))).toBe(
      "Clears Today (ongoing since Oct 1)",
    );
    expect(when(at(1, 16, 7), at(9, 10, 0))).toBe(
      "Clears Friday (ongoing since Oct 1)",
    );
    expect(when(at(1, 16, 7), at(12, 10, 0))).toBe(
      "Clears Oct 12 (ongoing since Oct 1)",
    );
  });

  it("gives the time an ongoing one began today", () => {
    expect(when(at(5, 8, 0), at(9, 10, 0))).toBe(
      "Clears Friday (ongoing since 08:00)",
    );
  });

  it("says one past its end should have cleared", () => {
    expect(when(at(5, 11, 0), at(5, 11, 15))).toBe(
      "Should have cleared at 11:15",
    );
    expect(when(at(1, 16, 7), at(5, 10, 0))).toBe(
      "Should have cleared at 10:00 (ongoing since Oct 1)",
    );
    expect(when(at(1, 16, 7), at(3, 10, 0))).toBe(
      "Should have cleared Oct 3 (ongoing since Oct 1)",
    );
  });

  it("gives only the end of one with no start", () => {
    expect(when(null, at(5, 11, 47))).toBe(
      "Clears in ~25 min (until 11:47)",
    );
    expect(when(null, at(9, 10, 0))).toBe("Clears Friday");
  });

  it("says when one yet to begin starts", () => {
    expect(when(at(5, 14, 22), at(5, 16, 0))).toBe(
      "Starts in 3 hr (14:22 to 16:00)",
    );
    expect(when(at(8, 14, 0), at(8, 16, 0))).toBe(
      "Starts Thursday (14:00 to 16:00)",
    );
    expect(when(at(5, 20, 0), at(20, 6, 0))).toBe(
      "Starts in 8 hr 38 min (until Oct 20)",
    );
  });

  it("gives only the start of one with no end", () => {
    expect(when(at(5, 11, 0), null)).toBe("Since 11:00");
    expect(when(at(1, 16, 7), null)).toBe("Since Oct 1 16:07");
    expect(when(null, null)).toBeNull();
  });
});
