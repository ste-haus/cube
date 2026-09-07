/**
 * Cube rotation.
 *
 * Two faces animate at once — the outgoing one pivots away, the incoming one pivots in —
 * rather than a persistent six-sided box being spun. That is deliberate: a real box needs a
 * depth of half its width to rotate about Y and half its height to rotate about X, and those
 * cannot both hold on a non-square panel. Animating the pair keeps the illusion exact at any
 * aspect ratio.
 */

export type FaceName = "front" | "back" | "left" | "right" | "up" | "down";
export type Direction = "up" | "down" | "left" | "right";

export const FACES: FaceName[] = ["front", "back", "left", "right", "up", "down"];
export const DEFAULT_FACE: FaceName = "front";

/**
 * Which face a swipe lands on.
 *
 * The cube rolls with the gesture, so swiping up brings up the face that was below.
 *
 * The graph tracks which face is showing but not how the cube is rolled, which is what the
 * original dashboard did. Each great circle — front/right/back/left and front/up/back/down —
 * is therefore a clean, reversible four-step loop, while stepping off one circle onto the
 * other lands on a real face without remembering the way round. Adding roll would need a full
 * orientation rather than a lookup, and buys nothing a panel can see.
 */
export const ADJACENCY: Record<FaceName, Record<Direction, FaceName>> = {
  front: { up: "down", down: "up", left: "right", right: "left" },
  back: { up: "up", down: "down", left: "left", right: "right" },
  up: { up: "front", down: "back", left: "right", right: "left" },
  down: { up: "back", down: "front", left: "right", right: "left" },
  left: { up: "down", down: "up", left: "front", right: "back" },
  right: { up: "down", down: "up", left: "back", right: "front" },
};

const ROTATION_MS = 600;
const IDLE_RESET_MS = 2 * 60 * 1000;
const SWIPE_THRESHOLD_PX = 50;

interface Transition {
  from: FaceName;
  to: FaceName;
  direction: Direction;
}

export class Cube {
  current = $state<FaceName>(DEFAULT_FACE);
  transition = $state<Transition | null>(null);

  #resetTimer: number | null = null;
  #rotating = false;

  /** Whether a face needs to be in the DOM: the current one, plus both sides of a rotation. */
  isVisible(face: FaceName): boolean {
    if (this.transition) {
      return face === this.transition.from || face === this.transition.to;
    }

    return face === this.current;
  }

  /** The animation class a face wears for the duration of a rotation. */
  animationClass(face: FaceName): string {
    if (!this.transition) {
      return "";
    }

    if (face === this.transition.from) {
      return `rotate-out-${this.transition.direction} on-top`;
    }

    if (face === this.transition.to) {
      return `rotate-in-${this.transition.direction}`;
    }

    return "";
  }

  rotate(direction: Direction): void {
    if (this.#rotating) {
      return;
    }

    const from = this.current;
    const to = ADJACENCY[from][direction];
    if (to === from) {
      return;
    }

    this.#rotating = true;
    this.transition = { from, to, direction };
    this.current = to;

    window.setTimeout(() => {
      this.transition = null;
      this.#rotating = false;
    }, ROTATION_MS);

    this.#scheduleReset();
  }

  /** Jumps straight to a face, with no rotation. Used by the face map. */
  show(face: FaceName): void {
    if (this.#rotating) {
      return;
    }

    this.current = face;
    this.#scheduleReset();
  }

  /** Returns the cube to its default face once a panel has been left alone. */
  #scheduleReset(): void {
    if (this.#resetTimer !== null) {
      window.clearTimeout(this.#resetTimer);
      this.#resetTimer = null;
    }

    if (this.current === DEFAULT_FACE) {
      return;
    }

    this.#resetTimer = window.setTimeout(() => this.show(DEFAULT_FACE), IDLE_RESET_MS);
  }
}

/**
 * Turns pointer drags into rotations.
 *
 * Used as a Svelte action, so the element it decorates owns the gesture and releases the
 * listeners with itself.
 */
export function swipeable(node: HTMLElement, onSwipe: (direction: Direction) => void) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  function down(event: PointerEvent) {
    startX = event.clientX;
    startY = event.clientY;
    tracking = true;
  }

  function up(event: PointerEvent) {
    if (!tracking) {
      return;
    }
    tracking = false;

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
    const distance = horizontal ? deltaX : deltaY;

    if (Math.abs(distance) < SWIPE_THRESHOLD_PX) {
      return;
    }

    if (horizontal) {
      onSwipe(distance < 0 ? "left" : "right");
    } else {
      onSwipe(distance < 0 ? "up" : "down");
    }
  }

  function key(event: KeyboardEvent) {
    const direction = KEY_DIRECTIONS[event.key];
    if (direction) {
      onSwipe(direction);
    }
  }

  node.addEventListener("pointerdown", down);
  node.addEventListener("pointerup", up);
  node.addEventListener("pointercancel", () => {
    tracking = false;
  });
  window.addEventListener("keydown", key);

  return {
    destroy() {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
    },
  };
}

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};
