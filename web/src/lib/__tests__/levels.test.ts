import { describe, expect, it } from "vitest";

import { nextLevel } from "../levels";

const TWO = ["downstairs", "upstairs"];
const THREE = ["basement", "downstairs", "upstairs"];

describe("nextLevel", () => {
  /*
   * The case that gave the wrap away: with two storeys, coming back round meant a swipe either
   * way landed on the same one, so the panel could not be swiped back to where it started.
   */
  it("sends the two directions to different places when there are two levels", () => {
    expect(nextLevel(TWO, "downstairs", "left")).toBe("upstairs");
    expect(nextLevel(TWO, "upstairs", "right")).toBe("downstairs");
  });

  it("stays put at the near end", () => {
    expect(nextLevel(TWO, "downstairs", "right")).toBe("downstairs");
    expect(nextLevel(THREE, "basement", "right")).toBe("basement");
  });

  it("stays put at the far end", () => {
    expect(nextLevel(TWO, "upstairs", "left")).toBe("upstairs");
    expect(nextLevel(THREE, "upstairs", "left")).toBe("upstairs");
  });

  it("steps one storey at a time through the middle", () => {
    expect(nextLevel(THREE, "downstairs", "left")).toBe("upstairs");
    expect(nextLevel(THREE, "downstairs", "right")).toBe("basement");
  });

  it("has nowhere to go with a single level", () => {
    expect(nextLevel(["downstairs"], "downstairs", "left")).toBe("downstairs");
    expect(nextLevel(["downstairs"], "downstairs", "right")).toBe("downstairs");
  });

  it("goes back the way it came, so a swipe is undoable", () => {
    const moved = nextLevel(THREE, "basement", "left");

    expect(nextLevel(THREE, moved, "right")).toBe("basement");
  });
});
