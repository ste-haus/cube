import { strftime } from "./format";

/*
 * Traffic incidents, as Home Assistant lists them in a sensor's `incidents` attribute: HERE's
 * incident details flattened into one record each. Any field may be missing, and HERE often
 * leaves the road empty and names it only in the prose.
 */

export interface Incident {
  id: string | null;
  type: string | null;
  criticality: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  road: string | null;
  cross_street: string | null;
  end_cross_street: string | null;
  direction: string | null;
  road_closed: boolean;
  start_time: string | null;
  end_time: string | null;
}

/**
 * Minor incidents are drawn in the primary colour, major ones in the secondary, and critical ones
 * in red: the master warning's, until incidents want a red of their own.
 */
export type Severity = "minor" | "major" | "critical";

// The master warning's own default, for a config with no `mcw` block to take it from.
export const DEFAULT_CRITICAL_COLOUR = "#ff3030";

export function severityColour(severity: Severity, critical: string): string {
  const colours: Record<Severity, string> = {
    minor: "var(--color-primary)",
    major: "var(--color-secondary)",
    critical,
  };

  return colours[severity];
}

// HERE's criticalities, least to most. Anything it adds later, or leaves off, counts as minor.
const CRITICALITY_RANK: Record<string, number> = {
  lowImpact: 0,
  minor: 1,
  major: 2,
  critical: 3,
};
const UNRANKED = 0;
const SEVERITIES: Severity[] = ["minor", "major", "critical"];

// Type over a band reads dark above this relative luminance and light below it: where black and
// white text have the same contrast against the band (WCAG 2's definitions).
const DARK_TYPE_FROM_LUMINANCE = 0.179;
const HEX_COLOUR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HEX_RADIX = 16;
const CHANNEL_MAX = 255;
const LINEAR_BELOW = 0.03928;
const LINEAR_SLOPE = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_SCALE = 1.055;
const GAMMA = 2.4;
const LUMINANCE_WEIGHTS = [0.2126, 0.7152, 0.0722];

// How many roads the banner names before it counts the rest.
export const BANNER_ROADS = 3;
const ROAD_SEPARATOR = ", ";
const COUNT_PLACEHOLDER = "{count}";
const SINGLE = 1;

// HERE's types are camelCase, "disabledVehicle"; each word starts at a capital.
const WORD_START = /(?=[A-Z])/;
const WORD_SEPARATOR = " ";

const TODAY_FORMAT = "%H:%M";
const OTHER_DAY_FORMAT = "%b %-d %H:%M";
const WEEKDAY_FORMAT = "%A";
const DATE_FORMAT = "%b %-d";

// An incident that spans more than a day is ongoing: told by the day, not counted down.
const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAY_MS = HOURS_PER_DAY * MINUTES_PER_HOUR * MINUTE_MS;
const DAYS_PER_WEEK = 7;
const TODAY = 0;
const DURATION_SEPARATOR = " ";

const INCIDENT_ICONS: Record<string, string> = {
  accident: "mdi:car-emergency",
  congestion: "mdi:car-multiple",
  construction: "mdi:bulldozer",
  disabledVehicle: "mdi:car-wrench",
  laneRestriction: "mdi:traffic-cone",
  massTransit: "mdi:bus-alert",
  plannedEvent: "mdi:calendar-alert",
  roadClosure: "mdi:minus-circle",
  roadHazard: "mdi:hazard-lights",
  weather: "mdi:weather-lightning-rainy",
};
const DEFAULT_INCIDENT_ICON = "mdi:alert-outline";
export const CLOSED_ICON = "mdi:sign-direction-remove";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** The incidents in an attribute, leaving out anything that is not one. */
export function incidentsOf(value: unknown): Incident[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item) => ({
      id: text(item.id),
      type: text(item.type),
      criticality: text(item.criticality),
      summary: text(item.summary),
      description: text(item.description),
      location: text(item.location),
      road: text(item.road),
      cross_street: text(item.cross_street),
      end_cross_street: text(item.end_cross_street),
      direction: text(item.direction),
      road_closed: item.road_closed === true,
      start_time: text(item.start_time),
      end_time: text(item.end_time),
    }));
}

