import type { HistoryState, NetworkMap, NetworkStop } from "./types";

/*
 * The network map is laid out the way a metro map is: one row per stop, down the page, and a
 * rail for each stop's own line. The line runs down the leftmost rail. A hub's branches leave it
 * on the rails beside it, side by side, the first branch the furthest out, and each turns off
 * right into the column of stops at its own row.
 *
 * Because the outer branches turn off first, every rail to a branch's right has ended by the
 * time it reaches its stop, so a branch that branches again takes the rails beside it afresh.
 * The map is as wide as its busiest hub, and no turn ever crosses a rail still in use.
 */

/** A stop at the end of a branch, its rail turning off right to it. */
export const TERMINUS = "terminus";
/** A stop on the line that carries on past it. */
export const STOP = "stop";
/** A stop whose branches leave it, drawn across all their rails. */
export const INTERCHANGE = "interchange";
/** Something the line runs through, drawn across it. */
export const TAP = "tap";
/** The last stop on the line. */
export const END = "end";

export type StopKind = typeof TERMINUS | typeof STOP | typeof INTERCHANGE | typeof TAP | typeof END;

export interface MapRow {
  stop: NetworkStop;
  kind: StopKind;
  rail: number;
  /** How many rails, from its own rightwards, an interchange is drawn across. */
  span: number;
}

/** A stop's own length of rail, from where it leaves to the stop, in the stop's colour. */
export interface MapSegment {
  rail: number;
  from: number;
  to: number;
  stop: NetworkStop;
  /** Whether it turns off right at its end, to a stop in the terminus column. */
  turns: boolean;
}

export interface MapLayout {
  rows: MapRow[];
  segments: MapSegment[];
  rails: number;
}

const LINE_RAIL = 0;

export function layoutMap(map: NetworkMap): MapLayout {
  const rows: MapRow[] = [];
  const segments: MapSegment[] = [];

  function placeBranches(parent: NetworkStop, parentRail: number, parentRow: number): void {
    // A tap among the branches is drawn across the hub's rails where it falls, and takes none.
    const count = parent.branches.filter((branch) => !branch.tap).length;
    let index = 0;

    parent.branches.forEach((branch) => {
      if (branch.tap) {
        rows.push({ stop: branch, kind: TAP, rail: parentRail, span: 1 });
        return;
      }

      const rail = parentRail + count - index++;
      const row = rows.length;
      const interchange = branch.branches.length > 0;

      segments.push({ rail, from: parentRow, to: row, stop: branch, turns: !interchange });
      rows.push({
        stop: branch,
        kind: interchange ? INTERCHANGE : TERMINUS,
        rail,
        span: 1 + branch.branches.filter((each) => !each.tap).length,
      });

      if (interchange) {
        placeBranches(branch, rail, row);
      }
    });
  }

  map.upstream.forEach((stop, index) => {
    rows.push({ stop, kind: TERMINUS, rail: index, span: 1 });
  });

  const head = rows.length;
  map.upstream.forEach((stop, index) => {
    segments.push({ rail: index, from: head, to: index, stop, turns: true });
  });

  let previous: number | null = null;
  const last = map.line.length - 1;

  map.line.forEach((stop, index) => {
    const row = rows.length;
    const isHead = row === head && map.upstream.length > 0;
    const branched = stop.branches.length > 0;
    let kind: StopKind = STOP;

    if (stop.tap) {
      kind = TAP;
    } else if (branched || isHead) {
      kind = INTERCHANGE;
    } else if (index === last && index > 0) {
      kind = END;
    }

    const span = Math.max(isHead ? map.upstream.length : 1, 1 + stop.branches.filter((each) => !each.tap).length);
    rows.push({ stop, kind, rail: LINE_RAIL, span });

    // A tap is passed through, so the rail runs on to the next real stop and takes its colour.
    if (!stop.tap) {
      if (previous !== null) {
        segments.push({ rail: LINE_RAIL, from: previous, to: row, stop, turns: false });
      }

      previous = row;
    }

    if (branched) {
      placeBranches(stop, LINE_RAIL, row);
    }
  });

  const rails = Math.max(1, ...rows.map((each) => each.rail + each.span));

  return { rows, segments, rails };
}

/**
 * Whether a stop is up: true or false by its entity's state, or null where it names none or
 * Home Assistant has not said.
 */
export function stopIsUp(state: string | null, upStates: string[], named: boolean): boolean | null {
  if (!named || state === null) {
    return null;
  }

  return upStates.includes(state);
}

const MILLISECONDS_PER_HOUR = 3_600_000;
const MILLISECONDS_PER_SECOND = 1000;
const HALF_SLICE = 0.5;

