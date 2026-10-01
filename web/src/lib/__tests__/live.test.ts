import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIVE_BRIGHTNESS_STEP, LIVE_INTERVAL_MS, LiveSend } from "../live";

const apart = (a: number, b: number) => Math.abs(a - b) >= LIVE_BRIGHTNESS_STEP;

/** A request that comes back only when told to. */
function deferred() {
  let answer = () => {};
  const promise = new Promise<void>((resolve) => (answer = resolve));

  return { promise, answer };
}

/** Lets the request's settling run, as the event loop would. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LiveSend", () => {
  it("sends the first change at once", () => {
    const send = vi.fn(() => Promise.resolve());
    const live = new LiveSend(send, apart, undefined, () => Date.now());

    live.move(40);

    expect(send).toHaveBeenCalledWith(40);
  });

  it("sends only the latest value once the beat has passed", async () => {
    const send = vi.fn(() => Promise.resolve());
    const live = new LiveSend(send, apart, undefined, () => Date.now());

    live.move(40);
    await settle();
    live.move(45);
    live.move(50);
    live.move(55);

    expect(send).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(LIVE_INTERVAL_MS);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(55);
  });

  it("waits for the last request to come back before sending another", async () => {
    const first = deferred();
    const send = vi.fn().mockReturnValueOnce(first.promise).mockReturnValue(Promise.resolve());
    const live = new LiveSend(send, apart, undefined, () => Date.now());

    live.move(40);
    vi.advanceTimersByTime(LIVE_INTERVAL_MS * 4);
    live.move(60);

    expect(send).toHaveBeenCalledTimes(1);

    first.answer();
    await settle();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(60);
  });

  it("does not send a move too small to matter", async () => {
    const send = vi.fn(() => Promise.resolve());
    const live = new LiveSend(send, apart, undefined, () => Date.now());

    live.move(40);
    await settle();
    vi.advanceTimersByTime(LIVE_INTERVAL_MS);
    live.move(41);
    vi.advanceTimersByTime(LIVE_INTERVAL_MS);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends where the finger landed, unless that is what was last sent", async () => {
    const send = vi.fn(() => Promise.resolve());
    const live = new LiveSend(send, apart, undefined, () => Date.now());

    live.move(40);
    await settle();
    live.move(41);
    live.finish(41);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(41);

    live.move(70);
    await settle();
    live.finish(70);

    expect(send).toHaveBeenCalledTimes(3);
  });

  it("sends nothing more once the drag is over", async () => {
    const send = vi.fn(() => Promise.resolve());
    const live = new LiveSend(send, apart, undefined, () => Date.now());

    live.move(40);
    await settle();
    live.move(60);
    live.finish(60);
    vi.advanceTimersByTime(LIVE_INTERVAL_MS * 4);
    await settle();

    expect(send).toHaveBeenCalledTimes(2);
  });

  it("tries again later when a send is refused", async () => {
    const send = vi.fn().mockReturnValueOnce(null).mockReturnValue(Promise.resolve());
    const live = new LiveSend(send, apart, undefined, () => Date.now());

    live.move(40);
    live.move(42);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(42);
  });
});
