/** How long a card stays on a pane it was swiped to before it goes back by itself. */
export const PANE_RESET_MS = 60 * 1000;

/**
 * A choice that lapses.
 *
 * A card with more than one pane — the floorplan's storeys, the forecast's hours and week — shows
 * its first unless somebody has chosen otherwise, and a choice nobody has renewed in a while
 * lapses back to it. Wandering off to another pane should not leave the wall showing it forever.
 * Every new choice starts the wait again.
 */
export class Lapsing<T> {
  #chosen = $state<T | null>(null);
  #timer: ReturnType<typeof setTimeout> | null = null;
  readonly #lapseMs: number;

  constructor(lapseMs: number) {
    this.#lapseMs = lapseMs;
  }

  /** What was chosen, or null once it has lapsed or when nothing ever was. */
  get chosen(): T | null {
    return this.#chosen;
  }

  choose(value: T): void {
    this.#clear();
    this.#chosen = value;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#chosen = null;
    }, this.#lapseMs);
  }

  release(): void {
    this.#clear();
    this.#chosen = null;
  }

  #clear(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }
}
