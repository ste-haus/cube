/**
 * The surface the ridgeline visualizer draws: rows of samples that enter at the back of the plane and
 * travel to the front, one row per sample.
 *
 * One row listens. It is rewritten from the live spectrum until the next row arrives behind it,
 * and from then on it carries what was heard while it was listening; the rows behind it have
 * heard nothing yet. That is the history; the undulation and the static are laid over it when the
 * surface is read, so a row keeps moving after it stops listening. Each row is dealt its own
 * phases and its own straying between halves when it is made and keeps them as it travels, so
 * moving forward a place never changes how a row moves.
 */

import { blur, shimmer, smoothNoise } from "../shared/noise";
import { RubensTube, type TubeOptions } from "../shared/rubens";

const FULL_TURN = Math.PI * 2;

interface Skew {
  left: Float32Array;
  right: Float32Array;
}

export interface FieldOptions extends Omit<TubeOptions, "points"> {
  rows: number;
  columns: number;
  /** How far either side may stray from the other, as a fraction of the height there. */
  asymmetry: number;
  /** How many bends that straying has across one half of a row. */
  asymmetryKnots: number;
  /**
   * How many bends the static's phases take across a row. Fewer than there are columns keeps
   * neighbouring points in step, so the static ripples rather than zigzagging point to point. One
   * per column unless told otherwise.
   */
  shimmerKnots?: number;
  /** Which row listens, counted from the front. The back row unless told otherwise. */
  listeningRow?: number;
  random?: () => number;
}

export class Field {
  readonly rows: number;
  readonly columns: number;

  // Front first, so a row's index is how close it is to the viewer.
  private samples: Float32Array[];
  private phases: number[];
  private shimmers: Float32Array[];
  private skews: Skew[];
  private readonly tube: RubensTube;
  private readonly scratch: Float32Array;

  private readonly options: FieldOptions;
  private readonly random: () => number;
  private readonly middle: number;
  private readonly listening: number;

  constructor(options: FieldOptions) {
    this.options = options;
    this.rows = options.rows;
    this.columns = options.columns;
    this.random = options.random ?? Math.random;
    this.middle = (options.columns - 1) / 2;
    this.listening = Math.min(Math.max(options.listeningRow ?? options.rows - 1, 1), options.rows - 1);

    this.samples = Array.from({ length: options.rows }, () => new Float32Array(options.columns));
    this.phases = Array.from({ length: options.rows }, () => this.turn());
    this.shimmers = Array.from({ length: options.rows }, () => this.shimmer());
    this.skews = Array.from({ length: options.rows }, () => this.drawSkew());
    this.tube = new RubensTube({ ...options, points: options.columns });
    this.scratch = new Float32Array(options.columns);
  }

  /** The height stored at a point, before anything is laid over it. */
  at(row: number, column: number): number {
    return this.samples[row][column];
  }

  /** Where a row is in its undulation, fixed for the life of the row. */
  phase(row: number): number {
    return this.phases[row];
  }

  /** Where a point is in its static, fixed for the life of the row. */
  shimmerAt(row: number, column: number): number {
    return this.shimmers[row][column];
  }

  /**
   * Rewrite the listening row from one half of a spectrum, low bands first, shaped the way a
   * Rubens tube would shape it. Each side strays from the other by its own noise, so the two
   * halves echo each other without matching; the straying grows from nothing at the centre,
   * where the halves meet.
   */
  listen(half: Float32Array): void {
    this.write(this.listening, this.tube.shape(half));
  }

  /**
   * Move every row one step forward. The front row falls off and comes back silent at the back.
   * The row arriving at the listening place starts as a copy of the one that just left it, so
   * nothing jumps before it next listens.
   */
  advance(): void {
    const front = this.samples.shift()!;

    front.fill(0);
    this.samples.push(front);
    this.samples[this.listening].set(this.samples[this.listening - 1]);

    this.phases.shift();
    this.phases.push(this.turn());
    this.shimmers.shift();
    this.shimmers.push(this.shimmer());

    this.skews.shift();
    this.skews.push(this.drawSkew());
  }

  /**
   * Smooth away some of the fine detail in every row ahead of the listening row, by `amount` from
   * none to a full pass of blurring, so older sound settles into swells as it travels. Meant to be
   * called a little every frame rather than a lot every step, so a row melts rather than jumps.
   */
  settle(amount: number): void {
    for (let row = 0; row < this.listening; row++) {
      blur(this.samples[row], amount, this.scratch);
    }
  }

  /** Lay a shape into a row, through that row's own straying. */
  private write(row: number, profile: Float32Array): void {
    const target = this.samples[row];
    const { left, right } = this.skews[row];
    const { asymmetry } = this.options;

    for (let column = 0; column < this.columns; column++) {
      const distance = this.tube.distance(column);
      const side = this.tube.leftOfMiddle(column) ? left : right;
      const skew = 1 + asymmetry * distance * side[Math.round(distance * (side.length - 1))];

      target[column] = Math.max(profile[column] * skew, 0);
    }
  }

  private turn(): number {
    return this.random() * FULL_TURN;
  }

  private shimmer(): Float32Array {
    return shimmer(this.columns, this.options.shimmerKnots ?? this.columns, this.random);
  }

  private drawSkew(): Skew {
    const length = Math.floor(this.middle) + 1;
    const { asymmetryKnots } = this.options;

    return {
      left: smoothNoise(length, asymmetryKnots, this.random),
      right: smoothNoise(length, asymmetryKnots, this.random),
    };
  }
}
