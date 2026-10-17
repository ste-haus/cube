import type { Oval } from "./gust";

/*
 * A thermostat as Home Assistant's `climate` entity has it: a mode, what the equipment is doing
 * about it, and a range it is held to, heating below the low and cooling above the high.
 *
 * Only heat and cool have one setpoint to work to, so only they have one the panel sets. Auto
 * works to both and off to neither; the panel shows their range and leaves it alone.
 */

export interface TemperatureRange {
  low: number;
  high: number;
}

export type Setpoint = keyof TemperatureRange;

/** A colour from the palette, or null for the resting grey. */
export type ModeColour = "primary" | "secondary" | null;

export const MODE_OFF = "off";
export const MODE_HEAT = "heat";
export const MODE_COOL = "cool";
export const MODE_AUTO = "auto";

const ACTION_HEATING = "heating";
const ACTION_COOLING = "cooling";

/** The modes the strip offers, in the order it offers them, of those the thermostat takes. */
export const STRIP_MODES = [MODE_OFF, MODE_HEAT, MODE_COOL, MODE_AUTO] as const;

const HEAT_COLOUR: ModeColour = "primary";
const COOL_COLOUR: ModeColour = "secondary";

const WHOLE = 1;

/** The dial has a hash for every degree, and a longer one for every fifth. */
const HASH_DEGREES = 1;
const MAJOR_HASH_EVERY = 5;

// How finely the dial's curve is measured to space its hashes evenly along it.
const ARC_SAMPLES = 240;

/** The setpoint the dial sets in this mode, or null when there is none to step. */
export function adjustable(mode: string | null): Setpoint | null {
  if (mode === MODE_HEAT) {
    return "low";
  }

  if (mode === MODE_COOL) {
    return "high";
  }

  return null;
}

/** Whether the equipment is running, which is when the card gives off air. */
export function running(action: string | null): boolean {
  return action === ACTION_HEATING || action === ACTION_COOLING;
}

/**
 * The card's colour: the mode's while it is heat or cool, whether or not the equipment is running,
 * and grey only while it is off. Auto takes whichever of the two the equipment is doing, and while
 * it idles, the one it would do next: heat if the house is nearer its low than its high, cool if
 * nearer its high.
 */
export function modeColour(
  mode: string | null,
  action: string | null,
  current: number | null = null,
  range: TemperatureRange | null = null,
): ModeColour {
  if (mode === MODE_HEAT) {
    return HEAT_COLOUR;
  }

  if (mode === MODE_COOL) {
    return COOL_COLOUR;
  }

  if (mode === MODE_AUTO && action === ACTION_HEATING) {
    return HEAT_COLOUR;
  }

  if (mode === MODE_AUTO && action === ACTION_COOLING) {
    return COOL_COLOUR;
  }

  if (mode === MODE_AUTO && current !== null && range !== null) {
    return current - range.low <= range.high - current ? HEAT_COLOUR : COOL_COLOUR;
  }

  return null;
}

/**
 * The range with one setpoint moved to `value`, held within the thermostat's limits and kept at
 * least a step from the other, so the low never meets the high.
 */
export function moveSetpoint(
  range: TemperatureRange,
  setpoint: Setpoint,
  value: number,
  step: number,
  min: number,
  max: number,
): TemperatureRange {
  const floor = setpoint === "high" ? Math.max(min, range.low + step) : min;
  const ceiling = setpoint === "low" ? Math.min(max, range.high - step) : max;

  return { ...range, [setpoint]: Math.min(Math.max(value, floor), ceiling) };
}

/**
 * How much a setpoint's figure grows while it is pulled past where it can go, `strain` degrees
 * past it: quickly at first, then less and less, towards `most` and never past it, as a band
 * pulled harder gives less.
 */
export function strainGrowth(strain: number, most: number, softness: number): number {
  return 1 + (most - 1) * (1 - Math.exp(-Math.max(strain, 0) / softness));
}

/** The hash nearest a value, which is where a setpoint dragged round the dial lands once let go. */
export function nearestHash(value: number): number {
  return Math.round(value / HASH_DEGREES) * HASH_DEGREES;
}

/** How many decimals the thermostat's step needs: none for whole degrees, one for halves. */
export function decimals(step: number): number {
  return step >= WHOLE ? 0 : 1;
}

export function sameRange(a: TemperatureRange | null, b: TemperatureRange | null): boolean {
  return a !== null && b !== null && a.low === b.low && a.high === b.high;
}

/** The modes the strip shows: the four it knows, of those the thermostat says it takes. */
export function stripModes(offered: readonly string[] | null): string[] {
  return STRIP_MODES.filter((mode) => offered?.includes(mode) ?? false);
}

