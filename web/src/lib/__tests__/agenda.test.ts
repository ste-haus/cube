import { describe, expect, it } from "vitest";

import { focusOf, isPast, spineBreaks } from "../agenda.svelte";
import type { AgendaEvent } from "../types";

function event(summary: string, start: string | null, end: string | null): AgendaEvent {
  return {
    summary,
    location: null,
    start,
    end,
    all_day: false,
    calendar: "Work",
    color: "#bd00bd",
  };
}

const morning = event("morning", "2026-09-08T09:00:00-07:00", "2026-09-08T10:00:00-07:00");
const midday = event("midday", "2026-09-08T12:00:00-07:00", "2026-09-08T13:00:00-07:00");
const evening = event("evening", "2026-09-08T18:00:00-07:00", "2026-09-08T19:00:00-07:00");
const day = [morning, midday, evening];

const at = (time: string) => new Date(`2026-09-08T${time}-07:00`);

describe("focusOf", () => {
  it("picks the event under way", () => {
    expect(focusOf(day, at("12:30:00"))).toEqual(new Set([midday]));
  });

  it("picks the next one due when nothing is running", () => {
    expect(focusOf(day, at("11:00:00"))).toEqual(new Set([midday]));
  });

  it("picks the first of the day before any have started", () => {
    expect(focusOf(day, at("07:00:00"))).toEqual(new Set([morning]));
  });

  it("picks nothing once the day is over", () => {
    expect(focusOf(day, at("23:00:00"))).toEqual(new Set());
  });

  it("prefers what is running over what is next", () => {
    expect(focusOf(day, at("09:30:00"))).toEqual(new Set([morning]));
  });

  it("takes every event under way when several overlap", () => {
    const overlapping = event("overlapping", "2026-09-08T12:30:00-07:00", "2026-09-08T13:30:00-07:00");

    expect(focusOf([midday, overlapping], at("12:45:00"))).toEqual(new Set([midday, overlapping]));
  });

  it("treats an event as over the moment it ends", () => {
    expect(focusOf([midday, evening], at("13:00:00"))).toEqual(new Set([evening]));
  });

  it("ignores an event with no times of its own", () => {
    expect(focusOf([event("undated", null, null), midday], at("11:00:00"))).toEqual(new Set([midday]));
  });
});

describe("isPast", () => {
  it("calls an event past once it has ended", () => {
    expect(isPast(midday, at("13:00:01"))).toBe(true);
  });

  it("leaves an event under way alone", () => {
    expect(isPast(midday, at("12:30:00"))).toBe(false);
  });

  it("leaves one still ahead alone", () => {
    expect(isPast(evening, at("12:30:00"))).toBe(false);
  });

  it("never retires an event with no end of its own", () => {
    expect(isPast(event("undated", null, null), at("23:59:00"))).toBe(false);
  });

  /*
   * A bare date is midnight where the panel is, so these are local-to-local. Written with the
   * `at` helper instead they would carry its fixed offset against a local midnight, and pass
   * only in the zone that offset happens to name.
   */
  it("reads a bare date as local midnight, so an all-day event runs to the end of its day", () => {
    const allDay = event("all day", "2026-09-08", "2026-09-09");
    const duringTheDay = new Date(2026, 8, 8, 18, 0, 0);

    expect(isPast(allDay, duringTheDay)).toBe(false);
  });

  it("retires an all-day event once its own midnight has passed", () => {
    const allDay = event("all day", "2026-09-08", "2026-09-09");
    const theNextMorning = new Date(2026, 8, 9, 0, 0, 1);

    expect(isPast(allDay, theNextMorning)).toBe(true);
  });
});

describe("spineBreaks", () => {
  const hours = (n: number) => n * 60 * 60 * 1000;

  it("marks a gap longer than the threshold", () => {
    expect(spineBreaks([0, hours(4)])).toEqual(new Set([1]));
  });

  it("leaves a short gap alone", () => {
    expect(spineBreaks([0, hours(2)])).toEqual(new Set());
  });

  it("leaves a gap exactly at the threshold alone", () => {
    expect(spineBreaks([0, hours(3)])).toEqual(new Set());
  });

  it("keeps only the two largest", () => {
    // Gaps of 4h, 6h, 5h and 4h; the 6h and 5h win.
    const starts = [0, hours(4), hours(10), hours(15), hours(19)];

    expect(spineBreaks(starts)).toEqual(new Set([2, 3]));
  });

  it("never marks the first row, so the timeline does not open with a break", () => {
    expect(spineBreaks([hours(9), hours(10)]).has(0)).toBe(false);
  });

  it("ignores rows with no time of their own", () => {
    // An all-day row leads, and bounds no measurable gap.
    expect(spineBreaks([null, hours(9), hours(14)])).toEqual(new Set([2]));
  });

  it("marks nothing on a day with one row", () => {
    expect(spineBreaks([hours(9)])).toEqual(new Set());
  });
});
