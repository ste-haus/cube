/*
 * The colour wheel the room light's colour is picked on: hue round a ring, red at the top and
 * running clockwise, with the light's default colour in the middle. Home Assistant gives and takes a
 * colour as a hue in degrees and a saturation in percent, at full value.
 */

export interface HueSaturation {
  hue: number;
  saturation: number;
}

/** A colour as a point on the CIE chart, the way a Home Assistant light profile gives one. */
export interface XyPoint {
  x: number;
  y: number;
}

const FULL_TURN_DEGREES = 360;
const QUARTER_TURN_DEGREES = 90;
const RADIANS_PER_DEGREE = Math.PI / 180;

/** A hue picked on the ring is the colour at its fullest. */
export const FULL_SATURATION = 100;

/** How long a light is held to open its colour window rather than switch it. */
export const COLOUR_HOLD_MS = 600;

const PERCENT = 100;
const RGB_MAX = 255;
const HEX_RADIX = 16;
const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const LONG_HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HUE_SECTORS = 6;
const DEGREES_PER_SECTOR = FULL_TURN_DEGREES / HUE_SECTORS;

// How close two colours are to be the same one, since Home Assistant rounds what it is sent.
const SAME_HUE_DEGREES = 3;
const SAME_SATURATION = 5;

// How the eye weighs red, green, and blue, and the lightness over which dark type reads better.
const LUMA = [0.299, 0.587, 0.114];
const LIGHT_BELOW_LUMA = 0.5;

// The colour modes that take a hue; a light with only brightness or colour temperature does not.
const HUE_MODES = new Set(["hs", "rgb", "xy", "rgbw", "rgbww"]);

export function takesHue(modes: readonly string[] | null | undefined): boolean {
  return (modes ?? []).some((mode) => HUE_MODES.has(mode));
}

/** Whether two colours are the same one, give or take Home Assistant's rounding. */
export function sameColour(a: HueSaturation | null, b: HueSaturation | null): boolean {
  if (a === null || b === null) {
    return false;
  }

  return hueGap(a.hue, b.hue) <= SAME_HUE_DEGREES && Math.abs(a.saturation - b.saturation) <= SAME_SATURATION;
}

/** How far apart two hues are, the short way round the ring. */
export function hueGap(a: number, b: number): number {
  const apart = Math.abs(a - b) % FULL_TURN_DEGREES;

  return Math.min(apart, FULL_TURN_DEGREES - apart);
}

/** A hex colour's hue and saturation, as Home Assistant would take it, or null for anything else. */
export function hexToHueSaturation(hex: string): HueSaturation | null {
  const match = SHORT_HEX.exec(hex) ?? LONG_HEX.exec(hex);
  if (!match) {
    return null;
  }

  const [red, green, blue] = match
    .slice(1)
    .map((part) => parseInt(part.length === 1 ? part + part : part, HEX_RADIX) / RGB_MAX);
  const high = Math.max(red, green, blue);
  const spread = high - Math.min(red, green, blue);

  let sector = 0;
  if (spread > 0 && high === red) {
    sector = ((green - blue) / spread + HUE_SECTORS) % HUE_SECTORS;
  } else if (spread > 0 && high === green) {
    sector = (blue - red) / spread + 2;
  } else if (spread > 0) {
    sector = (red - green) / spread + 4;
  }

  return { hue: sector * DEGREES_PER_SECTOR, saturation: high === 0 ? 0 : (spread / high) * PERCENT };
}

/** A colour's red, green, and blue, each out of 255, at full value. */
export function rgbOf(colour: HueSaturation): [number, number, number] {
  const saturation = colour.saturation / PERCENT;
  const channel = (offset: number) => {
    const k = (offset + colour.hue / DEGREES_PER_SECTOR) % HUE_SECTORS;

    return Math.round((1 - saturation * Math.max(0, Math.min(k, 4 - k, 1))) * RGB_MAX);
  };

  return [channel(5), channel(3), channel(1)];
}

/** A colour as CSS draws it. */
export function colourOf(colour: HueSaturation): string {
  return `rgb(${rgbOf(colour).join(" ")})`;
}

/** Whether type over the colour reads better light than dark. */
export function wantsLightType(colour: HueSaturation): boolean {
  const luma = rgbOf(colour).reduce((sum, value, index) => sum + (value / RGB_MAX) * LUMA[index], 0);

  return luma < LIGHT_BELOW_LUMA;
}

/** Reads Home Assistant's `hs_color`, or null for anything else. */
export function readHueSaturation(value: unknown): HueSaturation | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const [hue, saturation] = value.map(Number);

  return Number.isFinite(hue) && Number.isFinite(saturation) ? { hue, saturation } : null;
}

/** The hue at a point on the ring, from its offset from the ring's centre, to the whole degree. */
export function hueAt(dx: number, dy: number): number {
  const fromTop = Math.atan2(dy, dx) / RADIANS_PER_DEGREE + QUARTER_TURN_DEGREES;

  return Math.round(((fromTop % FULL_TURN_DEGREES) + FULL_TURN_DEGREES) % FULL_TURN_DEGREES);
}

/** Where on a circle of `radius` round (`cx`, `cy`) a hue sits. */
export function pointAtHue(hue: number, cx: number, cy: number, radius: number): { x: number; y: number } {
  const radians = (hue - QUARTER_TURN_DEGREES) * RADIANS_PER_DEGREE;

  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

// Home Assistant's own way from a CIE xy point to red, green, and blue: the matrix, and sRGB's gamma.
const XY_TO_RGB = [
  [1.656492, -0.354851, -0.255038],
  [-0.707196, 1.655397, 0.036152],
  [0.051713, -0.121364, 1.01153],
];
const GAMMA_KNEE = 0.0031308;
const GAMMA_LINEAR = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_EXPONENT = 1 / 2.4;

function gamma(value: number): number {
  const corrected =
    value <= GAMMA_KNEE ? GAMMA_LINEAR * value : (1 + GAMMA_OFFSET) * Math.pow(value, GAMMA_EXPONENT) - GAMMA_OFFSET;

  return Math.max(0, corrected);
}

/** The hue and saturation Home Assistant reports for a light set to a point on the CIE chart. */
export function xyToHueSaturation({ x, y }: XyPoint): HueSaturation {
  const luminance = 1;
  const tristimulus = [(luminance / y) * x, luminance, (luminance / y) * (1 - x - y)];
  const [red, green, blue] = XY_TO_RGB.map((row) => gamma(row.reduce((sum, weight, i) => sum + weight * tristimulus[i], 0)));
  const high = Math.max(red, green, blue);
  const hex = `#${[red, green, blue].map((channel) => Math.round((channel / high) * RGB_MAX).toString(HEX_RADIX).padStart(2, "0")).join("")}`;

  return hexToHueSaturation(hex) ?? { hue: 0, saturation: 0 };
}

