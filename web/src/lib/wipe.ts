import { cubicIn, cubicInOut, cubicOut } from "svelte/easing";
import type { TransitionConfig } from "svelte/transition";

/*
 * A row that comes and goes by wiping across, left to right both ways, the way a readout is
 * written and struck through.
 *
 * Arriving, it opens a row's worth of room first and then wipes in, so what is below it moves
 * out of the way before anything is drawn over it. Leaving, it wipes out first and then closes
 * the room it left, so the rows below slide up rather than jumping.
 *
 * Something that comes out of a control rather than taking a row of its own wipes with
 * `wipeFromStart`: written in away from the control, and erased back into it.
 */

export const WIPE_MS = 520;

// How much of each wipe goes to the row opening or closing; the rest is the wipe itself.
const OPEN_SHARE = 0.35;
const CLOSE_SHARE = 0.35;
const WHOLE = 1;
const PERCENT = 100;

interface Row {
  height: number;
  paddingTop: number;
  paddingBottom: number;
}

function measure(node: HTMLElement): Row {
  const style = getComputedStyle(node);

  return {
    height: node.offsetHeight,
    paddingTop: parseFloat(style.paddingTop),
    paddingBottom: parseFloat(style.paddingBottom),
  };
}

/**
 * The row at some fraction of its height, padding and all, with nothing spilling out of it. It
 * keeps to one line while it moves, rather than rewrapping as the room it has comes and goes.
 */
function sized(row: Row, fraction: number): string {
  return [
    "box-sizing: border-box",
    "overflow: hidden",
    "white-space: nowrap",
    `height: ${row.height * fraction}px`,
    `padding-top: ${row.paddingTop * fraction}px`,
    `padding-bottom: ${row.paddingBottom * fraction}px`,
  ].join("; ");
}

/** How far through a phase that runs from `start` to `end` of the whole, clamped to it. */
function phase(progress: number, start: number, end: number): number {
  return Math.min(Math.max((progress - start) / (end - start), 0), WHOLE);
}

export function wipeIn(node: HTMLElement, { duration = WIPE_MS } = {}): TransitionConfig {
  const row = measure(node);

  return {
    duration,
    css: (progress) => {
      const open = cubicOut(phase(progress, 0, OPEN_SHARE));
      const drawn = cubicInOut(phase(progress, OPEN_SHARE, WHOLE));

      return `${sized(row, open)}; clip-path: inset(0 ${(WHOLE - drawn) * PERCENT}% 0 0);`;
    },
  };
}

export function wipeOut(node: HTMLElement, { duration = WIPE_MS } = {}): TransitionConfig {
  const row = measure(node);
  const wipeEnd = WHOLE - CLOSE_SHARE;

  return {
    duration,
    // Svelte runs an outro from one down to nothing; the second argument counts the other way.
    css: (_, elapsed) => {
      const struck = cubicInOut(phase(elapsed, 0, wipeEnd));
      const closed = cubicIn(phase(elapsed, wipeEnd, WHOLE));

      return `${sized(row, WHOLE - closed)}; clip-path: inset(0 0 0 ${struck * PERCENT}%);`;
    },
  };
}

/**
 * Written in left to right, and on the way out erased right to left, back towards where it came
 * from: for something that comes out of a control and goes back into it. Svelte plays an outro as
 * the intro run backwards, so the one wipe serves both ways.
 */
export function wipeFromStart(_node: HTMLElement, { duration = WIPE_MS, delay = 0 } = {}): TransitionConfig {
  return {
    duration,
    delay,
    css: (progress) => `clip-path: inset(0 ${(WHOLE - cubicInOut(progress)) * PERCENT}% 0 0);`,
  };
}
