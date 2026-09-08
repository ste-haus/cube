import { fetchAgenda } from "./api";
import type { AgendaEvent } from "./types";

const REFRESH_MS = 5 * 60 * 1000;
const TICK_MS = 30 * 1000;

/**
 * Today's events, fetched once for the page.
 *
 * Both the timeline and the notices list read from here: household calendars leave the
 * timeline and surface as notices, and neither card should be fetching on its own.
 */
class Agenda {
  events = $state<AgendaEvent[]>([]);
  now = $state(new Date());

  #timer: number | null = null;
  #tick: number | null = null;
  #started = false;

  /** Whether an event has finished, and so should read as spent rather than upcoming. */
  isPast(event: AgendaEvent): boolean {
    if (!event.end) {
      return false;
    }

    return new Date(event.end).getTime() < this.now.getTime();
  }

  start(): void {
    if (this.#started) {
      return;
    }
    this.#started = true;

    this.#load();
    this.#timer = window.setInterval(() => this.#load(), REFRESH_MS);
    this.#tick = window.setInterval(() => {
      this.now = new Date();
    }, TICK_MS);
  }

  stop(): void {
    for (const timer of [this.#timer, this.#tick]) {
      if (timer !== null) {
        window.clearInterval(timer);
      }
    }
    this.#timer = null;
    this.#tick = null;
    this.#started = false;
  }

  #load(): void {
    fetchAgenda().then((loaded) => {
      this.events = loaded;
    });
  }
}

export const agenda = new Agenda();
