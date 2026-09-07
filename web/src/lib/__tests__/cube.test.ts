import { describe, expect, it } from "vitest";

import { ADJACENCY, FACES, type Direction, type FaceName } from "../cube.svelte";

const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

/** The two great circles the rotation graph turns through. */
const HORIZONTAL_CYCLE: FaceName[] = ["front", "right", "back", "left"];
const VERTICAL_CYCLE: FaceName[] = ["front", "up", "back", "down"];

function walk(cycle: FaceName[], direction: Direction): FaceName[] {
  return cycle.map((face) => ADJACENCY[face][direction]);
}

describe("cube adjacency", () => {
  it("gives every face a destination in every direction", () => {
    for (const face of FACES) {
      for (const direction of DIRECTIONS) {
        expect(FACES).toContain(ADJACENCY[face][direction]);
      }
    }
  });

  it("never rotates a face onto itself", () => {
    for (const face of FACES) {
      for (const direction of DIRECTIONS) {
        expect(ADJACENCY[face][direction]).not.toBe(face);
      }
    }
  });

  it("reaches all six faces from the front", () => {
    const seen = new Set<FaceName>(["front"]);
    const queue: FaceName[] = ["front"];

    while (queue.length > 0) {
      const face = queue.shift()!;

      for (const direction of DIRECTIONS) {
        const next = ADJACENCY[face][direction];
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }

    expect(seen.size).toBe(FACES.length);
  });

  it("turns the horizontal circle in a consistent loop", () => {
    // Swiping left walks front → right → back → left and around again.
    expect(walk(HORIZONTAL_CYCLE, "left")).toEqual(["right", "back", "left", "front"]);
    expect(walk(HORIZONTAL_CYCLE, "right")).toEqual(["left", "front", "right", "back"]);
  });

  it("turns the vertical circle in a consistent loop", () => {
    expect(walk(VERTICAL_CYCLE, "down")).toEqual(["up", "back", "down", "front"]);
    expect(walk(VERTICAL_CYCLE, "up")).toEqual(["down", "front", "up", "back"]);
  });

  it("reverses any rotation taken along a circle", () => {
    for (const [cycle, axis] of [
      [HORIZONTAL_CYCLE, ["left", "right"]],
      [VERTICAL_CYCLE, ["up", "down"]],
    ] as [FaceName[], Direction[]][]) {
      for (const face of cycle) {
        for (const direction of axis) {
          const moved = ADJACENCY[face][direction];

          expect(ADJACENCY[moved][OPPOSITE[direction]]).toBe(face);
        }
      }
    }
  });

  it("leaves a circle by its poles rather than tracking roll", () => {
    // Stepping off a circle — vertically from a side face, or horizontally from a pole —
    // lands on the other circle and forgets which way round the cube was. Carried over from
    // the original dashboard, where it is invisible: both moves still reach a real face.
    expect(ADJACENCY.left.up).toBe("down");
    expect(ADJACENCY.down.down).toBe("front");

    expect(ADJACENCY.up.left).toBe("right");
    expect(ADJACENCY.right.right).toBe("front");
  });
});
