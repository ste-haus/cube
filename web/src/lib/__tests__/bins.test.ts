import { describe, expect, it } from "vitest";

import { binState } from "../bins";

const NO_MAP = {};
const OWN_STATES = { out: "take_out", in: "picked_up" };

describe("binState", () => {
  it("draws a state the stylesheet knows as itself", () => {
    expect(binState("home", NO_MAP)).toBe("home");
    expect(binState("take_out", NO_MAP)).toBe("take_out");
  });

  it("draws an installation's own state as the one it is mapped to", () => {
    expect(binState("out", OWN_STATES)).toBe("take_out");
    expect(binState("in", OWN_STATES)).toBe("picked_up");
  });

  it("passes a known state through a map that does not mention it", () => {
    expect(binState("away", OWN_STATES)).toBe("away");
  });

  it("draws nothing for a state it has no rule for", () => {
    expect(binState("out", NO_MAP)).toBeNull();
    expect(binState("unavailable", OWN_STATES)).toBeNull();
    expect(binState(null, OWN_STATES)).toBeNull();
  });
});
