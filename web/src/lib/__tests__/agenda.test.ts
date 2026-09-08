import { describe, expect, it } from "vitest";

import { focusOf } from "../agenda.svelte";
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
