import { streamUrl } from "./api";
import type { EntityState } from "./types";

const INIT_MESSAGE = "init";
const UPDATE_MESSAGE = "update";

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_BACKOFF = 2;

/**
 * The panel's view of Home Assistant.
 *
 * The proxy sends one snapshot on connect and deltas thereafter; everything the cards render
 * reads through here, so a reconnect repaints the whole dashboard without any card knowing.
 */
class HomeAssistantState {
  entities = $state<Record<string, EntityState | null>>({});
  connected = $state(false);

  #socket: WebSocket | null = null;
  #reconnectDelay = RECONNECT_MIN_MS;
  #reconnectTimer: number | null = null;

  connect(): void {
    this.#socket = new WebSocket(streamUrl());

    this.#socket.addEventListener("message", (event) => {
      try {
        this.#receive(JSON.parse(event.data));
      } catch {
        // A malformed frame costs that update, not the connection.
      }
    });
    this.#socket.addEventListener("open", () => {
      this.#reconnectDelay = RECONNECT_MIN_MS;
    });
    this.#socket.addEventListener("close", () => {
      this.connected = false;
      this.#scheduleReconnect();
    });
  }

  /** The entity's state, or null when it is missing, unknown, or unavailable. */
  state(entityId: string | null | undefined): string | null {
    if (!entityId) {
      return null;
    }

    const entity = this.entities[entityId];
    if (!entity || entity.state === null) {
      return null;
    }

    return UNUSABLE_STATES.has(entity.state) ? null : entity.state;
  }

  attribute<T = unknown>(entityId: string | null | undefined, name: string): T | null {
    if (!entityId) {
      return null;
    }

    const entity = this.entities[entityId];

    return (entity?.attributes?.[name] as T) ?? null;
  }

  /** Reads a value that may live in the state or in one of the entity's attributes. */
  reading(source: { entity_id: string; attribute: string | null } | null | undefined): string | null {
    if (!source) {
      return null;
    }

    if (source.attribute) {
      const value = this.attribute(source.entity_id, source.attribute);

      return value === null ? null : String(value);
    }

    return this.state(source.entity_id);
  }

  number(entityId: string | null | undefined, fallback = 0): number {
    const parsed = Number(this.state(entityId));

    return Number.isFinite(parsed) ? parsed : fallback;
  }

  isOn(entityId: string | null | undefined): boolean {
    return this.state(entityId) === STATE_ON;
  }

  #receive(message: { type: string; connected?: boolean; states: Record<string, EntityState | null> }): void {
    if (message.type === INIT_MESSAGE) {
      this.entities = message.states;
      this.connected = message.connected ?? false;
    } else if (message.type === UPDATE_MESSAGE) {
      this.entities = { ...this.entities, ...message.states };
      this.connected = true;
    }
  }

  #scheduleReconnect(): void {
    if (this.#reconnectTimer !== null) {
      return;
    }

    this.#reconnectTimer = window.setTimeout(() => {
      this.#reconnectTimer = null;
      this.#reconnectDelay = Math.min(this.#reconnectDelay * RECONNECT_BACKOFF, RECONNECT_MAX_MS);
      this.connect();
    }, this.#reconnectDelay);
  }
}

export const STATE_ON = "on";
export const STATE_OFF = "off";
export const STATE_UNKNOWN = "unknown";
export const STATE_UNAVAILABLE = "unavailable";

/** States that mean "no reading", as distinct from a real value. */
const UNUSABLE_STATES = new Set([STATE_UNKNOWN, STATE_UNAVAILABLE, ""]);

export const ha = new HomeAssistantState();