/**
 * How much of each slice of the last `hours` an entity spent up, oldest first, from its history.
 *
 * A slice is the fraction of its length spent in an up state, counting only the time Home
 * Assistant knew the state; a slice it knew nothing of is null.
 */
export function uptimeSlices(
  history: HistoryState[],
  upStates: string[],
  now: Date,
  hours: number,
  count: number,
): (number | null)[] {
  const end = now.getTime();
  const start = end - hours * MILLISECONDS_PER_HOUR;
  const length = (end - start) / count;
  const up = new Array<number>(count).fill(0);
  const known = new Array<number>(count).fill(0);

  const spans = history
    .filter((entry) => entry.last_changed !== null)
    .map((entry) => ({ state: entry.state, at: Math.max(new Date(entry.last_changed as string).getTime(), start) }))
    .sort((a, b) => a.at - b.at);

  spans.forEach((span, index) => {
    const until = index + 1 < spans.length ? spans[index + 1].at : end;
    if (span.state === null || until <= span.at) {
      return;
    }

    const isUp = upStates.includes(span.state);

    for (let slice = Math.floor((span.at - start) / length); slice < count; slice++) {
      const sliceStart = start + slice * length;
      const sliceEnd = sliceStart + length;
      if (sliceStart >= until) {
        break;
      }

      const overlap = Math.min(until, sliceEnd) - Math.max(span.at, sliceStart);
      if (overlap <= 0) {
        continue;
      }

      known[slice] += overlap;
      if (isUp) {
        up[slice] += overlap;
      }
    }
  });

  return known.map((time, slice) => (time > 0 ? up[slice] / time : null));
}

/** The share of the known time spent up, across every slice, or null when none is known. */
export function uptimeShare(history: HistoryState[], upStates: string[], now: Date, hours: number): number | null {
  const [whole] = uptimeSlices(history, upStates, now, hours, 1);

  return whole;
}

const LATENCY_FINE_BELOW_MS = 10;

/** Milliseconds as they read best: a tenth of one while small, whole ones after. */
export function formatLatency(milliseconds: number): string {
  return milliseconds < LATENCY_FINE_BELOW_MS ? milliseconds.toFixed(1) : Math.round(milliseconds).toString();
}

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/** A duration in seconds as `h:mm`, or `m min` under the hour. */
export function formatRuntime(seconds: number): string {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;

  return hours > 0 ? `${hours}:${rest.toString().padStart(2, "0")}` : `${minutes} min`;
}

/** One leg of a route: a segment of the map, run from its hub to its stop or back. */
export interface RouteStep {
  segment: number;
  reverse: boolean;
}

/**
 * The way across the map from one row to another, as the segments it runs: up from the first
 * to the hub the two share, then down to the second. Every stop's segment runs from its hub, so
 * the segments are the map's tree and there is exactly one way. Null where either row has no
 * place on it, as a tap has not.
 */
export function routeBetween(layout: MapLayout, from: number, to: number): RouteStep[] | null {
  const into = new Map<number, number>();
  layout.segments.forEach((segment, index) => into.set(segment.to, index));

  const reachable = (row: number) => into.has(row) || !layout.segments.every((segment) => segment.from !== row);
  if (from === to || !reachable(from) || !reachable(to)) {
    return null;
  }

  // Each row's way to the root, as the segments climbed, nearest first.
  function climb(row: number): { rows: number[]; segments: number[] } {
    const rows = [row];
    const segments: number[] = [];
    let current = row;

    while (into.has(current)) {
      const index = into.get(current) as number;
      segments.push(index);
      current = layout.segments[index].from;
      rows.push(current);
    }

    return { rows, segments };
  }

  const up = climb(from);
  const down = climb(to);
  const shared = down.rows.find((row) => up.rows.includes(row));
  if (shared === undefined) {
    return null;
  }

  const rising = up.segments.slice(0, up.rows.indexOf(shared));
  const falling = down.segments.slice(0, down.rows.indexOf(shared)).reverse();

  return [
    ...rising.map((segment) => ({ segment, reverse: true })),
    ...falling.map((segment) => ({ segment, reverse: false })),
  ];
}

/**
 * How much of each slice of the last `hours` an entity that changes every `beatSeconds` spent
 * beating, oldest first, from its history: a slice's share is the beats it got over the beats it
 * should have, so a gap in the history is time the entity, and whatever keeps it beating, was
 * down. The slices end at `now`, so every one has wholly passed.
 */
