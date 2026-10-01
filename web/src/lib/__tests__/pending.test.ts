import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PENDING_TIMEOUT_MS, PendingRequests } from "../pending.svelte";
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

describe("PendingRequests", () => {
  it("waits from the tap until the stream sends the entity again", () => {
    const toggles = new PendingRequests(() => Promise.resolve());

    expect(toggles.send(LIGHT)).toBe(true);
    expect(toggles.isPending(LIGHT)).toBe(true);

    answer(LIGHT, "on");

    expect(toggles.isPending(LIGHT)).toBe(false);
  });

  it("does not send a second toggle while the first is waiting", () => {
    const request = vi.fn(() => Promise.resolve());
    const toggles = new PendingRequests(request);

    toggles.send(LIGHT);

    expect(toggles.send(LIGHT)).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("sends again once the first has been answered", () => {
    const request = vi.fn(() => Promise.resolve());
    const toggles = new PendingRequests(request);

    toggles.send(LIGHT);
    answer(LIGHT, "on");

    expect(toggles.send(LIGHT)).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("is not held up by some other entity changing", () => {
    const toggles = new PendingRequests(() => Promise.resolve());

    toggles.send(LIGHT);
    answer(OTHER, "on");

    expect(toggles.isPending(LIGHT)).toBe(true);
  });

  it("gives up on an answer that never comes", () => {
    const toggles = new PendingRequests(() => Promise.resolve());

    toggles.send(LIGHT);
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS);

    expect(toggles.isPending(LIGHT)).toBe(false);
  });

  it("gives up at once on a toggle the proxy refused", async () => {
    const toggles = new PendingRequests(() => Promise.reject(new Error("refused")));

    toggles.send(LIGHT);
    await vi.runAllTimersAsync();

    expect(toggles.isPending(LIGHT)).toBe(false);
  });

  it("waits on an entity the stream has not sent yet", () => {
    const toggles = new PendingRequests(() => Promise.resolve());
    const unseen = "light.unseen";

    toggles.send(unseen);
    expect(toggles.isPending(unseen)).toBe(true);

    answer(unseen, "on");
    expect(toggles.isPending(unseen)).toBe(false);
  });
});

describe("PendingRequests setting a value", () => {
  const BRIGHTNESS = 40;
  const BRIGHTER = 80;

  it("waits on the value it asked for, and names it", () => {
    const request = vi.fn(() => Promise.resolve());
    const requests = new PendingRequests(() => Promise.resolve(), request);

    expect(requests.set(LIGHT, BRIGHTNESS)).toBe(true);
    expect(request).toHaveBeenCalledWith(LIGHT, BRIGHTNESS);
    expect(requests.requested(LIGHT)).toBe(BRIGHTNESS);

    answer(LIGHT, "on");

    expect(requests.requested(LIGHT)).toBeNull();
  });

  it("lets a later value replace one still waiting", () => {
    const request = vi.fn(() => Promise.resolve());
    const requests = new PendingRequests(() => Promise.resolve(), request);

    requests.set(LIGHT, BRIGHTNESS);

    expect(requests.set(LIGHT, BRIGHTER)).toBe(true);
    expect(requests.requested(LIGHT)).toBe(BRIGHTER);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("leaves a toggle still waiting to finish first", () => {
    const request = vi.fn(() => Promise.resolve());
    const requests = new PendingRequests(() => Promise.resolve(), request);

    requests.send(LIGHT);

    expect(requests.set(LIGHT, BRIGHTNESS)).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("names no value for a toggle", () => {
    const requests = new PendingRequests(() => Promise.resolve(), () => Promise.resolve());

    requests.send(LIGHT);

    expect(requests.isPending(LIGHT)).toBe(true);
    expect(requests.requested(LIGHT)).toBeNull();
  });

  it("answers a streamed value only once the entity reaches it", () => {
    const requests = new PendingRequests(() => Promise.resolve(), () => Promise.resolve());

    requests.stream(LIGHT, BRIGHTER, () => ha.state(LIGHT) === "on");
    answer(LIGHT, "off");

    expect(requests.isPending(LIGHT)).toBe(true);
    expect(requests.requested(LIGHT)).toBe(BRIGHTER);

    answer(LIGHT, "on");

    expect(requests.isPending(LIGHT)).toBe(false);
  });

  it("gives up on a streamed value at the timeout", () => {
    const requests = new PendingRequests(() => Promise.resolve(), () => Promise.resolve());

    requests.stream(LIGHT, BRIGHTER, () => false);
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS);

    expect(requests.isPending(LIGHT)).toBe(false);
  });

  it("streams nothing while a toggle is waiting", () => {
    const request = vi.fn(() => Promise.resolve());
    const requests = new PendingRequests(() => Promise.resolve(), request);

    requests.send(LIGHT);

    expect(requests.stream(LIGHT, BRIGHTNESS, () => true)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps a later request when an earlier one is refused", async () => {
    let refuse = () => {};
    const refused = new Promise<void>((_, reject) => (refuse = () => reject(new Error("refused"))));
    const request = vi.fn().mockReturnValueOnce(refused).mockReturnValue(new Promise(() => {}));
    const requests = new PendingRequests(() => Promise.resolve(), request);

    requests.stream(LIGHT, BRIGHTNESS, () => false);
    requests.stream(LIGHT, BRIGHTER, () => false);
    refuse();
    await Promise.resolve();
    await Promise.resolve();

    expect(requests.requested(LIGHT)).toBe(BRIGHTER);
  });
});
