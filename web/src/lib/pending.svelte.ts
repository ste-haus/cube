import { toggle } from "./api";
import { ha } from "./state.svelte";
import type { EntityState } from "./types";

/** Long enough for the slowest round trip through Home Assistant; past it, no answer is coming. */
export const PENDING_TIMEOUT_MS = 10000;

type Request = (entityId: string) => Promise<void>;

/**
 * Toggles asked for and not yet answered.
 *
 * Home Assistant is what records a toggle, so nothing on the panel changes until the state
 * stream says it has, and on a slow round trip a control that shows nothing in the meantime
 * gets tapped again, which switches it straight back. A toggle is pending from the tap until
 * the stream next sends the entity, so a control can say it was heard, and a second tap while
 * it waits is not a second toggle.
 *
 * The entity is compared by the record the stream last sent for it rather than by its state,
 * so any word of it counts as the answer, including one that leaves the state where it was.
 */
export class PendingToggles {
  #asked = $state<Record<string, { before: EntityState | null | undefined }>>({});
  #timers = new Map<string, ReturnType<typeof setTimeout>>();
  #request: Request;

  constructor(request: Request = toggle) {
    this.#request = request;
  }

  isPending(entityId: string): boolean {
    const asked = this.#asked[entityId];

    return asked !== undefined && ha.entities[entityId] === asked.before;
  }

  /** Asks for the toggle, unless one is already waiting on the same entity. Says whether it asked. */
  send(entityId: string): boolean {
    if (this.isPending(entityId)) {
      return false;
    }

    this.#forget(entityId);
    this.#asked = { ...this.#asked, [entityId]: { before: ha.entities[entityId] } };
    this.#timers.set(
      entityId,
      setTimeout(() => this.#forget(entityId), PENDING_TIMEOUT_MS),
    );

    // Refused outright, it is not coming either.
    this.#request(entityId).catch(() => this.#forget(entityId));

    return true;
  }

  #forget(entityId: string): void {
    const timer = this.#timers.get(entityId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.#timers.delete(entityId);
    }

    if (entityId in this.#asked) {
      const { [entityId]: _, ...rest } = this.#asked;
      this.#asked = rest;
    }
  }
}

export const pending = new PendingToggles();
