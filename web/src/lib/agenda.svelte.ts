import { fetchAgenda } from "./api";
import type { AgendaEvent } from "./types";

const REFRESH_MS = 5 * 60 * 1000;
const TICK_MS = 30 * 1000;

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads a calendar moment as a local one.
 *
 * A bare date is midnight where the panel is, but `new Date("2026-09-08")` reads it as
 * midnight UTC — which puts an all-day event's end in this afternoon anywhere west of
 * Greenwich, and retires it while it is still running.
 */
function moment(value: string): number {
  if (BARE_DATE.test(value)) {
    const [year, month, day] = value.split("-").map(Number);

    return new Date(year, month - 1, day).getTime();
  }

  return new Date(value).getTime();
}

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

    return moment(event.end) < this.now.getTime();
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
    fetchAgenda()
      .then((loaded) => {
        this.events = loaded;
      })
      .catch(() => {
        // The day's events are worth less than the panel staying up; the next tick tries again.
      });
  }
}

export const agenda = new Agenda();
