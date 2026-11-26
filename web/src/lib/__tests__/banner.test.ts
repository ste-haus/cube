import { describe, expect, it } from "vitest";

import { bannerColour, bannerLine, bannerOf, DEFAULT_BANNER_COLOUR, DEFAULT_BANNER_ICON } from "../banner";

const CRITICAL = "#ff3030";

function attributes(values: Record<string, unknown>): (name: string) => unknown {
  return (name) => values[name] ?? null;
}

describe("bannerLine", () => {
  it("reads the message and the detail on one line", () => {
    expect(bannerLine("Alaska Airlines 3222 from PDX", "lands in 42 min · claim 1")).toBe(
      "Alaska Airlines 3222 from PDX · lands in 42 min · claim 1",
    );
  });

  it("reads either alone when the other is empty", () => {
    expect(bannerLine("Alaska Airlines 3222", null)).toBe("Alaska Airlines 3222");
    expect(bannerLine("  ", "cancelled")).toBe("cancelled");
  });
});

describe("bannerColour", () => {
  it("names the panel's colours and the master warning's red", () => {
    expect(bannerColour("primary", CRITICAL)).toBe("var(--color-primary)");
    expect(bannerColour("secondary", CRITICAL)).toBe("var(--color-secondary)");
    expect(bannerColour("critical", CRITICAL)).toBe(CRITICAL);
  });

  it("takes anything else as a CSS colour", () => {
    expect(bannerColour("#FF6D00", CRITICAL)).toBe("#FF6D00");
  });

  it("is muted without one", () => {
    expect(bannerColour(null, CRITICAL)).toBe(DEFAULT_BANNER_COLOUR);
    expect(bannerColour("", CRITICAL)).toBe(DEFAULT_BANNER_COLOUR);
  });
});

describe("bannerOf", () => {
  it("raises a band while its sensor is on", () => {
    expect(
      bannerOf(true, attributes({ message: "AS3222", detail: "lands 11:20", icon: "mdi:airplane-landing", color: "#43A047" }), CRITICAL),
    ).toEqual({ text: "AS3222 · lands 11:20", icon: "mdi:airplane-landing", colour: "#43A047" });
  });

  it("raises none while it is off, or with nothing to say", () => {
    expect(bannerOf(false, attributes({ message: "AS3222" }), CRITICAL)).toBeNull();
    expect(bannerOf(true, attributes({}), CRITICAL)).toBeNull();
  });

  it("falls back to an information icon", () => {
    expect(bannerOf(true, attributes({ message: "AS3222" }), CRITICAL)?.icon).toBe(DEFAULT_BANNER_ICON);
  });
});
