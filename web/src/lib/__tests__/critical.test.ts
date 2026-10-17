import { describe, expect, it } from "vitest";

import { advising, confirmation, flip, offColour, stillAsking } from "../critical";
import type { CriticalSwitch } from "../types";

const UNAVAILABLE = "unavailable";
const TEMPLATE = "Are you sure you want to turn off {label}?";
const SECONDARY = "#00bfff";

function critical(overrides: Partial<CriticalSwitch> = {}): CriticalSwitch {
  return {
    entity_id: "switch.dns_blocking",
    label: "Ad blocking",
    confirm: null,
    advise_when_off: true,
    hold_seconds: 1,
    ...overrides,
  };
}

describe("flip", () => {
  it("asks first while the switch is on", () => {
    expect(flip("on")).toBe("ask");
  });

  it("turns it on at once while it is off", () => {
    expect(flip("off")).toBe("send");
  });

  it("does nothing while Home Assistant cannot say which it is", () => {
    expect(flip(UNAVAILABLE)).toBe("nothing");
    expect(flip(null)).toBe("nothing");
  });
});

describe("stillAsking", () => {
  it("keeps the question only while the switch is still on", () => {
    expect(stillAsking("on")).toBe(true);
    expect(stillAsking("off")).toBe(false);
    expect(stillAsking(UNAVAILABLE)).toBe(false);
  });
});

describe("advising", () => {
  it("advises while the switch is off", () => {
    expect(advising(critical(), "off")).toBe(true);
  });

  it("is quiet while it is on, or cannot be read", () => {
    expect(advising(critical(), "on")).toBe(false);
    expect(advising(critical(), UNAVAILABLE)).toBe(false);
  });

  it("is quiet when told not to advise", () => {
    expect(advising(critical({ advise_when_off: false }), "off")).toBe(false);
  });

  it("is quiet on a card with no switch", () => {
    expect(advising(null, "off")).toBe(false);
  });
});

describe("offColour", () => {
  it("is the advisory's colour for a switch that advises", () => {
    expect(offColour(critical(), SECONDARY)).toBe(SECONDARY);
  });

  it("is none for one that does not", () => {
    expect(offColour(critical({ advise_when_off: false }), SECONDARY)).toBeNull();
  });
});

describe("confirmation", () => {
  it("puts the switch's name in the labels' question", () => {
    expect(confirmation(critical(), TEMPLATE)).toBe("Are you sure you want to turn off Ad blocking?");
  });

  it("asks in the switch's own words when it has them", () => {
    expect(confirmation(critical({ confirm: "Let the ads through?" }), TEMPLATE)).toBe("Let the ads through?");
  });
});
