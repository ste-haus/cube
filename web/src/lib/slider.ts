import { ha, STATE_ON } from "./state.svelte";

/*
 * What a slider's bar reads and sets, as a percentage: a light's brightness, or how far open a
 * cover is. Home Assistant gives a light's brightness out of 255 and a cover's position out of 100.
 */

const PERCENT = 100;
const BRIGHTNESS_MAX = 255;

const LIGHT_DOMAIN = "light";
const BRIGHTNESS_ATTRIBUTE = "brightness";
const POSITION_ATTRIBUTE = "current_position";
const STATE_OPEN = "open";

function clamp(value: number): number {
  return Math.min(PERCENT, Math.max(0, value));
}

/*
 * The dial's arc: 270 degrees, open at the bottom, running clockwise from its lower left. Angles
 * are the screen's, clockwise from three o'clock.
 */
export const DIAL_START_DEGREES = 135;
export const DIAL_SWEEP_DEGREES = 270;
const FULL_TURN_DEGREES = 360;
const RADIANS_PER_DEGREE = Math.PI / 180;

/**
 * How far round the dial a point is, to the whole percent, from its offset from the dial's centre.
 * A point in the gap at the bottom goes to whichever end of the arc it is nearer.
 */
export function percentRound(dx: number, dy: number): number {
  const degrees = Math.atan2(dy, dx) / RADIANS_PER_DEGREE;
  const along = (((degrees - DIAL_START_DEGREES) % FULL_TURN_DEGREES) + FULL_TURN_DEGREES) % FULL_TURN_DEGREES;

  if (along > DIAL_SWEEP_DEGREES) {
    const gapMiddle = (DIAL_SWEEP_DEGREES + FULL_TURN_DEGREES) / 2;

    return along < gapMiddle ? PERCENT : 0;
  }

  return clamp(Math.round((along / DIAL_SWEEP_DEGREES) * PERCENT));
}

/** Where on a circle of `radius` round (`cx`, `cy`) the dial reads `percent`. */
export function pointRound(percent: number, cx: number, cy: number, radius: number): { x: number; y: number } {
  const radians = (DIAL_START_DEGREES + (clamp(percent) / PERCENT) * DIAL_SWEEP_DEGREES) * RADIANS_PER_DEGREE;

  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

/** How far along the bar a point is, to the whole percent. */
export function percentAlong(clientX: number, bar: { left: number; width: number }): number {
  if (bar.width <= 0) {
    return 0;
  }

  return clamp(Math.round(((clientX - bar.left) / bar.width) * PERCENT));
}

/** How far on a light is, or how far open a cover, with nothing known reading as nothing. */
export function sliderPercent(entityId: string): number {
  const [domain] = entityId.split(".");
  const state = ha.state(entityId);

  if (domain === LIGHT_DOMAIN) {
    if (state !== STATE_ON) {
      return 0;
    }

    const brightness = ha.attribute<number>(entityId, BRIGHTNESS_ATTRIBUTE);

    // A light that is on with no brightness to give cannot be dimmed, and is all the way on.
    return brightness === null ? PERCENT : clamp(Math.round((brightness / BRIGHTNESS_MAX) * PERCENT));
  }

  const position = ha.attribute<number>(entityId, POSITION_ATTRIBUTE);
  if (position !== null) {
    return clamp(Math.round(position));
  }

  return state === STATE_OPEN ? PERCENT : 0;
}

/**
 * Where a tap sends a bar that opens to a set position rather than all the way: shut if it is open
 * at all, and to that position if it is shut. Slatted blinds open level at half way, and a tap is
 * for open or shut, not for tilting them all the way over.
 */
export function tapPosition(value: number, togglePosition: number): number {
  return value > 0 ? 0 : togglePosition;
}
