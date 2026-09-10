import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADJACENCY, Cube, FACES, swipeable, type Direction, type FaceName } from "../cube.svelte";

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

/**
 * A stand-in for the element the action decorates, so the gesture can be tested without a DOM.
 * Only the surface `swipeable` actually touches is here: listener registration and the inline
 * style it sets.
 */
function fakeNode() {
  const listeners = new Map<string, ((event: unknown) => void)[]>();

  return {
    style: { touchAction: "" },
    addEventListener(type: string, handler: (event: unknown) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), handler]);
    },
    removeEventListener(type: string, handler: (event: unknown) => void) {
      listeners.set(type, (listeners.get(type) ?? []).filter((each) => each !== handler));
    },
    dispatch(type: string, event: Record<string, unknown>) {
      for (const handler of listeners.get(type) ?? []) {
        handler(event);
      }
    },
  };
}

function pointer(x: number, y: number) {
  return { clientX: x, clientY: y, isPrimary: true, stopPropagation: () => {} };
}

describe("swipeable", () => {
  /*
   * The panel is driven by fingers, and a touchscreen offers a drag to the browser's panning
   * before it offers it to us. Left at the default `touch-action`, the browser takes it and
   * ends the sequence in `pointercancel`, so `pointerup` — where a swipe is decided — never
   * arrives and no gesture on the panel does anything at all.
   */
  it("declines the browser's claim on the gesture", () => {
    const node = fakeNode();

    const action = swipeable(node as unknown as HTMLElement, { onSwipe: () => {} });

    expect(node.style.touchAction).toBe("none");

    action.destroy();

    expect(node.style.touchAction).toBe("");
  });

  it("rotates on a drag past the threshold", () => {
    const swipes: Direction[] = [];
    const node = fakeNode();
    swipeable(node as unknown as HTMLElement, { onSwipe: (direction) => swipes.push(direction) });

    node.dispatch("pointerdown", pointer(400, 300));
    node.dispatch("pointerup", pointer(200, 310));

    expect(swipes).toEqual(["left"]);
  });

  it("ignores a drag too short to have been meant", () => {
    const swipes: Direction[] = [];
    const node = fakeNode();
    swipeable(node as unknown as HTMLElement, { onSwipe: (direction) => swipes.push(direction) });

    node.dispatch("pointerdown", pointer(400, 300));
    node.dispatch("pointerup", pointer(380, 300));

    expect(swipes).toEqual([]);
  });

  it("leaves an axis it does not claim to an ancestor", () => {
    const swipes: Direction[] = [];
    const node = fakeNode();
    swipeable(node as unknown as HTMLElement, {
      onSwipe: (direction) => swipes.push(direction),
      axes: "horizontal",
    });

    node.dispatch("pointerdown", pointer(400, 600));
    node.dispatch("pointerup", pointer(400, 300));

    expect(swipes).toEqual([]);
  });
});

/**
 * The timers the cube sets for itself: the one that ends a rotation, and the one that returns
 * an untouched panel to the front. Nothing here waits on either, so holding the handle and
 * doing nothing with it is the whole of what the class needs from a browser.
 */
function fakeWindow() {
  return { setTimeout: () => 0, clearTimeout: () => undefined };
}

describe("which faces are built", () => {
  beforeEach(() => vi.stubGlobal("window", fakeWindow()));
  afterEach(() => vi.unstubAllGlobals());

  it("starts with only the face it opens on", () => {
    expect(new Cube().built).toEqual(["front"]);
  });

  it("builds a face the first time the cube turns to it", () => {
    const cube = new Cube();
    cube.rotate("left");

    expect(cube.isBuilt(cube.current)).toBe(true);
  });

  it("builds a face the map jumps straight to", () => {
    const cube = new Cube();
    cube.show("down");

    expect(cube.isBuilt("down")).toBe(true);
  });

  it("keeps a face built once it has been turned away from", () => {
    const cube = new Cube();
    cube.show("left");
    cube.show("front");

    expect(cube.isBuilt("left")).toBe(true);
    expect(cube.isVisible("left")).toBe(false);
  });

  it("builds a face once however often it is returned to", () => {
    const cube = new Cube();
    cube.show("back");
    cube.show("front");
    cube.show("back");

    expect(cube.built.filter((face) => face === "back")).toHaveLength(1);
  });

  it("never builds a face nothing has turned to", () => {
    const cube = new Cube();
    cube.show("left");

    expect(cube.isBuilt("up")).toBe(false);
  });
});
