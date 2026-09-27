import { describe, expect, it } from "vitest";

import { bands } from "../../shared/spectrum";
import { smoothNoise } from "../../shared/noise";
import { Field } from "../field";

const ROWS = 4;
const COLUMNS = 9;
const MIDDLE = 4;
const EDGE = 0;
const FRONT = 0;
const BACK = ROWS - 1;
const LOUD = 1;
const HALF_LENGTH = 5;
const KNOTS = 3;
const FOCUS = 1;
const LOWEST_MODE = 1;
const HIGHEST_MODE = 4;
const SHARPNESS = 2;
const DEPTH = 0.5;
// Two crests across half a row, so its trough lands exactly on a column.
const TROUGH_MODE = 2;

function field(asymmetry = 0, listeningRow?: number): Field {
  return new Field({
    rows: ROWS,
    columns: COLUMNS,
    asymmetry,
    asymmetryKnots: KNOTS,
    focus: FOCUS,
    lowestMode: LOWEST_MODE,
    highestMode: HIGHEST_MODE,
    sharpness: SHARPNESS,
    listeningRow,
  });
}

function row(surface: Field, index: number): number[] {
  return Array.from({ length: COLUMNS }, (_, column) => surface.at(index, column));
}

function silent(heights: number[]): boolean {
  return heights.every(height => height === 0);
}

const loud = () => new Float32Array(HALF_LENGTH).fill(LOUD);

describe("the field", () => {
  it("hears only at the back", () => {
    const surface = field();
    surface.listen(loud());

    expect(surface.at(BACK, MIDDLE)).toBe(LOUD);
    expect(silent(row(surface, FRONT))).toBe(true);
  });

  it("can listen short of the back, leaving the rows behind silent", () => {
    const listeningRow = BACK - 1;
    const surface = field(0, listeningRow);
    surface.listen(loud());

    expect(surface.at(listeningRow, MIDDLE)).toBe(LOUD);
    expect(silent(row(surface, BACK))).toBe(true);

    surface.advance();

    expect(surface.at(listeningRow - 1, MIDDLE)).toBe(LOUD);
    expect(silent(row(surface, BACK))).toBe(true);
  });

  it("lets older rows settle as they travel", () => {
    const settle = 1;
    const make = () =>
      new Field({
        rows: ROWS,
        columns: COLUMNS,
        asymmetry: 0,
        asymmetryKnots: KNOTS,
        focus: 0,
        lowestMode: TROUGH_MODE,
        highestMode: TROUGH_MODE,
        sharpness: SHARPNESS,
      });
    const rough = make();
    const settled = make();

    for (const surface of [rough, settled]) {
      surface.listen(loud());
      for (let step = 0; step < BACK; step++) {
        surface.advance();
      }
    }
    settled.settle(settle);

    const spread = (heights: number[]) => Math.max(...heights) - Math.min(...heights);

    expect(spread(row(settled, FRONT))).toBeLessThan(spread(row(rough, FRONT)));
  });

  it("carries what it heard forward one row at a time", () => {
    const surface = field();
    surface.listen(loud());

    for (let step = 0; step < BACK; step++) {
      expect(silent(row(surface, FRONT))).toBe(true);
      surface.advance();
    }

    expect(surface.at(FRONT, MIDDLE)).toBe(LOUD);
  });

  it("is tallest in the middle and mirrors about it", () => {
    const surface = field();
    surface.listen(Float32Array.from({ length: HALF_LENGTH }, (_, band) => (band + 1) / HALF_LENGTH));

    const heights = row(surface, BACK);

    expect(Math.max(...heights)).toBe(heights[MIDDLE]);
    expect(heights).toEqual([...heights].reverse());
  });

  it("keeps some height in its troughs when told not to cut all the way", () => {
    const shallow = new Field({
      rows: ROWS,
      columns: COLUMNS,
      asymmetry: 0,
      asymmetryKnots: KNOTS,
      focus: 0,
      lowestMode: TROUGH_MODE,
      highestMode: TROUGH_MODE,
      sharpness: SHARPNESS,
      depth: DEPTH,
    });
    shallow.listen(loud());

    expect(Math.min(...row(shallow, BACK))).toBeCloseTo(LOUD - DEPTH);
  });

  it("settles to nothing at the edges", () => {
    const surface = field();
    surface.listen(loud());

    expect(surface.at(BACK, EDGE)).toBeCloseTo(0);
  });

  it("lets the halves stray from each other when asked to", () => {
    const surface = field(LOUD);
    surface.listen(loud());

    const heights = row(surface, BACK);

    expect(heights).not.toEqual([...heights].reverse());
  });
});

describe("smooth noise", () => {
  it("stays within its range and meets its knots", () => {
    const values = [LOUD, -LOUD, LOUD, -LOUD];
    let next = 0;
    const noise = smoothNoise(HALF_LENGTH * KNOTS, KNOTS, () => (values[next++] + LOUD) / 2);

    expect(noise[0]).toBeCloseTo(LOUD);
    expect(noise[noise.length - 1]).toBeCloseTo(-LOUD);
    expect(Math.max(...noise)).toBeLessThanOrEqual(LOUD);
    expect(Math.min(...noise)).toBeGreaterThanOrEqual(-LOUD);
  });
});

describe("bands", () => {
  const SAMPLE_RATE = 48000;
  const FFT_SIZE = 2048;
  const BAND_COUNT = 8;
  const FULL = 255;
  const options = { sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE, lowestHz: 100, highestHz: 8000, warp: 1, contrast: 1 };

  it("reads a full-scale spectrum as full everywhere", () => {
    const out = bands(new Uint8Array(FFT_SIZE / 2).fill(FULL), options, new Float32Array(BAND_COUNT));

    expect([...out].every(level => level === LOUD)).toBe(true);
  });

  it("reads silence as silence", () => {
    const out = bands(new Uint8Array(FFT_SIZE / 2), options, new Float32Array(BAND_COUNT));

    expect([...out].every(level => level === 0)).toBe(true);
  });
});
