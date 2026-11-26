import { cubicInOut } from "svelte/easing";
import type { TransitionConfig } from "svelte/transition";

/*
 * A band over a card drops down out from under the card's heading and back up into it: the room
 * opens as it comes, so what is below moves aside rather than being drawn over. Its inner element
 * reads `--banner-drop` to slide with it.
 */

const SLIDE_MS = 420;
const WHOLE = 1;
const PERCENT = 100;
const PIXELS = "px";

export function drop(node: HTMLElement): TransitionConfig {
  const height = node.offsetHeight;

  return {
    duration: SLIDE_MS,
    easing: cubicInOut,
    css: (progress) => `height: ${height * progress}${PIXELS}; overflow: hidden; --banner-drop: ${(progress - WHOLE) * PERCENT}%;`,
  };
}
