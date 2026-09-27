/**
 * The shape a line takes from one half of a spectrum, low bands first, the way a Rubens tube
 * would: each band sets up a standing wave along the line, lower bands with fewer crests and
 * higher ones with more, and the line stands as high at each point as those waves together,
 * weighted by how loud each band is. Every wave crests in the middle, so the middle is always the
 * tallest point and the halves mirror; a broad envelope settles the ends.
 */

import { blur } from "./noise";

export interface TubeOptions {
  points: number;
  /** How sharply the envelope favours the middle: one is a broad rise, higher narrows it. */
  focus: number;
  /** The standing waves the lowest and highest bands set up, as crests across half the line. */
  lowestMode: number;
  highestMode: number;
  /** Above one, each wave's crests narrow. */
  sharpness: number;
  /**
   * Above one, the loudest bands lead the sum rather than being averaged away by the rest; high
   * enough, a handful of them set the jets on their own, the way a few strong tones do in a real
   * tube.
   */
  emphasis?: number;
  /**
   * How far the troughs between crests may cut, from not at all to all the way to the floor. Less
   * than one keeps some of the line's height between its peaks rather than letting it drop flat.
   */
  depth?: number;
  /**
   * How many passes of blurring the shape gets, which rounds off the sawtooth where neighbouring
   * crests interfere without flattening the crests themselves. None unless told otherwise.
   */
  softness?: number;
}

export class RubensTube {
  private readonly options: TubeOptions;
  private readonly middle: number;
  private readonly profile: Float32Array;
  private readonly scratch: Float32Array;

  constructor(options: TubeOptions) {
    this.options = options;
    this.middle = (options.points - 1) / 2;
    this.profile = new Float32Array(options.points);
    this.scratch = new Float32Array(options.points);
  }

  /** How far a point is from the middle, as a fraction of half the line. */
  distance(point: number): number {
    return Math.abs(point - this.middle) / this.middle;
  }

  /** Which half of the line a point is in. */
  leftOfMiddle(point: number): boolean {
    return point < this.middle;
  }

  /** The line's height at each point for this spectrum, as high as its loudest band at most. */
  shape(half: Float32Array): Float32Array {
    const { focus, lowestMode, highestMode, sharpness, emphasis = 1, depth = 1, softness = 0 } = this.options;
    const last = Math.max(half.length - 1, 1);

    let total = 0;
    let loudest = 0;
    for (const level of half) {
      total += level ** emphasis;
      loudest = Math.max(loudest, level);
    }

    for (let point = 0; point < this.options.points; point++) {
      const distance = this.distance(point);

      let standing = 0;
      if (total > 0) {
        for (let band = 0; band < half.length; band++) {
          if (half[band] > 0) {
            const mode = lowestMode + ((highestMode - lowestMode) * band) / last;
            standing += half[band] ** emphasis * Math.abs(Math.cos(Math.PI * mode * distance)) ** sharpness;
          }
        }
        standing /= total;
      }

      const envelope = ((1 + Math.cos(distance * Math.PI)) / 2) ** focus;
      const shaped = 1 - depth + depth * standing;

      this.profile[point] = loudest * shaped * envelope;
    }

    for (let pass = 0; pass < softness; pass++) {
      blur(this.profile, 1, this.scratch);
    }

    return this.profile;
  }
}
