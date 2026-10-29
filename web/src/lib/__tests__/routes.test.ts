import { describe, expect, it } from "vitest";
import { ageOf, ageText, firstAddressLine, wholeAge, routeCachedAt, routeDistance, routeQuestion, routeSummary, routeUnit } from "../routes";
import type { Labels } from "../types";

const ADDRESS = "123 Example Street";
const MULTILINE_ADDRESS = `${ADDRESS}\nBellingham, WA`;
const COMMA_ADDRESS = `${ADDRESS}, Bellingham, WA`;
// Wednesday, Oct 28 2026, 21:30 local; every date below is local too, so the zone the tests run in
// doesn't matter
const NOW = new Date(2026, 9, 28, 21, 30);
const at = (year: number, month: number, day: number, hour = 2, minute = 12) =>
  new Date(year, month - 1, day, hour, minute).toISOString();
const LABELS = {
  route_tools_via: "via {count} points",
  route_tools_cached: "Cached {when}",
  route_tools_when: "{day} · {time}",
  route_tools_age: "{age} ago · {weekday} {time}",
  route_tools_today: "today",
  route_tools_yesterday: "yesterday",
  route_tools_just_now: "just now",
  route_tools_day: "day",
  route_tools_days: "days",
  route_tools_week: "week",
  route_tools_weeks: "weeks",
  route_tools_month: "month",
  route_tools_months: "months",
  route_tools_year: "year",
  route_tools_years: "years",
  route_tools_confirm: "Replace {day}'s route?",
  route_tools_confirm_age: "Replace the route from {age} ago?",
  route_tools_confirm_unknown: "Replace this route?",
  route_tools_unknown: "Unknown",
  route_tools_unknown_destination: "Unknown destination",
} as Labels;