export function heartbeatSlices(
  history: HistoryState[],
  now: Date,
  hours: number,
  count: number,
  beatSeconds: number,
): number[] {
  const end = now.getTime();
  const start = end - hours * MILLISECONDS_PER_HOUR;
  const length = (end - start) / count;
  const beatMs = beatSeconds * MILLISECONDS_PER_SECOND;
  const beats = new Array<number>(count).fill(0);

  history.forEach((entry) => {
    const at = entry.last_changed ? new Date(entry.last_changed).getTime() : Number.NaN;
    if (entry.state !== null && at >= start && at <= end) {
      beats[Math.min(count - 1, Math.floor((at - start) / length))] += 1;
    }
  });

  return beats.map((got) => Math.min(1, got / Math.max(1, Math.floor(length / beatMs))));
}

/** A reading as a card shows it: grouped thousands, to its places, and its unit; null when not a number. */
export function formatStat(reading: string | null, decimals: number, unit: string | null): string | null {
  const value = Number(reading);
  if (reading === null || reading === "" || !Number.isFinite(value)) {
    return null;
  }

  const shown = value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  return unit ? `${shown}${unit}` : shown;
}

export const CAUTION = "caution";
export const WARNING = "warning";
export type Tier = typeof CAUTION | typeof WARNING;

/** Which tier a reading is in: a warning at or past `warningAt`, a caution at or past `cautionAt`, else none. */
export function tierOf(value: number | null, cautionAt: number | null, warningAt: number | null): Tier | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  if (warningAt !== null && value >= warningAt) {
    return WARNING;
  }

  return cautionAt !== null && value >= cautionAt ? CAUTION : null;
}

/**
 * A day's readings averaged into `count` equal stretches ending at `now`, as points to draw: the
 * middle of each stretch and its mean. A stretch with no readings carries on the last reading
 * before it, since a sensor that reports on change goes quiet while nothing changes; one before
 * any reading at all is left out.
 */
export function averaged(
  readings: { at: number; value: number }[],
  now: number,
  hours: number,
  count: number,
): { at: number; value: number }[] {
  const start = now - hours * MILLISECONDS_PER_HOUR;
  const length = (now - start) / count;
  const sorted = [...readings].sort((a, b) => a.at - b.at);
  const points: { at: number; value: number }[] = [];
  let carried: number | null = null;
  let next = 0;

  for (let slice = 0; slice < count; slice++) {
    const end = start + (slice + 1) * length;
    const inside: number[] = [];

    while (next < sorted.length && sorted[next].at < end) {
      if (sorted[next].at < start + slice * length) {
        carried = sorted[next].value;
      } else {
        inside.push(sorted[next].value);
      }
      next++;
    }

    const mean = inside.length > 0 ? inside.reduce((total, value) => total + value, 0) / inside.length : carried;
    if (mean !== null) {
      points.push({ at: start + (slice + HALF_SLICE) * length, value: mean });
      carried = inside.length > 0 ? inside[inside.length - 1] : carried;
    }
  }

  return points;
}

const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR_SPAN = 60;
const HOURS_PER_DAY = 24;
const UNDER_A_MINUTE = "<1m";

const BOTH_UNITS = 2;

/** How long something has lasted, in its largest unit or its two largest: `12d 4h` or `12d`, `5h 12m` or `5h`. */
export function formatSpan(milliseconds: number, units = BOTH_UNITS): string {
  const minutes = Math.floor(Math.max(0, milliseconds) / MILLISECONDS_PER_MINUTE);
  const hours = Math.floor(minutes / MINUTES_PER_HOUR_SPAN);
  const days = Math.floor(hours / HOURS_PER_DAY);
  const both = units >= BOTH_UNITS;

  if (days > 0) {
    return both ? `${days}d ${hours % HOURS_PER_DAY}h` : `${days}d`;
  }

  if (hours > 0) {
    return both ? `${hours}h ${minutes % MINUTES_PER_HOUR_SPAN}m` : `${hours}h`;
  }

  return minutes > 0 ? `${minutes}m` : UNDER_A_MINUTE;
}

// A date and time with no zone, as `2026-10-14 11:12:34`, which some hosts report their boot in.
const ZONELESS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;

/**
 * When a host booted, from however it says so; null when it is not a time. A time with no zone is
 * read as the panel's own local time, as the hosts that write it that way do.
 */
export function bootedAt(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(ZONELESS.test(value) ? value.replace(" ", "T") : value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** How loaded a reading is, as a meter colours it: resting below `busyAt`, busy to `fullAt`, full past it. */
export const RESTING = "resting";
export const BUSY = "busy";
export const FULL = "full";
export type Load = typeof RESTING | typeof BUSY | typeof FULL;

export function loadOf(share: number, busyAt: number, fullAt: number): Load {
  if (share >= fullAt) {
    return FULL;
  }

  return share >= busyAt ? BUSY : RESTING;
}