/* --- The dial --- */

export interface Hash {
  value: number;
  major: boolean;
}

/** A hash for every degree between the thermostat's limits, the fifths longer. */
export function dialHashes(min: number, max: number): Hash[] {
  const hashes: Hash[] = [];

  for (let value = Math.ceil(min / HASH_DEGREES) * HASH_DEGREES; value <= max; value += HASH_DEGREES) {
    hashes.push({ value, major: value % MAJOR_HASH_EVERY === 0 });
  }

  return hashes;
}

/** Where the selected setpoint sits along the dial: its middle, level with the figures. */
export const DIAL_MIDDLE = 0.5;
// How much of each end of the dial a hash fades over as it leaves.
const DIAL_FADE = 0.15;

/**
 * How far along the dial a hash sits while `selected` is the setpoint at its middle, with `span`
 * degrees from one end of the dial to the other; outside 0 to 1 it is off the dial.
 */
export function dialPosition(value: number, selected: number, span: number): number {
  return DIAL_MIDDLE + (value - selected) / span;
}

/** How strongly a hash shows at a place along the dial: fully, but for fading out at the ends. */
export function dialFade(fraction: number): number {
  const fromEnd = Math.min(fraction, 1 - fraction);

  return Math.min(Math.max(fromEnd / DIAL_FADE, 0), 1);
}

export interface DialMark {
  x: number;
  y: number;
  // The way into the oval, a unit long.
  nx: number;
  ny: number;
}

/**
 * The dial's curve: the oval's inside edge, from `sweep` below its middle round its far side to
 * `sweep` above, measured as the angle about its centre (zero at the far side). Fractions run along
 * it by length, from the bottom (0) to the top (1), so evenly spaced degrees are evenly spaced
 * hashes even where the oval curves hardest.
 */
export class DialArc {
  readonly oval: Oval;
  readonly sweep: number;
  // The length along the curve to each sample, as a fraction of the whole, bottom first.
  #lengths: number[] = [];

  constructor(oval: Oval, sweep: number) {
    this.oval = oval;
    this.sweep = sweep;

    let travelled = 0;
    let last = this.#onCurve(this.#angle(0));
    this.#lengths.push(0);

    for (let sample = 1; sample <= ARC_SAMPLES; sample += 1) {
      const point = this.#onCurve(this.#angle(sample));
      travelled += Math.hypot(point.x - last.x, point.y - last.y);
      this.#lengths.push(travelled);
      last = point;
    }

    this.#lengths = this.#lengths.map((length) => (travelled > 0 ? length / travelled : 0));
  }

  /** The point `fraction` of the way along, `inset` into the oval from its edge. */
  mark(fraction: number, inset = 0): DialMark {
    const angle = this.#angleAt(fraction);
    const { rx, ry } = this.oval;
    const edge = this.#onCurve(angle);
    // The outward normal of an ellipse at an angle runs along (cos / rx, sin / ry).
    const outX = Math.cos(angle) / rx;
    const outY = Math.sin(angle) / ry;
    const length = Math.hypot(outX, outY);
    const nx = -outX / length;
    const ny = -outY / length;

    return { x: edge.x + nx * inset, y: edge.y + ny * inset, nx, ny };
  }

  /** How far along the curve a point is, by the angle to it about the centre, held to the ends. */
  fractionToward(x: number, y: number): number {
    const { cx, cy, rx, ry } = this.oval;
    const angle = Math.min(Math.max(Math.atan2((y - cy) / ry, (x - cx) / rx), -this.sweep), this.sweep);
    const position = ((this.sweep - angle) / (2 * this.sweep)) * ARC_SAMPLES;
    const below = Math.floor(position);
    const above = Math.min(below + 1, ARC_SAMPLES);

    return this.#lengths[below] + (this.#lengths[above] - this.#lengths[below]) * (position - below);
  }

  /* Bottom first: screen y runs down, so the bottom is the positive angle. */
  #angle(sample: number): number {
    return this.sweep - (2 * this.sweep * sample) / ARC_SAMPLES;
  }

  #onCurve(angle: number): { x: number; y: number } {
    const { cx, cy, rx, ry } = this.oval;

    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  }

  #angleAt(fraction: number): number {
    const target = Math.min(Math.max(fraction, 0), 1);
    let low = 0;
    let high = ARC_SAMPLES;

    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (this.#lengths[middle] <= target) {
        low = middle;
      } else {
        high = middle;
      }
    }

    const span = this.#lengths[high] - this.#lengths[low];
    const within = span > 0 ? (target - this.#lengths[low]) / span : 0;

    return this.#angle(low + within);
  }
}
