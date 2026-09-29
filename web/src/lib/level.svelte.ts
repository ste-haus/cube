import { cubicOut } from "svelte/easing";
import { Tween } from "svelte/motion";

/** How long a level takes to slide to where Home Assistant says it is. */
export const LEVEL_SLIDE_MS = 450;

/**
 * A level as it is drawn: under the finger it is wherever the finger is, and otherwise it slides
 * to wherever it is told, so a light switched by a tap or a blind moved from somewhere else glides
 * to its new place rather than jumping there. The first level it is given it takes at once, so a
 * control coming onto the screen is simply where it is.
 */
export class SlidingLevel {
  #tween = new Tween(0, { duration: LEVEL_SLIDE_MS, easing: cubicOut });
  #placed = false;

  get current(): number {
    return this.#tween.current;
  }

  follow(level: number, underFinger = false): void {
    if (this.#placed && level === this.#tween.target) {
      return;
    }

    const instant = underFinger || !this.#placed;
    this.#placed = true;
    this.#tween.set(level, { duration: instant ? 0 : LEVEL_SLIDE_MS });
  }
}
