import { describe, expect, it } from "vitest";
import { firstAddressLine, routeCachedAt, routeSummary } from "../routes";

const ADDRESS = "123 Example Street";
const MULTILINE_ADDRESS = `${ADDRESS}\nBellingham, WA`;
const COMMA_ADDRESS = `${ADDRESS}, Bellingham, WA`;
const TIMESTAMP = new Date("2026-10-27T17:04:09").toISOString();
const FORMATTED_TIMESTAMP = "2026-10-27 17:04:09";
const UNKNOWN = "Unknown";

describe("route details", () => {
  it("uses the first line or first comma, whichever comes first", () => {
    expect(firstAddressLine(MULTILINE_ADDRESS)).toBe(ADDRESS);
    expect(firstAddressLine(COMMA_ADDRESS)).toBe(ADDRESS);
    expect(firstAddressLine(`  ${COMMA_ADDRESS}\nUSA  `)).toBe(ADDRESS);
  });

  it("uses a zone name without an address and handles missing addresses", () => {
    expect(firstAddressLine("Home")).toBe("Home");
    expect(firstAddressLine(null)).toBe("Unknown destination");
  });

  it("shows the destination, distance and via count in that order", () => {
    expect(routeSummary({ destination_address: COMMA_ADDRESS, length_m: 14144, via_count: 2 }))
      .toBe(`${ADDRESS} · 14.1 km · via 2 points`);
  });

  it("formats cache timestamps in local YYYY-MM-DD HH:mm:ss", () => {
    expect(routeCachedAt(TIMESTAMP)).toBe(FORMATTED_TIMESTAMP);
    expect(routeCachedAt(TIMESTAMP)).not.toContain("PM");
  });

  it("handles missing and invalid cache timestamps", () => {
    expect(routeCachedAt(null)).toBe(UNKNOWN);
    expect(routeCachedAt("invalid")).toBe(UNKNOWN);
  });
});
