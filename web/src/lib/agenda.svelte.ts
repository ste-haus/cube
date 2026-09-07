import { fetchAgenda } from "./api";
import type { AgendaEvent } from "./types";

const REFRESH_MS = 5 * 60 * 1000;

/**
 * Today's events, fetched once for the page.
 *
 * Both the timeline and the notices list read from here: household calendars leave the
 * timeline and surface as notices, and neither card should be fetching on its own.
 */
class Agenda {
  events = $state<AgendaEvent[]>([]);

  #timer: number | null = null;
  #started = false;

  start(): void {
    if (this.#started) {
      return;
    }
    this.#started = true;

    this.#load();
    this.#timer = window.setInterval(() => this.#load(), REFRESH_MS);
  }

  stop(): void {
    if (this.#timer !== null) {
      window.clearInterval(this.#timer);
      this.#timer = null;
    }
    this.#started = false;
  }

  #load(): void {
    fetchAgenda().then((loaded) => {
      this.events = loaded;
    });
  }
}

export const agenda = new Agenda();
