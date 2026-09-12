import type { TemperatureStop } from "./types";

const HEX_PREFIX = "#";
const HEX_RADIX = 16;
const CHANNEL_DIGITS = 2;
const SHORT_HEX_DIGITS = 3;
const LONG_HEX_DIGITS = 6;

const PERCENT = 100;
const GRADIENT_DIRECTION = "to right";

type Rgb = [number, number, number];

/** A `#rgb` or `#rrggbb` color as channels, or null for anything else. */
function channels(color: string): Rgb | null {
  if (!color.startsWith(HEX_PREFIX)) {
    return null;
  }

  let digits = color.slice(HEX_PREFIX.length);
  if (digits.length === SHORT_HEX_DIGITS) {
    digits = [...digits].map((digit) => digit + digit).join("");
  }

  if (digits.length !== LONG_HEX_DIGITS || !/^[0-9a-f]+$/i.test(digits)) {
    return null;
  }

  const read = (index: number) =>
    parseInt(digits.slice(index * CHANNEL_DIGITS, (index + 1) * CHANNEL_DIGITS), HEX_RADIX);

  return [read(0), read(1), read(2)];
}

function hex(rgb: Rgb): string {
  return HEX_PREFIX + rgb.map((channel) => Math.round(channel).toString(HEX_RADIX).padStart(CHANNEL_DIGITS, "0")).join("");
}

/**
 * The color the gradient gives a temperature: blended between the stops either side of it, and
 * held at the end color past either end. Stops arrive sorted from the config.
 *
 * A stop written as something other than a hex color cannot be blended, so the band it bounds
 * takes the lower stop's color outright rather than guessing.
 */
export function colorAt(stops: TemperatureStop[], value: number): string {
  const first = stops[0];
  const last = stops[stops.length - 1];

  if (value <= first.at) {
    return first.color;
  }

  if (value >= last.at) {
    return last.color;
  }

  const upperIndex = stops.findIndex((stop) => stop.at > value);
  const lower = stops[upperIndex - 1];
  const upper = stops[upperIndex];

  const from = channels(lower.color);
  const to = channels(upper.color);
  if (!from || !to) {
    return lower.color;
  }

  const fraction = (value - lower.at) / (upper.at - lower.at);

  return hex(from.map((channel, index) => channel + (to[index] - channel) * fraction) as Rgb);
}

export interface GradientStop {
  /** Percent of the way along the bar. */
  offset: number;
  color: string;
}

/**
 * The stretch of the gradient between two temperatures, as stops across a bar.
 *
 * The ends are the colors those temperatures actually take, and every configured stop between
 * them is kept where it falls, so a bar spanning a mild day and one spanning a heatwave are cut
 * from the same scale rather than each stretched to fill its width.
 */
export function gradientBetween(stops: TemperatureStop[], low: number, high: number): GradientStop[] {
  if (high <= low) {
    const color = colorAt(stops, low);

    return [
      { offset: 0, color },
      { offset: PERCENT, color },
    ];
  }

  const span = high - low;
  const inner = stops
    .filter((stop) => stop.at > low && stop.at < high)
    .map((stop) => ({ offset: ((stop.at - low) / span) * PERCENT, color: stop.color }));

  return [{ offset: 0, color: colorAt(stops, low) }, ...inner, { offset: PERCENT, color: colorAt(stops, high) }];
}

export function cssGradient(stops: GradientStop[]): string {
  const parts = stops.map((stop) => `${stop.color} ${stop.offset}%`);

  return `linear-gradient(${GRADIENT_DIRECTION}, ${parts.join(", ")})`;
}

/** How far a value falls between two others, as a percentage held between the two. */
export function percentAlong(value: number, low: number, high: number): number {
  if (high <= low) {
    return PERCENT / 2;
  }

  return Math.min(Math.max(((value - low) / (high - low)) * PERCENT, 0), PERCENT);
}
