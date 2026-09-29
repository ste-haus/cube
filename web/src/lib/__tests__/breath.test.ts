import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Breath, SETTLE_MS } from "../breath.svelte";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Breath", () => {
  it("breathes from the start of a drag", () => {
    const breath = new Breath();

    breath.start();

    expect(breath.breathing).toBe(true);
  });

  it("keeps breathing while the finger is down, however many breaths go by", () => {
    const breath = new Breath();

    breath.start();
    breath.breathed();

    expect(breath.breathing).toBe(true);
  });

  it("keeps breathing through its settling time after it is let go", () => {
    const breath = new Breath();

    breath.start();
    breath.release();
    vi.advanceTimersByTime(SETTLE_MS - 1);
    breath.breathed();

    expect(breath.breathing).toBe(true);
  });

  it("settles at the first breath's end after its settling time", () => {
    const breath = new Breath();

    breath.start();
    breath.release();
    vi.advanceTimersByTime(SETTLE_MS);

    expect(breath.breathing).toBe(true);

    breath.breathed();

    expect(breath.breathing).toBe(false);
  });

  it("keeps breathing past its settling time while it is still busy", () => {
    const breath = new Breath();

    breath.start();
    breath.release();
    vi.advanceTimersByTime(SETTLE_MS);
    breath.breathed(true);

    expect(breath.breathing).toBe(true);
  });

  it("starts its settling time over when it is taken hold of again", () => {
    const breath = new Breath();

    breath.start();
    breath.release();
    vi.advanceTimersByTime(SETTLE_MS - 1);
    breath.start();
    vi.advanceTimersByTime(SETTLE_MS);
    breath.breathed();

    expect(breath.breathing).toBe(true);
  });
});
