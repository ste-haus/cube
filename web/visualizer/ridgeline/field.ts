/**
 * The surface the ridgeline visualizer draws: rows of samples that enter at the back of the plane and
 * travel to the front, one row per sample.
 *
 * One row listens. It is rewritten from the live spectrum until the next row arrives behind it,
 * and from then on it carries what was heard while it was listening; the rows behind it have
 * heard nothing yet. That is the history; the undulation and the static are laid over it when the
 * surface is read, so a row keeps moving after it stops listening. Each row is dealt its own phases and its own straying between halves when it is made
 * and keeps them as it travels, so moving forward a place never changes how a row moves.
 */

const FULL_TURN = Math.PI * 2;

/** A value that varies smoothly along a row: random at a few knots, eased between them. */
export function smoothNoise(length: number, knots: number, random: () => number): Float32Array {
  const values = Array.from({ length: knots + 1 }, () => random() * 2 - 1);
  const out = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    const position = (i / Math.max(length - 1, 1)) * knots;
    const knot = Math.min(Math.floor(position), knots - 1);
    const eased = (1 - Math.cos((position - knot) * Math.PI)) / 2;

    out[i] = values[knot] + (values[knot + 1] - values[knot]) * eased;
  }

  return out;
}

interface Skew {
  left: Float32Array;
  right: Float32Array;
}

export interface FieldOptions {
  rows: number;
  columns: number;
  /** How far either side may stray from the other, as a fraction of the height there. */
  asymmetry: number;
  /** How many bends that straying has across one half of a row. */
  asymmetryKnots: number;
  /** How sharply the row's envelope favours the middle: one is a broad rise, higher narrows it. */
  focus: number;
  /** The standing waves the lowest and highest bands set up, as crests across half a row. */
  lowestMode: number;
  highestMode: number;
  /** Above one, each wave's crests narrow. */
  sharpness: number;
  /**
   * Above one, the loudest bands lead the sum rather than being averaged away by the rest; high
   * enough, a handful of them set the row's jets on their own, the way a few strong tones do in a
   * real tube.
   */
  emphasis?: number;
  /**
   * How far the troughs between crests may cut, from not at all to all the way to the floor. Less
   * than one keeps some of the line's height between its peaks rather than letting it drop flat.
   */
  depth?: number;
  /**
   * How many passes of blurring a new line's shape gets as it is heard, which rounds off the
   * sawtooth where neighbouring crests interfere without flattening the crests themselves. None
   * unless told otherwise.
   */
  softness?: number;
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
  private readonly profile: Float32Array;
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
    this.profile = new Float32Array(options.columns);
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
   * Rewrite the listening row from one half of a spectrum, low bands first, the way a Rubens tube
   * would: each band sets up a standing wave along the row, lower bands with fewer crests and
   * higher ones with more, and the row stands as high at each point as those waves together,
   * weighted by how loud each band is. Every wave crests in the middle, so the middle is always
   * the tallest point and the halves mirror; a broad envelope settles the edges. Each side strays
   * from the other by its own noise, so the two halves echo each other without matching; the
   * straying grows from nothing at the centre, where the halves meet. The rows behind take the
   * same shape, quieter, each through its own straying.
   */
  listen(half: Float32Array): void {
    const { focus, lowestMode, highestMode, sharpness, emphasis = 1, depth = 1 } = this.options;
    const last = Math.max(half.length - 1, 1);

    let total = 0;
    let loudest = 0;
    for (const level of half) {
      total += level ** emphasis;
      loudest = Math.max(loudest, level);
    }

    for (let column = 0; column < this.columns; column++) {
      const distance = Math.abs(column - this.middle) / this.middle;

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

      this.profile[column] = loudest * shaped * envelope;
    }

    const { softness = 0 } = this.options;
    for (let pass = 0; pass < softness; pass++) {
      this.smooth(this.profile, 1);
    }

    this.write(this.listening);
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
      this.smooth(this.samples[row], amount);
    }
  }

  /** Blend a row toward the average of each point and its neighbours, by `amount`. */
  private smooth(row: Float32Array, amount: number): void {
    this.scratch.set(row);

    for (let column = 0; column < this.columns; column++) {
      const left = this.scratch[Math.max(column - 1, 0)];
      const right = this.scratch[Math.min(column + 1, this.columns - 1)];
      const blurred = (left + this.scratch[column] * 2 + right) / 4;

      row[column] += (blurred - row[column]) * amount;
    }
  }

  /** Lay the profile into a row, through that row's own straying. */
  private write(row: number): void {
    const target = this.samples[row];
    const { left, right } = this.skews[row];
    const { asymmetry } = this.options;

    for (let column = 0; column < this.columns; column++) {
      const distance = Math.abs(column - this.middle) / this.middle;
      const side = column < this.middle ? left : right;
      const skew = 1 + asymmetry * distance * side[Math.round(distance * (side.length - 1))];

      target[column] = Math.max(this.profile[column] * skew, 0);
    }
  }

  private turn(): number {
    return this.random() * FULL_TURN;
  }

  private shimmer(): Float32Array {
    const knots = this.options.shimmerKnots ?? this.columns;

    return smoothNoise(this.columns, knots, this.random).map(value => value * FULL_TURN);
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
