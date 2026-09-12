import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Lapsing } from "../panes.svelte";

const LAPSE_MS = 1000;
const WEEK = "week";
const HOURS = "hours";

describe("Lapsing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("chooses nothing until something is chosen", () => {
    expect(new Lapsing<string>(LAPSE_MS).chosen).toBeNull();
  });

  it("holds a choice until it lapses", () => {
    const choice = new Lapsing<string>(LAPSE_MS);

    choice.choose(WEEK);
    vi.advanceTimersByTime(LAPSE_MS - 1);
    expect(choice.chosen).toBe(WEEK);

    vi.advanceTimersByTime(1);
    expect(choice.chosen).toBeNull();
  });

  it("starts the wait again with every choice", () => {
    const choice = new Lapsing<string>(LAPSE_MS);

    choice.choose(WEEK);
    vi.advanceTimersByTime(LAPSE_MS - 1);
    choice.choose(HOURS);
    vi.advanceTimersByTime(LAPSE_MS - 1);

    expect(choice.chosen).toBe(HOURS);
  });

  it("lets go at once when released", () => {
    const choice = new Lapsing<string>(LAPSE_MS);

    choice.choose(WEEK);
    choice.release();

    expect(choice.chosen).toBeNull();
  });
});
