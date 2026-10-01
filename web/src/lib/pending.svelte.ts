import { setValue, toggle } from "./api";
import type { HueSaturation, XyPoint } from "./hue";
import { ha } from "./state.svelte";
import type { EntityState } from "./types";

/** Long enough for the slowest round trip through Home Assistant; past it, no answer is coming. */
export const PENDING_TIMEOUT_MS = 10000;

type ToggleRequest = (entityId: string) => Promise<void>;
type Value = number | string | HueSaturation | XyPoint;
type SetRequest = (entityId: string, value: Value) => Promise<void>;

/**
 * Requests asked for and not yet answered: a toggle, or a value set on a slider or a time.
 *
 * Home Assistant is what records a change, so nothing on the panel changes until the state
 * stream says it has, and on a slow round trip a control that shows nothing in the meantime
 * gets tapped again, which switches it straight back. A request is pending from the tap until
 * the stream next sends the entity, so a control can say it was heard, and a second tap while
 * it waits is not a second toggle.
 *
 * The entity is compared by the record the stream last sent for it rather than by its state,
 * so any word of it counts as the answer, including one that leaves the state where it was.
 *
 * A value streamed while a finger is still moving is the exception. Several are in flight at once
 * there, and the answer to an earlier one can land after a later one was asked for, so a streamed
 * value is only answered once the entity matches it, or at the timeout.
 */
export class PendingRequests {
  #asked = $state<
    Record<
      string,
      { before: EntityState | null | undefined; value: Value | null; answered: (() => boolean) | null; serial: number }
    >
  >({});
  #serial = 0;
  #timers = new Map<string, ReturnType<typeof setTimeout>>();
  #toggle: ToggleRequest;
  #set: SetRequest;

  constructor(toggleRequest: ToggleRequest = toggle, setRequest: SetRequest = setValue) {
    this.#toggle = toggleRequest;
    this.#set = setRequest;
  }

  isPending(entityId: string): boolean {
    const asked = this.#asked[entityId];
    if (asked === undefined) {
      return false;
    }

    return asked.answered ? !asked.answered() : ha.entities[entityId] === asked.before;
  }

  /** The value a set is waiting on, or null when nothing is being set. */
  requested(entityId: string): Value | null {
    return this.isPending(entityId) ? (this.#asked[entityId]?.value ?? null) : null;
  }

  /** Asks for the toggle, unless one is already waiting on the same entity. Says whether it asked. */
  send(entityId: string): boolean {
    if (this.isPending(entityId)) {
      return false;
    }

    this.#ask(entityId, null, null, () => this.#toggle(entityId));

    return true;
  }

  /**
   * Asks for a value. A later value replaces one still waiting, since a drag that lands twice
   * means the second place; a toggle waiting on the entity is left to finish first.
   */
  set(entityId: string, value: Value): boolean {
    if (this.isPending(entityId) && this.#asked[entityId]?.value === null) {
      return false;
    }

    this.#ask(entityId, value, null, () => this.#set(entityId, value));

    return true;
  }

  /**
   * Asks for a value while a finger is still moving, answered only once `answered` says the entity
   * has reached it. Gives back the request, so the caller can wait on it before sending the next, or
   * null when a toggle is waiting on the entity and nothing was sent.
   */
  stream(entityId: string, value: Value, answered: () => boolean): Promise<void> | null {
    if (this.isPending(entityId) && this.#asked[entityId]?.value === null) {
      return null;
    }

    return this.#ask(entityId, value, answered, () => this.#set(entityId, value));
  }

  #ask(
    entityId: string,
    value: Value | null,
    answered: (() => boolean) | null,
    request: () => Promise<void>,
  ): Promise<void> {
    this.#forget(entityId);
    const serial = ++this.#serial;
    this.#asked = { ...this.#asked, [entityId]: { before: ha.entities[entityId], value, answered, serial } };
    this.#timers.set(
      entityId,
      setTimeout(() => this.#forget(entityId), PENDING_TIMEOUT_MS),
    );

    // Refused outright, it is not coming either. Only this request's own refusal forgets the entity,
    // not one a later request has already replaced.
    return request().catch(() => {
      if (this.#asked[entityId]?.serial === serial) {
        this.#forget(entityId);
      }
    });
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

export const pending = new PendingRequests();