function rank(incident: Incident): number {
  return CRITICALITY_RANK[incident.criticality ?? ""] ?? UNRANKED;
}

export function severityOf(incident: Incident): Severity {
  if (rank(incident) >= CRITICALITY_RANK.critical) {
    return "critical";
  }

  return rank(incident) >= CRITICALITY_RANK.major ? "major" : "minor";
}

/** The worst of them, which is what the banner and its window are coloured by. */
export function worstSeverity(incidents: Incident[]): Severity {
  const worst = Math.max(
    UNRANKED,
    ...incidents.map((incident) => SEVERITIES.indexOf(severityOf(incident))),
  );

  return SEVERITIES[worst];
}

/**
 * Whether type over a band of `colour` reads better light than dark. Only a `#rrggbb` colour can
 * be judged; anything else keeps the band's dark type.
 */
export function wantsLightType(colour: string): boolean {
  const match = HEX_COLOUR.exec(colour);
  if (!match) {
    return false;
  }

  const luminance = match
    .slice(1)
    .map((hex) => parseInt(hex, HEX_RADIX) / CHANNEL_MAX)
    .map((value) =>
      value <= LINEAR_BELOW
        ? value / LINEAR_SLOPE
        : ((value + GAMMA_OFFSET) / GAMMA_SCALE) ** GAMMA,
    )
    .reduce((sum, value, index) => sum + value * LUMINANCE_WEIGHTS[index], 0);

  return luminance < DARK_TYPE_FROM_LUMINANCE;
}

/** Worst first, and otherwise in the order Home Assistant gave them. */
export function byCriticality(incidents: Incident[]): Incident[] {
  return [...incidents].sort((one, other) => rank(other) - rank(one));
}

/** What an incident is on: its road, or failing that where HERE says it is. */
export function roadOf(incident: Incident, unnamed: string): string {
  return incident.road ?? incident.location ?? incident.summary ?? unnamed;
}

/** An incident's type as words, "Disabled vehicle", or `unknown` for one HERE does not give. */
export function typeName(incident: Incident, unknown: string): string {
  const words = (incident.type ?? "")
    .split(WORD_START)
    .filter(Boolean)
    .join(WORD_SEPARATOR)
    .toLowerCase();

  return words ? words.charAt(0).toUpperCase() + words.slice(1) : unknown;
}

/** What a lone incident is, or the label for a number of them. */
export function incidentsTitle(
  incidents: Incident[],
  labels: { incidents: string; incidents_type_unknown: string },
): string {
  return incidents.length === SINGLE
    ? typeName(incidents[0], labels.incidents_type_unknown)
    : labels.incidents;
}

/**
 * The banner's words: what the incidents are, then the roads they are on, worst first and each
 * once, up to `BANNER_ROADS` of them, and how many more roads there are after that.
 */
export function bannerText(
  incidents: Incident[],
  labels: {
    incidents: string;
    incidents_other: string;
    incidents_others: string;
    incidents_unnamed: string;
    incidents_type_unknown: string;
  },
): string {
  const roads = [
    ...new Set(
      byCriticality(incidents).map((incident) =>
        roadOf(incident, labels.incidents_unnamed),
      ),
    ),
  ];
  const named = roads.slice(0, BANNER_ROADS);
  const rest = roads.length - named.length;

  if (rest > 0) {
    const others =
      rest === SINGLE ? labels.incidents_other : labels.incidents_others;
    named.push(others.replace(COUNT_PLACEHOLDER, String(rest)));
  }

  return `${incidentsTitle(incidents, labels)}: ${named.join(ROAD_SEPARATOR)}`;
}

export function incidentIcon(incident: Incident): string {
  return INCIDENT_ICONS[incident.type ?? ""] ?? DEFAULT_INCIDENT_ICON;
}

/** A moment an incident gives, as a time of day if it is today, and with its date if not. */
export function incidentTime(text: string | null, now: Date): string | null {
  const moment = text === null ? null : new Date(text);
  if (moment === null || Number.isNaN(moment.getTime())) {
    return null;
  }

  return strftime(
    moment,
    moment.toDateString() === now.toDateString()
      ? TODAY_FORMAT
      : OTHER_DAY_FORMAT,
  );
}

