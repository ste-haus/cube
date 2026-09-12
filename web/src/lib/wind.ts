/* The wind's direction, as a compass bearing and as the way it is blowing. */

const FULL_TURN = 360;
const HALF_TURN = 180;

/* The sixteen points some providers give a bearing as, in order clockwise from north. */
const COMPASS_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const POINT_SPAN = FULL_TURN / COMPASS_POINTS.length;

function normalized(degrees: number): number {
  return ((degrees % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

/** A bearing in degrees clockwise from north, from a number of degrees or a compass point. */
export function bearingDegrees(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? normalized(value) : null;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const point = COMPASS_POINTS.indexOf(value.trim().toUpperCase());
  if (point >= 0) {
    return point * POINT_SPAN;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? normalized(parsed) : null;
}

/** The way the wind is blowing. A bearing says where it comes from, so this is the other way. */
export function downwind(bearing: number): number {
  return normalized(bearing + HALF_TURN);
}

/**
 * A gust worth giving, in whole units, or null. It has to reach the threshold, and to be stronger
 * than the steady wind it gusts over; a gust no stronger than the wind says nothing about it.
 */
export function meaningfulGust(speed: number | null, gust: number | null, threshold: number): number | null {
  if (speed === null || gust === null) {
    return null;
  }

  const rounded = Math.round(gust);

  return rounded >= threshold && rounded > Math.round(speed) ? rounded : null;
}

/** Where a point sits at a distance along a bearing from the centre, x to the right and y down. */
export function along(bearing: number, distance: number): { x: number; y: number } {
  const radians = (bearing * Math.PI) / HALF_TURN;

  return { x: Math.sin(radians) * distance, y: -Math.cos(radians) * distance };
}
