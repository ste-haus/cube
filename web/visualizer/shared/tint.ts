/**
 * A palette worked out from one reference colour, the one the glow is made of. The rest keep its
 * hue and step its saturation and lightness the way the shipped blues step from theirs, so the
 * shipped reference gives back the shipped palette and any other gives the same family in its own
 * hue.
 */

export type Rgb = [number, number, number];

export interface Tints {
  /** The reference itself: the body of the glow, and the loud end of the bars. */
  body: Rgb;
  /** A line at rest, dim and a little less saturated. */
  rest: Rgb;
  /** A line standing tall, and the core of the glow: nearly white, tinted with the hue. */
  peak: Rgb;
}

export const DEFAULT_REFERENCE = "#3d8bdc";

// How the shipped rest and peak sit against the shipped reference, which is hsl(210.6, 69%, 55%):
// rest is hsl(212.7, 43%, 30%) and peak hsl(208.1, 100%, 94%).
const REST_HUE_SHIFT = 2.16;
const REST_SATURATION = 0.617;
const REST_LIGHTNESS = 0.302;
const PEAK_HUE_SHIFT = -2.45;
const PEAK_SATURATION = 1.44;
const PEAK_LIGHTNESS = 0.937;

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const SHORT_HEX_LENGTH = 3;
const HEX_RADIX = 16;
const CHANNEL_MAX = 255;
const DEGREES = 360;
const SIXTH = 60;

/** The colour a hex string names, or null when it names none. */
export function parseHex(hex: string): Rgb | null {
  const match = HEX_PATTERN.exec(hex.trim());
  if (!match) {
    return null;
  }

  const digits = match[1].length === SHORT_HEX_LENGTH ? [...match[1]].map(digit => digit + digit).join("") : match[1];
  const value = parseInt(digits, HEX_RADIX);

  return [(value >> 16) & CHANNEL_MAX, (value >> 8) & CHANNEL_MAX, value & CHANNEL_MAX];
}

/** The palette for a reference colour, or for the shipped one when it is missing or unreadable. */
export function tints(reference: string | null): Tints {
  const body = (reference && parseHex(reference)) || (parseHex(DEFAULT_REFERENCE) as Rgb);
  const [hue, saturation] = toHsl(body);

  return {
    body,
    rest: fromHsl(hue + REST_HUE_SHIFT, saturation * REST_SATURATION, REST_LIGHTNESS),
    peak: fromHsl(hue + PEAK_HUE_SHIFT, saturation * PEAK_SATURATION, PEAK_LIGHTNESS),
  };
}

/** A colour as hue in degrees and saturation and lightness from 0 to 1. */
function toHsl([red, green, blue]: Rgb): [number, number, number] {
  const [r, g, b] = [red, green, blue].map(channel => channel / CHANNEL_MAX);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const chroma = max - min;

  if (chroma === 0) {
    return [0, 0, lightness];
  }

  const saturation = chroma / (1 - Math.abs(2 * lightness - 1));
  const sector = max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;

  return [(sector * SIXTH + DEGREES) % DEGREES, saturation, lightness];
}

function fromHsl(hue: number, saturation: number, lightness: number): Rgb {
  const s = Math.min(Math.max(saturation, 0), 1);
  const h = ((hue % DEGREES) + DEGREES) % DEGREES;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * s;
  const second = chroma * (1 - Math.abs(((h / SIXTH) % 2) - 1));
  const floor = lightness - chroma / 2;

  const sectors: Rgb[] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ];
  const [r, g, b] = sectors[Math.floor(h / SIXTH)];

  return [r, g, b].map(channel => Math.round((channel + floor) * CHANNEL_MAX)) as Rgb;
}
