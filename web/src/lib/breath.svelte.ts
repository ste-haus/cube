/**
 * How long a control keeps breathing once it has been let go, unless its answer is later still.
 */
export const SETTLE_MS = 1500;

/**
 * A control breathing while it is being set, and settling a little after it is let go.
 *
 * It starts when a drag does, keeps going while the finger is down, and for `SETTLE_MS` after the
 * finger comes up. It only stops at the end of a breath, when the control is back at full
 * strength, so the caller reports each breath's end with `breathed`, saying whether the control is
 * still busy (waiting on Home Assistant, say); a busy control keeps breathing past its settling
 * time.
 */
export class Breath {
  breathing = $state(false);

  #held = false;
  #settling = false;
  #timer: ReturnType<typeof setTimeout> | null = null;

  /** The finger is down and setting: breathe, and forget any settling still under way. */
  start(): void {
    this.#clear();
    this.#held = true;
    this.#settling = false;
    this.breathing = true;
  }

  /** The finger has come up: settle once `SETTLE_MS` has gone by. */
  release(): void {
    if (!this.#held) {
      return;
    }

    this.#held = false;
    this.#settling = true;
    this.#clear();
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#settling = false;
    }, SETTLE_MS);
  }

  /** A breath has ended, back at full strength: stop here if there is nothing left to wait for. */
  breathed(busy = false): void {
    if (!this.#held && !this.#settling && !busy) {
      this.breathing = false;
    }
  }

  dispose(): void {
    this.#clear();
  }

  #clear(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }
}