describe("route details", () => {
  it("uses the first line or first comma, whichever comes first", () => {
    expect(firstAddressLine(MULTILINE_ADDRESS, LABELS)).toBe(ADDRESS);
    expect(firstAddressLine(COMMA_ADDRESS, LABELS)).toBe(ADDRESS);
    expect(firstAddressLine(`  ${COMMA_ADDRESS}\nUSA  `, LABELS)).toBe(ADDRESS);
  });

  it("uses a zone name without an address and the label for a missing one", () => {
    expect(firstAddressLine("Home", LABELS)).toBe("Home");
    expect(firstAddressLine(null, LABELS)).toBe("Unknown destination");
  });

  it("shows the destination, distance and via count in that order", () => {
    expect(routeSummary({ destination_address: COMMA_ADDRESS, length_m: 14144, via_count: 2 }, "km", LABELS))
      .toBe(`${ADDRESS} · 14.1 km · via 2 points`);
  });

  it("shows distance in the unit it is given", () => {
    expect(routeDistance(16093.44, "mi", LABELS)).toBe("10.0 mi");
    expect(routeDistance(null, "mi", LABELS)).toBe("Unknown");
  });

  it("takes the first distance unit it knows, else kilometres", () => {
    expect(routeUnit([undefined, "mi", "km"])).toBe("mi");
    expect(routeUnit(["m", null])).toBe("km");
    expect(routeUnit([])).toBe("km");
  });

  it("tells a base by how long ago, with its weekday and time once older than yesterday", () => {
    expect(routeCachedAt(new Date(NOW.getTime() - 30_000).toISOString(), NOW, LABELS)).toBe("Cached just now");
    expect(routeCachedAt(at(2026, 10, 28, 9, 15), NOW, LABELS)).toBe("Cached today · 09:15");
    expect(routeCachedAt(at(2026, 10, 27, 10, 4), NOW, LABELS)).toBe("Cached yesterday · 10:04");
    expect(routeCachedAt(at(2026, 10, 27, 23, 59), NOW, LABELS)).toBe("Cached yesterday · 23:59");
    expect(routeCachedAt(at(2026, 10, 25, 14, 30), NOW, LABELS)).toBe("Cached 3 days ago · Sun 14:30");
    expect(routeCachedAt(at(2026, 10, 20), NOW, LABELS)).toBe("Cached 8 days ago · Tue 02:12");
  });

  it("moves to weeks at two weeks, then to months and years", () => {
    expect(routeCachedAt(at(2026, 10, 15), NOW, LABELS)).toBe("Cached 13 days ago · Thu 02:12");
    expect(routeCachedAt(at(2026, 10, 14), NOW, LABELS)).toBe("Cached 2 weeks ago · Wed 02:12");
    expect(routeCachedAt(at(2026, 9, 29), NOW, LABELS)).toBe("Cached 4 weeks ago · Tue 02:12");
    expect(routeCachedAt(at(2026, 9, 28), NOW, LABELS)).toBe("Cached 1 month ago · Mon 02:12");
    expect(routeCachedAt(at(2026, 7, 1), NOW, LABELS)).toBe("Cached 3 months ago · Wed 02:12");
    expect(routeCachedAt(at(2025, 10, 28), NOW, LABELS)).toBe("Cached 1 year ago · Tue 02:12");
    expect(routeCachedAt(at(2024, 7, 16), NOW, LABELS)).toBe("Cached 2 years ago · Tue 02:12");
  });

  it("counts across New Year by its days, not its year", () => {
    const newYear = new Date(2027, 0, 2, 9, 0);
    expect(routeCachedAt(at(2026, 12, 30), newYear, LABELS)).toBe("Cached 3 days ago · Wed 02:12");
  });

  it("handles missing and invalid cache timestamps", () => {
    expect(routeCachedAt(null, NOW, LABELS)).toBe("Cached Unknown");
    expect(routeCachedAt("invalid", NOW, LABELS)).toBe("Cached Unknown");
  });

  it("asks by today or yesterday, else by age, never by year", () => {
    expect(routeQuestion(at(2026, 10, 28), NOW, LABELS)).toBe("Replace today's route?");
    expect(routeQuestion(at(2026, 10, 27), NOW, LABELS)).toBe("Replace yesterday's route?");
    expect(routeQuestion(at(2026, 10, 25), NOW, LABELS)).toBe("Replace the route from 3 days ago?");
    expect(routeQuestion(at(2026, 10, 14), NOW, LABELS)).toBe("Replace the route from 2 weeks ago?");
    expect(routeQuestion(at(2024, 7, 16), NOW, LABELS)).toBe("Replace the route from 2 years ago?");
    expect(routeQuestion(null, NOW, LABELS)).toBe("Replace this route?");
  });
});

describe("route age", () => {
  it("counts whole months, then the days left over", () => {
    expect(ageOf(new Date(2026, 6, 1), new Date(2026, 9, 28))).toEqual({ years: 0, months: 3, days: 27 });
    expect(ageOf(new Date(2025, 11, 15), new Date(2026, 0, 10))).toEqual({ years: 0, months: 0, days: 26 });
    expect(ageOf(new Date(2026, 9, 28, 23, 0), new Date(2026, 9, 28, 1, 0))).toEqual({ years: 0, months: 0, days: 0 });
  });

  it("keeps a month on from a long month's end to the shorter month's last day", () => {
    expect(ageOf(new Date(2026, 0, 31), new Date(2026, 1, 28))).toEqual({ years: 0, months: 1, days: 0 });
    expect(ageOf(new Date(2026, 0, 31), new Date(2026, 2, 1))).toEqual({ years: 0, months: 1, days: 1 });
    expect(ageOf(new Date(2024, 1, 29), new Date(2025, 1, 28))).toEqual({ years: 1, months: 0, days: 0 });
  });

  it("says one unit, singular for one", () => {
    expect(ageText({ count: 1, unit: "week" }, LABELS)).toBe("1 week");
    expect(ageText({ count: 3, unit: "month" }, LABELS)).toBe("3 months");
  });

  it("takes the largest whole unit", () => {
    expect(wholeAge(new Date(2026, 9, 21), NOW)).toEqual({ count: 7, unit: "day" });
    expect(wholeAge(new Date(2026, 9, 7), NOW)).toEqual({ count: 3, unit: "week" });
    expect(wholeAge(new Date(2025, 9, 29), NOW)).toEqual({ count: 11, unit: "month" });
  });
});
