import { describe, expect, it } from "vitest";

import { crestCharacter, crestOpacity, crestPath } from "../gust";

const OVAL = { cx: 0, cy: 0, rx: 100, ry: 120 };
const PLAIN = { ripples: [], lean: 0, breadth: 1 };
const STILL_CREST = { progress: 0, travel: 60, halfAngle: Math.PI / 4, amplitude: 0, character: PLAIN };
const FULLY_GROWN = 0.5;

function points(path: string): [number, number][] {
  return path
    .split(/[ML]/)
    .filter(Boolean)
    .map((point) => point.trim().split(" ").map(Number) as [number, number]);
}

/** A fixed sequence standing in for Math.random, so a character can be drawn the same twice. */
function seeded(values: number[]): () => number {
  let index = 0;

  return () => values[index++ % values.length];
}

describe("crestPath", () => {
  it("leaves from the oval's open side, never the side it hangs from", () => {
    for (const [x] of points(crestPath(OVAL, STILL_CREST))) {
      expect(x).toBeGreaterThan(0);
    }
  });

  it("starts on the oval's outline and travels out from it", () => {
    const start = points(crestPath(OVAL, STILL_CREST));
    const end = points(crestPath(OVAL, { ...STILL_CREST, progress: 1 }));
    const middle = Math.floor(start.length / 2);

    expect(start[middle][0]).toBeCloseTo(OVAL.rx);
    expect(end[middle][0]).toBeCloseTo(OVAL.rx + STILL_CREST.travel);
  });

  it("leaves as the outline, rippling only once it is on its way", () => {
    const rippled = { ...STILL_CREST, amplitude: 10, character: crestCharacter(seeded([0.2, 0.7, 0.4, 0.9])) };

    for (const [x, y] of points(crestPath(OVAL, rippled))) {
      expect((x / OVAL.rx) ** 2 + (y / OVAL.ry) ** 2).toBeCloseTo(1, 2);
    }
    expect(crestPath(OVAL, { ...rippled, progress: FULLY_GROWN })).not.toBe(
      crestPath(OVAL, { ...STILL_CREST, progress: FULLY_GROWN }),
    );
  });

  it("never dips inside the oval, however it ripples", () => {
    const rippled = {
      ...STILL_CREST,
      progress: 0.05,
      amplitude: 40,
      character: crestCharacter(seeded([0.1, 0.9, 0.3, 0.6, 0.8])),
    };

    for (const [x, y] of points(crestPath(OVAL, rippled))) {
      expect((x / OVAL.rx) ** 2 + (y / OVAL.ry) ** 2).toBeGreaterThanOrEqual(1 - 1e-3);
    }
  });
});

describe("crestCharacter", () => {
  it("is different from one crest to the next", () => {
    expect(crestCharacter(seeded([0.1, 0.5]))).not.toEqual(crestCharacter(seeded([0.7, 0.3])));
  });

  it("shares the crest's amplitude out among its ripples", () => {
    const total = crestCharacter(seeded([0.4, 0.8])).ripples.reduce((sum, ripple) => sum + ripple.amplitude, 0);

    expect(total).toBeCloseTo(1);
  });
});

describe("crestOpacity", () => {
  it("is nothing before it leaves and once it is gone", () => {
    expect(crestOpacity(0)).toBe(0);
    expect(crestOpacity(1)).toBe(0);
  });

  it("comes up quickly and fades out", () => {
    expect(crestOpacity(0.15)).toBeGreaterThan(crestOpacity(0.05));
    expect(crestOpacity(0.9)).toBeLessThan(crestOpacity(0.3));
  });
});
