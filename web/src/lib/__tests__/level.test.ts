import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SlidingLevel } from "../level.svelte";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SlidingLevel", () => {
  it("takes the first level it is given at once", () => {
    const level = new SlidingLevel();

    level.follow(60);

    expect(level.current).toBe(60);
  });

  it("follows the finger at once", () => {
    const level = new SlidingLevel();

    level.follow(10);
    level.follow(80, true);

    expect(level.current).toBe(80);
  });

  it("slides to a level it is told of rather than jumping", () => {
    const level = new SlidingLevel();

    level.follow(0);
    level.follow(50);

    expect(level.current).toBe(0);
  });
});
