import { describe, expect, it } from "vitest";

import { bannerColour, bannerOf, bannerPart, DEFAULT_BANNER_COLOUR, DEFAULT_BANNER_ICON } from "../banner";

const CRITICAL = "#ff3030";

function attributes(values: Record<string, unknown>): (name: string) => unknown {
  return (name) => values[name] ?? null;
}

describe("bannerPart", () => {
  it("reads a part trimmed", () => {
    expect(bannerPart("  Alaska Airlines 3222 from PDX ")).toBe("Alaska Airlines 3222 from PDX");
  });

  it("is empty without one", () => {
    expect(bannerPart(null)).toBe("");
    expect(bannerPart(42)).toBe("");
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
    ).toEqual({ message: "AS3222", detail: "lands 11:20", icon: "mdi:airplane-landing", picture: null, colour: "#43A047" });
  });

  it("raises none while it is off, or with nothing to say", () => {
    expect(bannerOf(false, attributes({ message: "AS3222" }), CRITICAL)).toBeNull();
    expect(bannerOf(true, attributes({}), CRITICAL)).toBeNull();
  });

  it("raises either part alone when the other is empty", () => {
    expect(bannerOf(true, attributes({ message: "  ", detail: "cancelled" }), CRITICAL)).toMatchObject({ message: "", detail: "cancelled" });
  });

  it("shows its picture when it has one", () => {
    expect(bannerOf(true, attributes({ message: "AS3222", entity_picture: "https://example.com/AS.png" }), CRITICAL)?.picture).toBe(
      "https://example.com/AS.png",
    );
    expect(bannerOf(true, attributes({ message: "AS3222", entity_picture: "" }), CRITICAL)?.picture).toBeNull();
  });

  it("falls back to an information icon", () => {
    expect(bannerOf(true, attributes({ message: "AS3222" }), CRITICAL)?.icon).toBe(DEFAULT_BANNER_ICON);
  });
});
