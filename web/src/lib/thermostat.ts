/*
 * A thermostat as Home Assistant's `climate` entity has it: a mode, what the equipment is doing
 * about it, and a range it is held to, heating below the low and cooling above the high.
 *
 * Only heat and cool have one setpoint to work to, so only they have one the panel steps. Auto
 * works to both and off to neither; the panel shows their range and leaves it alone.
 */

export interface TemperatureRange {
  low: number;
  high: number;
}

export type Setpoint = keyof TemperatureRange;
export type StepDirection = 1 | -1;

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

/** The setpoint the arrows step in this mode, or null when there is none to step. */
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
 * The range with one setpoint stepped, held within the thermostat's limits and kept at least a
 * step from the other, so the low never meets the high.
 */
export function stepRange(
  range: TemperatureRange,
  setpoint: Setpoint,
  direction: StepDirection,
  step: number,
  min: number,
  max: number,
): TemperatureRange {
  const floor = setpoint === "high" ? Math.max(min, range.low + step) : min;
  const ceiling = setpoint === "low" ? Math.min(max, range.high - step) : max;
  const stepped = snap(range[setpoint] + direction * step, step);

  return { ...range, [setpoint]: Math.min(Math.max(stepped, floor), ceiling) };
}

/** Onto the step, so a value set elsewhere at a finer one lands on it once pressed. */
function snap(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(decimals(step)));
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
