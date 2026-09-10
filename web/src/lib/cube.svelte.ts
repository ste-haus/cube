/**
 * Cube rotation.
 *
 * Two faces animate at once — the outgoing one pivots away, the incoming one pivots in —
 * rather than a persistent six-sided box being spun. That is deliberate: a real box needs a
 * depth of half its width to rotate about Y and half its height to rotate about X, and those
 * cannot both hold on a non-square panel. Animating the pair keeps the illusion exact at any
 * aspect ratio.
 */

import { getContext, setContext } from "svelte";

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
const TOUCH_ACTION_NONE = "none";

interface Transition {
  from: FaceName;
  to: FaceName;
  direction: Direction;
}

export class Cube {
  current = $state<FaceName>(DEFAULT_FACE);
  transition = $state<Transition | null>(null);

  /**
   * The faces that have been looked at, and so are built.
   *
   * A face is built the first time it is turned to and kept from then on, so a camera keeps
   * the frame it last had and a floorplan is not fetched twice. What it costs to keep is the
   * markup: a face that is not being looked at is not painted, and the cards on it hold no
   * timers, so it is inert rather than merely hidden. A face never turned to is never built.
   */
  built = $state<FaceName[]>([DEFAULT_FACE]);

  #resetTimer: number | null = null;
  #rotating = false;

  /** Whether a face is in the DOM at all. */
  isBuilt(face: FaceName): boolean {
    return this.built.includes(face);
  }

  /** Whether a face is painted: the current one, plus both sides of a rotation. */
  isVisible(face: FaceName): boolean {
    if (this.transition) {
      return face === this.transition.from || face === this.transition.to;
    }

    return face === this.current;
  }

  #build(face: FaceName): void {
    if (!this.built.includes(face)) {
      this.built = [...this.built, face];
    }
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
    this.#build(to);
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

    this.#build(face);
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

const FACE_VISIBILITY = Symbol("face-visibility");

/** Whether the face a card sits on is the one being looked at. */
export interface FaceVisibility {
  readonly showing: boolean;
}

const ALWAYS_SHOWING: FaceVisibility = { showing: true };

/** Published by the face itself, so a card need not be told which of the six it is on. */
export function provideVisibility(visibility: FaceVisibility): void {
  setContext(FACE_VISIBILITY, visibility);
}

/**
 * Whether the calling card is on the face being looked at.
 *
 * A card outside any face — the announcement overlay, or one mounted on its own in a test —
 * is always showing, so nothing has to know about the cube in order to be drawn.
 */
export function faceVisibility(): FaceVisibility {
  return getContext<FaceVisibility | undefined>(FACE_VISIBILITY) ?? ALWAYS_SHOWING;
}

/**
 * Turns pointer drags into rotations.
 *
 * Used as a Svelte action, so the element it decorates owns the gesture and releases the
 * listeners with itself.
 *
 * A touchscreen hands a drag to the browser's own panning before it hands it to us: the first
 * `pointermove` arrives, the browser decides the gesture is a scroll, and the sequence ends in
 * `pointercancel` with no `pointerup` at all. `touch-action: none` is what declines that
 * offer, and without it none of this runs on a panel driven by fingers.
 */
export interface SwipeOptions {
  onSwipe: (direction: Direction) => void;
  /** Which axes this element claims. Anything else is left to bubble. */
  axes?: "both" | "horizontal" | "vertical";
  /** Stop a claimed gesture from reaching an ancestor that also listens. */
  exclusive?: boolean;
  /** Bind arrow keys. Only the outermost handler should. */
  keyboard?: boolean;
}

export function swipeable(node: HTMLElement, options: SwipeOptions) {
  let current = options;
  let startX = 0;
  let startY = 0;
  let tracking = false;

  function claims(horizontal: boolean): boolean {
    const axes = current.axes ?? "both";

    return axes === "both" || (horizontal ? axes === "horizontal" : axes === "vertical");
  }

  function down(event: PointerEvent) {
    if (!event.isPrimary) {
      return;
    }

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

    if (Math.abs(distance) < SWIPE_THRESHOLD_PX || !claims(horizontal)) {
      return;
    }

    if (current.exclusive) {
      event.stopPropagation();
    }

    if (horizontal) {
      current.onSwipe(distance < 0 ? "left" : "right");
    } else {
      current.onSwipe(distance < 0 ? "up" : "down");
    }
  }

  function key(event: KeyboardEvent) {
    const direction = KEY_DIRECTIONS[event.key];
    if (direction) {
      current.onSwipe(direction);
    }
  }

  function cancel() {
    tracking = false;
  }

  const inheritedTouchAction = node.style.touchAction;
  node.style.touchAction = TOUCH_ACTION_NONE;

  // Settled once, so that a later `update` cannot leave the keydown listener behind.
  const bindsKeyboard = current.keyboard ?? false;

  node.addEventListener("pointerdown", down);
  node.addEventListener("pointerup", up);
  node.addEventListener("pointercancel", cancel);

  if (bindsKeyboard) {
    window.addEventListener("keydown", key);
  }

  return {
    update(next: SwipeOptions) {
      current = next;
    },
    destroy() {
      node.style.touchAction = inheritedTouchAction;
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cancel);

      if (bindsKeyboard) {
        window.removeEventListener("keydown", key);
      }
    },
  };
}

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};
