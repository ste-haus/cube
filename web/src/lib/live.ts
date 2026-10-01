/*
 * A value sent to Home Assistant while a finger is still moving it, so the light follows the drag
 * rather than jumping once it is let go.
 *
 * Paced rather than sent at every move: a light, and whatever bridge or mesh is behind it, takes a
 * handful of commands a second, and a flood of them queues up and plays out long after the finger
 * has stopped. So the first change goes at once, and after that only the latest goes, once the last
 * request has come back, a beat has passed since it was sent, and the value has moved far enough to
 * be worth sending. Letting go sends where the finger landed, if that is not what was last sent.
 */

import { FULL_SATURATION, hueGap, readHueSaturation, sameColour } from "./hue";
import { pending } from "./pending.svelte";
import { sliderPercent } from "./slider";
import { ha } from "./state.svelte";

/** The least time between two sends while the finger is moving. */
export const LIVE_INTERVAL_MS = 250;

/** How far a brightness, in percent, has to move to be worth sending again mid-drag. */
export const LIVE_BRIGHTNESS_STEP = 2;

/** How far a hue, in degrees, has to move to be worth sending again mid-drag. */
export const LIVE_HUE_STEP_DEGREES = 3;

/** Sends a value and gives back the request, or null when nothing was sent. */
type Send<T> = (value: T) => Promise<unknown> | null;

export class LiveSend<T> {
  #send: Send<T>;
  #apart: (a: T, b: T) => boolean;
  #same: (a: T, b: T) => boolean;
  #now: () => number;

  #latest: T | null = null;
  #sent: T | null = null;
  #sentAt = Number.NEGATIVE_INFINITY;
  #inFlight = false;
  #timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * `apart` says whether two values are far enough apart to send the second mid-drag; `same`, whether
   * the place the finger landed is already what was sent.
   */
  constructor(
    send: Send<T>,
    apart: (a: T, b: T) => boolean,
    same: (a: T, b: T) => boolean = (a, b) => a === b,
    now: () => number = () => performance.now(),
  ) {
    this.#send = send;
    this.#apart = apart;
    this.#same = same;
    this.#now = now;
  }

  /** The finger has moved the value. */
  move(value: T): void {
    this.#latest = value;
    this.#pump();
  }

  /** The finger has let go here: sends it, unless it is already what was sent, and stops. */
  finish(value: T): void {
    const sent = this.#sent;
    this.cancel();

    if (sent === null || !this.#same(value, sent)) {
      this.#send(value);
    }
  }

  /** The drag is over without a value to land on. */
  cancel(): void {
    this.#clearTimer();
    this.#latest = null;
    this.#sent = null;
    this.#sentAt = Number.NEGATIVE_INFINITY;
  }

  #pump(): void {
    const latest = this.#latest;
    if (latest === null || this.#inFlight || this.#timer !== null) {
      return;
    }

    if (this.#sent !== null && !this.#apart(latest, this.#sent)) {
      return;
    }

    const wait = this.#sentAt + LIVE_INTERVAL_MS - this.#now();
    if (wait > 0) {
      this.#timer = setTimeout(() => {
        this.#timer = null;
        this.#pump();
      }, wait);
      return;
    }

    const request = this.#send(latest);
    if (request === null) {
      return;
    }

    this.#sent = latest;
    this.#sentAt = this.#now();
    this.#inFlight = true;

    const landed = () => {
      this.#inFlight = false;
      this.#pump();
    };

    request.then(landed, landed);
  }

  #clearTimer(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }
}

// How near Home Assistant has to come to a streamed brightness, in percent, to count as there.
const BRIGHTNESS_MATCH = 1;
const HS_COLOR_ATTRIBUTE = "hs_color";

/** A light's brightness, streamed to it while it is dragged. */
export function liveBrightness(entityId: () => string): LiveSend<number> {
  return new LiveSend<number>(
    (percent) =>
      pending.stream(entityId(), percent, () => Math.abs(sliderPercent(entityId()) - percent) <= BRIGHTNESS_MATCH),
    (a, b) => Math.abs(a - b) >= LIVE_BRIGHTNESS_STEP,
  );
}

/** A light's hue, at full saturation, streamed to it while the marker is dragged round the ring. */
export function liveHue(entityId: () => string): LiveSend<number> {
  return new LiveSend<number>(
    (hue) => {
      const colour = { hue, saturation: FULL_SATURATION };

      return pending.stream(entityId(), colour, () =>
        sameColour(readHueSaturation(ha.attribute(entityId(), HS_COLOR_ATTRIBUTE)), colour),
      );
    },
    (a, b) => hueGap(a, b) >= LIVE_HUE_STEP_DEGREES,
  );
}