export interface WhenLabels {
  minutes: string;
  incidents_hours: string;
  incidents_today: string;
  incidents_since: string;
  incidents_until: string;
  incidents_range: string;
  incidents_clears_in: string;
  incidents_clears_on: string;
  incidents_cleared_at: string;
  incidents_cleared_on: string;
  incidents_starts_in: string;
  incidents_starts_on: string;
  incidents_ongoing: string;
}

function momentOf(text: string | null): Date | null {
  const moment = text === null ? null : new Date(text);

  return moment === null || Number.isNaN(moment.getTime()) ? null : moment;
}

function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (filled, [key, value]) => filled.replace(`{${key}}`, value),
    template,
  );
}

// Calendar days from `now` to `then`; rounded, since a day across a clock change is not 24 hours.
function daysUntil(then: Date, now: Date): number {
  const midnight = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  return Math.round((midnight(then) - midnight(now)) / DAY_MS);
}

/** A day ahead: today, its weekday within the week, or its date further off. */
function dayAhead(then: Date, now: Date, labels: WhenLabels): string {
  const days = daysUntil(then, now);
  if (days === TODAY) {
    return labels.incidents_today;
  }

  return days > TODAY && days < DAYS_PER_WEEK
    ? strftime(then, WEEKDAY_FORMAT)
    : strftime(then, DATE_FORMAT);
}

/** A time left, to the minute and rounded up: "45 min", "1 hr 15 min", "2 hr". */
function duration(ms: number, labels: WhenLabels): string {
  const minutes = Math.ceil(ms / MINUTE_MS);
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  const parts = [
    hours > 0 ? `${hours} ${labels.incidents_hours}` : null,
    rest > 0 || hours === 0 ? `${rest} ${labels.minutes}` : null,
  ];

  return parts.filter(Boolean).join(DURATION_SEPARATOR);
}

/**
 * When an incident clears, as of `now`. One spanning a day or less is counted down, its times in
 * parentheses: "Clears in ~1 hr 15 min (11:22 to 12:37)". A longer one is told by the
 * day it clears and when it began: "Clears Friday (ongoing since Oct 1)". One not yet
 * begun says when it starts, one past its end that it should have cleared, and one with no end
 * only when it began.
 */
export function incidentWhen(
  incident: Incident,
  now: Date,
  labels: WhenLabels,
): string | null {
  const start = momentOf(incident.start_time);
  const end = momentOf(incident.end_time);

  if (end === null) {
    const since = incidentTime(incident.start_time, now);

    return since && `${labels.incidents_since} ${since}`;
  }

  const time = (moment: Date) => strftime(moment, TODAY_FORMAT);
  const ongoing = end.getTime() - (start ?? now).getTime() > DAY_MS;

  if (start !== null && start > now) {
    const lead = start.getTime() - now.getTime();
    const opening =
      lead > DAY_MS
        ? fill(labels.incidents_starts_on, { day: dayAhead(start, now, labels) })
        : fill(labels.incidents_starts_in, { duration: duration(lead, labels) });
    const span = ongoing
      ? `${labels.incidents_until} ${dayAhead(end, now, labels)}`
      : fill(labels.incidents_range, { start: time(start), end: time(end) });

    return `${opening} (${span})`;
  }

  if (!ongoing) {
    if (end <= now) {
      return fill(labels.incidents_cleared_at, { time: time(end) });
    }

    const span =
      start === null
        ? `${labels.incidents_until} ${time(end)}`
        : fill(labels.incidents_range, { start: time(start), end: time(end) });

    return `${fill(labels.incidents_clears_in, { duration: duration(end.getTime() - now.getTime(), labels) })} (${span})`;
  }

  // Past its end today, it gives the time; on an earlier day, the date.
  const clears =
    end > now
      ? fill(labels.incidents_clears_on, { day: dayAhead(end, now, labels) })
      : daysUntil(end, now) === TODAY
        ? fill(labels.incidents_cleared_at, { time: time(end) })
        : fill(labels.incidents_cleared_on, { day: strftime(end, DATE_FORMAT) });

  if (start === null) {
    return clears;
  }

  const began =
    daysUntil(start, now) === TODAY ? time(start) : strftime(start, DATE_FORMAT);

  return `${clears} (${fill(labels.incidents_ongoing, { day: began })})`;
}
