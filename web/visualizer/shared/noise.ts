/** Noise that moves smoothly, in space and in time, so what it roughens does not flicker. */

const FULL_TURN = Math.PI * 2;

// Each point wanders on two slow waves at unrelated speeds, which reads as noise without the
// flicker of a fresh random value every frame.
const WANDER_SPEED = 5.3;
const WANDER_SECOND_SPEED = 8.1;
const WANDER_SECOND_PHASE = 2.7;

/** A value that varies smoothly along a line: random at a few knots, eased between them. */
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

/**
 * Phases for `wander`, one per point, bending `knots` times along the line. Fewer knots than
 * points keeps neighbours in step, so what wanders ripples rather than zigzagging.
 */
export function shimmer(length: number, knots: number, random: () => number): Float32Array {
  return smoothNoise(length, knots, random).map(value => value * FULL_TURN);
}

/** Where a point with the given phase has wandered to at a moment, between -1 and 1. */
export function wander(seconds: number, phase: number): number {
  return (Math.sin(seconds * WANDER_SPEED + phase) + Math.sin(seconds * WANDER_SECOND_SPEED + phase * WANDER_SECOND_PHASE)) / 2;
}

/**
 * Blend a line toward the average of each point and its neighbours, by `amount`. `scratch` is as
 * long as the line; `wraps` joins the ends, for a line drawn round a circle.
 */
export function blur(line: Float32Array, amount: number, scratch: Float32Array, wraps = false): void {
  scratch.set(line);
  const last = line.length - 1;

  for (let point = 0; point <= last; point++) {
    const before = point > 0 ? point - 1 : wraps ? last : 0;
    const after = point < last ? point + 1 : wraps ? 0 : last;
    const blurred = (scratch[before] + scratch[point] * 2 + scratch[after]) / 4;

    line[point] += (blurred - line[point]) * amount;
  }
}
