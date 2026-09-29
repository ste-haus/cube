import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PENDING_TIMEOUT_MS, PendingToggles } from "../pending.svelte";
import { ha } from "../state.svelte";
import type { EntityState } from "../types";

const LIGHT = "light.kitchen";
const OTHER = "light.hallway";

function entity(state: string): EntityState {
  return { state, attributes: {} } as unknown as EntityState;
}

/** The stream bringing an entity back, the way an update frame does. */
function answer(entityId: string, state: string): void {
  ha.entities = { ...ha.entities, [entityId]: entity(state) };
}

beforeEach(() => {
  vi.useFakeTimers();
  ha.entities = { [LIGHT]: entity("off"), [OTHER]: entity("off") };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PendingToggles", () => {
  it("waits from the tap until the stream sends the entity again", () => {
    const toggles = new PendingToggles(() => Promise.resolve());

    expect(toggles.send(LIGHT)).toBe(true);
    expect(toggles.isPending(LIGHT)).toBe(true);

    answer(LIGHT, "on");

    expect(toggles.isPending(LIGHT)).toBe(false);
  });

  it("does not send a second toggle while the first is waiting", () => {
    const request = vi.fn(() => Promise.resolve());
    const toggles = new PendingToggles(request);

    toggles.send(LIGHT);

    expect(toggles.send(LIGHT)).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("sends again once the first has been answered", () => {
    const request = vi.fn(() => Promise.resolve());
    const toggles = new PendingToggles(request);

    toggles.send(LIGHT);
    answer(LIGHT, "on");

    expect(toggles.send(LIGHT)).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("is not held up by some other entity changing", () => {
    const toggles = new PendingToggles(() => Promise.resolve());

    toggles.send(LIGHT);
    answer(OTHER, "on");

    expect(toggles.isPending(LIGHT)).toBe(true);
  });

  it("gives up on an answer that never comes", () => {
    const toggles = new PendingToggles(() => Promise.resolve());

    toggles.send(LIGHT);
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS);

    expect(toggles.isPending(LIGHT)).toBe(false);
  });

  it("gives up at once on a toggle the proxy refused", async () => {
    const toggles = new PendingToggles(() => Promise.reject(new Error("refused")));

    toggles.send(LIGHT);
    await vi.runAllTimersAsync();

    expect(toggles.isPending(LIGHT)).toBe(false);
  });

  it("waits on an entity the stream has not sent yet", () => {
    const toggles = new PendingToggles(() => Promise.resolve());
    const unseen = "light.unseen";

    toggles.send(unseen);
    expect(toggles.isPending(unseen)).toBe(true);

    answer(unseen, "on");
    expect(toggles.isPending(unseen)).toBe(false);
  });
});
