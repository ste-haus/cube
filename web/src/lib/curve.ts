/*
 * Smooth curves through a chart's points, for the forecast.
 *
 * Each stretch between two points is monotone, by Steffen's method (the one d3 calls
 * curveMonotoneX): the curve passes through every point and never leaves the range between the two
 * either side of a stretch. A run of equal values stays level, a peak tops out at its own value,
 * and a chance of rain never dips below none, or rises past certain, between two hours that do not.
 */

export interface Point {
  x: number;
  y: number;
}

/** One cubic Bézier stretch of a curve, from one point to the next. */
export interface Segment {
  from: Point;
  leaving: Point;
  arriving: Point;
  to: Point;
}

const HALF = 0.5;
const THIRD = 1 / 3;
const LEVEL = 0;
const NO_PATH = "";

function sign(value: number): number {
  return value < 0 ? -1 : 1;
}

/**
 * The slope the curve passes through each point at.
 *
 * Between points, no steeper than twice the gentler of the slopes either side, and level at a peak
 * or a trough, which is what keeps each stretch from overshooting. At the ends, either level, or
 * leaning on the slope beside them.
 */
function tangents(points: Point[], levelEnds: boolean): number[] {
  const secants = points.slice(1).map((point, index) => (point.y - points[index].y) / (point.x - points[index].x));

  if (secants.length === 0) {
    return points.map(() => LEVEL);
  }

  const inner = secants.slice(1).map((after, index) => {
    const before = secants[index];
    const widthBefore = points[index + 1].x - points[index].x;
    const widthAfter = points[index + 2].x - points[index + 1].x;
    const blended = (before * widthAfter + after * widthBefore) / (widthBefore + widthAfter);

    return (sign(before) + sign(after)) * Math.min(Math.abs(before), Math.abs(after), HALF * Math.abs(blended));
  });

  if (levelEnds) {
    return [LEVEL, ...inner, LEVEL];
  }

  const firstSecant = secants[0];
  const lastSecant = secants[secants.length - 1];
  const first = inner.length === 0 ? firstSecant : firstSecant + (firstSecant - inner[0]) * HALF;
  const last = inner.length === 0 ? lastSecant : lastSecant + (lastSecant - inner[inner.length - 1]) * HALF;

  return [first, ...inner, last];
}

/** The curve through the points, as a stretch per pair. Level ends leave and arrive flat. */
export function segments(points: Point[], levelEnds = false): Segment[] {
  const slopes = tangents(points, levelEnds);

  return points.slice(1).map((to, index) => {
    const from = points[index];
    const reach = (to.x - from.x) * THIRD;

    return {
      from,
      leaving: { x: from.x + reach, y: from.y + slopes[index] * reach },
      arriving: { x: to.x - reach, y: to.y - slopes[index + 1] * reach },
      to,
    };
  });
}

function curveTo({ leaving, arriving, to }: Segment): string {
  return `C ${leaving.x},${leaving.y} ${arriving.x},${arriving.y} ${to.x},${to.y}`;
}

/** A smooth line through every point, starting and stopping at the first and last. */
export function curvePath(points: Point[]): string {
  if (points.length === 0) {
    return NO_PATH;
  }

  const [start] = points;

  return [`M ${start.x},${start.y}`, ...segments(points).map(curveTo)].join(" ");
}

/**
 * A smooth line through every point, run out level from the first to the left edge and from the
 * last to the right, so it spans the chart rather than stopping half a column in. Its ends leave
 * and arrive level, so it meets those runs without a kink.
 */
export function levelPath(points: Point[], left: number, right: number): string {
  if (points.length === 0) {
    return NO_PATH;
  }

  const first = points[0];
  const last = points[points.length - 1];

  return [
    `M ${left},${first.y}`,
    `L ${first.x},${first.y}`,
    ...segments(points, true).map(curveTo),
    `L ${right},${last.y}`,
  ].join(" ");
}

/** The area under a level path, closed along the baseline. */
export function areaPath(points: Point[], left: number, right: number, baseline: number): string {
  if (points.length === 0) {
    return NO_PATH;
  }

  return `${levelPath(points, left, right)} L ${right},${baseline} L ${left},${baseline} Z`;
}
