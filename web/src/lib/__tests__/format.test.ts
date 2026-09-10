import { describe, expect, it } from "vitest";

import { revealBeats, revealEasing } from "../format";

/** The progress values a `linear()` function steps through, in order. */
function progressStops(easing: string): number[] {
  return [...easing.matchAll(/([\d.]+) [\d.]+%/g)].map((match) => Number(match[1]));
}

/** The times a `linear()` function holds each progress value between. */
function timeStops(easing: string): number[] {
  return [...easing.matchAll(/[\d.]+ ([\d.]+)%/g)].map((match) => Number(match[1]));
}

describe("revealBeats", () => {
  it("counts a plain line as one beat a character", () => {
    expect(revealBeats("abc")).toBe(3);
  });

  it("buys a mark of punctuation extra beats, so the line hesitates there", () => {
    expect(revealBeats("ab,")).toBeGreaterThan(revealBeats("abc"));
  });

  it("stops longer at the end of a sentence than at a comma", () => {
    expect(revealBeats("ab.")).toBeGreaterThan(revealBeats("ab,"));
  });

  it("has nothing to say about an empty line", () => {
    expect(revealBeats("")).toBe(0);
  });
});

describe("revealEasing", () => {
  it("opens closed and ends fully revealed", () => {
    const easing = revealEasing("abc");

    expect(easing.startsWith("linear(0 0%,")).toBe(true);
    expect(timeStops(easing).at(-1)).toBe(100);
    expect(progressStops(easing).at(-1)).toBe(1);
  });

  it("holds each character at its own progress, so the line types rather than wipes", () => {
    // Two stops a character: one where it arrives, one where it gives way to the next.
    const stops = progressStops(revealEasing("abcd"));

    expect(stops).toEqual([0, 0.25, 0.25, 0.5, 0.5, 0.75, 0.75, 1, 1]);
  });

  it("gives every character the same run when none of them are punctuation", () => {
    const times = timeStops(revealEasing("abcd"));

    expect(times).toEqual([0, 0, 25, 25, 50, 50, 75, 75, 100]);
  });

  it("dwells on a comma longer than on a letter beside it", () => {
    const times = timeStops(revealEasing("a,b"));
    const runs = [times[2] - times[1], times[4] - times[3], times[6] - times[5]];

    expect(runs[1]).toBeGreaterThan(runs[0]);
    expect(runs[1]).toBeGreaterThan(runs[2]);
  });
});
