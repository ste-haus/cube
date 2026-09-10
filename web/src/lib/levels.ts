import type { Direction } from "./cube.svelte";

/**
 * Which storey a swipe lands on.
 *
 * The levels are laid out side by side in the order the config declares them and slid between,
 * so their ends are ends: swiping past the last one stays on it rather than reappearing at the
 * first. Wrapping reads as a carousel, and a house is not one — there is nothing to the left of
 * the ground floor.
 *
 * It also cannot work. A wrap makes both directions land on the same storey whenever there are
 * exactly two of them, which is the common case and was how this gave itself away.
 */
export function nextLevel(levels: string[], current: string, direction: Direction): string {
  const index = levels.indexOf(current);
  const wanted = direction === "left" ? index + 1 : index - 1;

  return levels[Math.min(Math.max(wanted, 0), levels.length - 1)];
}
