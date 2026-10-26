import { describe, expect, it } from "vitest";

import { binState } from "../bins";
import type { BinStates } from "../types";

const NO_RENAMES: BinStates = { home: null, away: null, take_out: null, picked_up: null };
const OWN_STATES: BinStates = { ...NO_RENAMES, take_out: "out", picked_up: "in" };

describe("binState", () => {
  it("draws a state the stylesheet knows as itself", () => {
    expect(binState("home", NO_RENAMES)).toBe("home");
    expect(binState("take_out", NO_RENAMES)).toBe("take_out");
  });

  it("draws an installation's own name for a state as the state it names", () => {
    expect(binState("out", OWN_STATES)).toBe("take_out");
    expect(binState("in", OWN_STATES)).toBe("picked_up");
  });

  it("passes a state of the installation's own through, for its own stylesheet", () => {
    expect(binState("overflowing", OWN_STATES)).toBe("overflowing");
  });

  it("keeps a state with a space in it to one class", () => {
    expect(binState("at curb", NO_RENAMES)).toBe("at_curb");
  });

  it("draws nothing for a state it cannot read", () => {
    expect(binState("unknown", OWN_STATES)).toBeNull();
    expect(binState("unavailable", OWN_STATES)).toBeNull();
    expect(binState("", OWN_STATES)).toBeNull();
    expect(binState(null, OWN_STATES)).toBeNull();
  });
});
