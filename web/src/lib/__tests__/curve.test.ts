import { describe, expect, it } from "vitest";

import { areaPath, curvePath, levelPath, segments, type Point, type Segment } from "../curve";

const COLUMN = 100;
const SAMPLES = 50;
const TOLERANCE = 1e-9;

function series(values: number[]): Point[] {
  return values.map((y, index) => ({ x: index * COLUMN, y }));
}

/** A point along a stretch, a fraction of the way from its start to its end. */
function along({ from, leaving, arriving, to }: Segment, t: number): number {
  const u = 1 - t;

  return u * u * u * from.y + 3 * u * u * t * leaving.y + 3 * u * t * t * arriving.y + t * t * t * to.y;
}

/* Down the chart, as it is drawn: 100 is the foot. A shower that builds, peaks, and passes, and a
 * day of temperatures that jumps about. */
const SHOWER = series([100, 100, 90, 80, 60, 40, 30, 50, 70, 90, 100, 100, 90]);
const TEMPERATURES = series([30, 45, 42, 60, 20, 20, 55]);

describe("segments", () => {
  it("runs from each point to the next, through every one", () => {
    const stretches = segments(SHOWER);

    expect(stretches.map((stretch) => stretch.from)).toEqual(SHOWER.slice(0, -1));
    expect(stretches.map((stretch) => stretch.to)).toEqual(SHOWER.slice(1));
  });

  it.each([
    ["a shower", SHOWER, false],
    ["a shower, level at its ends", SHOWER, true],
    ["a jumpy day", TEMPERATURES, false],
  ])("never overshoots either end of a stretch in %s", (_, points, levelEnds) => {
    for (const stretch of segments(points, levelEnds)) {
      const lowest = Math.min(stretch.from.y, stretch.to.y) - TOLERANCE;
      const highest = Math.max(stretch.from.y, stretch.to.y) + TOLERANCE;

      for (let sample = 0; sample <= SAMPLES; sample += 1) {
        const y = along(stretch, sample / SAMPLES);

        expect(y).toBeGreaterThanOrEqual(lowest);
        expect(y).toBeLessThanOrEqual(highest);
      }
    }
  });

  it("stays level along a run of equal values", () => {
    for (const stretch of segments(series([100, 100, 100]))) {
      expect([stretch.leaving.y, stretch.arriving.y]).toEqual([100, 100]);
    }
  });

  it("leaves and arrives level when asked", () => {
    const stretches = segments(SHOWER, true);

    expect(stretches[0].leaving.y).toBe(SHOWER[0].y);
    expect(stretches[stretches.length - 1].arriving.y).toBe(SHOWER[SHOWER.length - 1].y);
  });

  it("draws a straight line between just two points", () => {
    const [stretch] = segments(series([90, 60]));

    expect(stretch.leaving.y).toBeCloseTo(80);
    expect(stretch.arriving.y).toBeCloseTo(70);
  });

  it("has nothing to draw with fewer than two points", () => {
    expect(segments(series([50]))).toEqual([]);
    expect(segments([])).toEqual([]);
  });
});

describe("curvePath", () => {
  it("starts at the first point", () => {
    expect(curvePath(series([30, 45])).startsWith("M 0,30 C")).toBe(true);
  });

  it("draws nothing without points", () => {
    expect(curvePath([])).toBe("");
  });
});

describe("levelPath and areaPath", () => {
  const points = [
    { x: 50, y: 80 },
    { x: 150, y: 60 },
  ];

  it("runs level out to both edges", () => {
    const path = levelPath(points, 0, 200);

    expect(path.startsWith("M 0,80 L 50,80 C")).toBe(true);
    expect(path.endsWith("150,60 L 200,60")).toBe(true);
  });

  it("closes the area down to the baseline across the whole width", () => {
    expect(areaPath(points, 0, 200, 100).endsWith("L 200,60 L 200,100 L 0,100 Z")).toBe(true);
  });

  it("draws nothing without points", () => {
    expect(levelPath([], 0, 200)).toBe("");
    expect(areaPath([], 0, 200, 100)).toBe("");
  });
});
