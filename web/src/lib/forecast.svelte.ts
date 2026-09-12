import { fetchForecast } from "./api";
import { strftime } from "./format";
import { sunIsUp } from "./sky";
import type { ForecastDay, ForecastHour } from "./types";

const REFRESH_MS = 30 * 60 * 1000;

const WEEKDAY_FORMAT = "%a";
const HOUR_FORMAT = "%H";
const SPAN_END_FORMAT = "%H:%M";
const HALF = 0.5;
const NO_CHANCE = 0;
const CERTAIN = 100;

/* Any condition naming snow, "snowy" and "snowy-rainy" alike. */
const SNOW = "snow";

/* The least spread of temperatures a line is drawn over, so a degree or two either way looks like a
 * degree or two rather than filling the chart. In Fahrenheit, and scaled down for Celsius. */
const MINIMUM_SPREAD_FAHRENHEIT = 10;
const FAHRENHEIT_PER_CELSIUS = 1.8;
const CELSIUS = "°C";

/* A line needs a point between its ends before it can peak anywhere but at one of them. */
const ENDS = 2;

/* Where each line may run, as a percentage down the chart. The week's two are kept apart, so a
 * mild day's high and low never land on each other; the hours have one line and the room to
 * themselves. */
const HIGH_BAND = { top: 14, bottom: 40 };
const LOW_BAND = { top: 60, bottom: 86 };
const HOUR_BAND = { top: 18, bottom: 78 };

/**
 * The forecast, by the day and by the hour, fetched once for the page.
 *
 * Forecasts are asked of Home Assistant per panel, so this polls only while something on a face
 * being looked at is holding it. Holders are counted rather than flagged, so a face turning away
 * cannot stop the poll out from under another one that has just turned to.
 */
class Forecast {
  days = $state<ForecastDay[]>([]);
  hours = $state<ForecastHour[]>([]);

  #timer: number | null = null;
  #holders = 0;

  start(): void {
    this.#holders += 1;

    if (this.#timer !== null) {
      return;
    }

    this.#load();
    this.#timer = window.setInterval(() => this.#load(), REFRESH_MS);
  }

  stop(): void {
    this.#holders = Math.max(this.#holders - 1, 0);

    if (this.#holders > 0 || this.#timer === null) {
      return;
    }

    window.clearInterval(this.#timer);
    this.#timer = null;
  }

  #load(): void {
    fetchForecast()
      .then((loaded) => {
        this.days = loaded.days;
        this.hours = loaded.hours;
      })
      .catch(() => {
        // The forecast is worth less than the panel staying up; the next tick tries again.
      });
  }
}

/** A forecast date's weekday. The date is a bare one, so it is read as local rather than UTC. */
export function weekday(date: string): string {
  const [year, month, day] = date.split("-").map(Number);

  return strftime(new Date(year, month - 1, day), WEEKDAY_FORMAT);
}

/**
 * Where each value sits within a band of the chart, as a percentage down from its top.
 *
 * The highs and the lows each get a band of their own rather than sharing one axis. On a shared
 * axis a mild day's high and low land on top of each other and so do their labels; apart, the two
 * lines never cross, and each still shows the shape of the week, which is what the chart is for.
 *
 * The band spans at least `minimumSpread` degrees, centred on the values, so a spell of nearly one
 * temperature runs nearly level across the middle rather than being stretched to fill it. A week of
 * one temperature with no minimum sits across the middle too. A missing value stays missing.
 */
export function bandPositions(
  values: (number | null)[],
  top: number,
  bottom: number,
  minimumSpread = 0,
): (number | null)[] {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return values.map(() => null);
  }

  const highest = Math.max(...present);
  const lowest = Math.min(...present);
  const spread = Math.max(highest - lowest, minimumSpread);
  const ceiling = (highest + lowest) * HALF + spread * HALF;
  const height = bottom - top;

  return values.map((value) => {
    if (value === null) {
      return null;
    }

    return spread === 0 ? top + height * HALF : top + ((ceiling - value) / spread) * height;
  });
}

/** The least spread a line of temperatures is drawn over, in the unit it is given in. */
export function minimumSpread(unit: string | null): number {
  return unit === CELSIUS ? MINIMUM_SPREAD_FAHRENHEIT / FAHRENHEIT_PER_CELSIUS : MINIMUM_SPREAD_FAHRENHEIT;
}

/**
 * Where a line peaks and bottoms out between its ends, when the ends do not already show it: a
 * high above both of them and a low below both, in the whole degrees the pills give. Of a high or
 * low held over several points, the first is the one given.
 */
export function peaks(values: (number | null)[]): number[] {
  const present = values.flatMap((value, index) => (value === null ? [] : [{ index, degrees: Math.round(value) }]));
  if (present.length <= ENDS) {
    return [];
  }

  const first = present[0];
  const last = present[present.length - 1];
  const between = present.slice(1, -1);
  const highest = between.reduce((best, point) => (point.degrees > best.degrees ? point : best));
  const lowest = between.reduce((best, point) => (point.degrees < best.degrees ? point : best));

  const found: number[] = [];
  if (highest.degrees > Math.max(first.degrees, last.degrees)) {
    found.push(highest.index);
  }
  if (lowest.degrees < Math.min(first.degrees, last.degrees)) {
    found.push(lowest.index);
  }

  return found.sort((earlier, later) => earlier - later);
}

/** The week's highs and lows, or the hours' one line, warming or cooling over its span. */
export type LineTone = "high" | "low" | "rising" | "falling";

/** One column of a forecast chart: what heads it, the sky under it, and the rain behind it. */
export interface ChartColumn {
  key: string;
  label: string;
  condition: string | null;
  daytime: boolean;
  /** Whether the sky is drawn for this column at all. */
  iconShown: boolean;
  /** The chance of rain, from 0 to 100, or null for none worth drawing. */
  rain: number | null;
}

/** One line across a forecast chart: its values, and where each sits down the chart. */
export interface ChartLine {
  tone: LineTone;
  values: (number | null)[];
  positions: (number | null)[];
  /** Every point in a pill, or only the two ends, with dots between. */
  pills: "all" | "ends";
  /** Points between the ends given a pill too, for a high or low the ends do not show. */
  peaks: number[];
}

export interface Chart {
  columns: ChartColumn[];
  lines: ChartLine[];
  /** What the chart runs from and to, heading it in place of a label over every column. */
  span: { start: string; end: string } | null;
  /** Whether any of its hours is forecast to snow, which draws the precipitation as snow. */
  snow: boolean;
}

/** The weather right now, which the first hour takes in place of the forecast's for it. */
export interface LiveHour {
  temperature: number | null;
  condition: string | null;
  /** Whether the sun is up, or null to reckon it from where the panel is. */
  daytime: boolean | null;
}

/** A chance of rain in whole percent, held between none and certain, or null for none at all. */
function chanceOf(probability: number | null | undefined): number | null {
  const chance = Math.min(Math.max(Math.round(probability ?? NO_CHANCE), NO_CHANCE), CERTAIN);

  return chance > NO_CHANCE ? chance : null;
}

function namesSnow(condition: string | null): boolean {
  return condition?.toLowerCase().includes(SNOW) ?? false;
}

/**
 * The week as a chart: a column a day, the high and the low each in a band of its own, and the
 * chance of rain behind them as the hours have it, drawn as snow when any of the days names snow.
 */
export function weekChart(days: ForecastDay[], spread = 0): Chart {
  const highs = days.map((day) => day.high);
  const lows = days.map((day) => day.low);

  return {
    columns: days.map((day) => ({
      key: day.date,
      label: weekday(day.date),
      condition: day.condition,
      daytime: true,
      iconShown: true,
      rain: chanceOf(day.precipitation_probability),
    })),
    lines: [
      {
        tone: "high",
        values: highs,
        positions: bandPositions(highs, HIGH_BAND.top, HIGH_BAND.bottom, spread),
        pills: "all",
        peaks: [],
      },
      {
        tone: "low",
        values: lows,
        positions: bandPositions(lows, LOW_BAND.top, LOW_BAND.bottom, spread),
        pills: "all",
        peaks: [],
      },
    ],
    span: null,
    snow: days.some((day) => namesSnow(day.condition)),
  };
}

/**
 * The next hours as a chart: one temperature line, the sky, and the chance of rain.
 *
 * The chart runs from now to its last hour, named on a 24-hour clock, rather than labelling every
 * hour. The temperature is a smooth line given in figures now, at the far end, and at any high or
 * low between that the ends do not show, with the other hours as dots on it; it is toned by whether
 * the span ends warmer or cooler than it starts, in the whole degrees it shows.
 *
 * The first hour is now, so it takes the live temperature, sky, and day or night where they are
 * known, rather than the forecast's for the hour. The other hours the sun is down for get the night
 * version of their sky, going by where the sun is where the panel is; with nowhere to reckon that
 * from, they are drawn by day. The chance of rain is a shaded curve behind the hours, as tall at
 * each as its chance, and is drawn as snow when any of the hours, now among them, names snow.
 */
export function hourChart(
  hours: ForecastHour[],
  latitude: number | null,
  longitude: number | null,
  nowLabel: string,
  live: LiveHour | null = null,
  spread = 0,
): Chart {
  const isNow = (index: number) => index === 0 && live !== null;

  // Every temperature and sky for the present on the face agrees, since the first hour takes the
  // weather's own reading wherever there is one.
  const temperatures = hours.map((hour, index) =>
    isNow(index) && live!.temperature !== null ? live!.temperature : hour.temperature,
  );
  const conditions = hours.map((hour, index) =>
    isNow(index) && live!.condition !== null ? live!.condition : hour.condition,
  );
  const rounded = temperatures.flatMap((temperature) => (temperature === null ? [] : [Math.round(temperature)]));
  const snow = conditions.some(namesSnow);
  const last = hours.at(-1);

  // Warming or cooling, by where the span ends against where it starts in the whole degrees the
  // pills give; one that ends no cooler than it began is drawn warming.
  const tone: LineTone = rounded.length > 0 && rounded[rounded.length - 1] < rounded[0] ? "falling" : "rising";

  return {
    columns: hours.map((hour, index) => {
      const at = new Date(hour.time);
      const edge = index === 0 || index === hours.length - 1;
      const reckoned = latitude === null || longitude === null ? true : sunIsUp(at, latitude, longitude);

      return {
        key: hour.time,
        label: strftime(at, HOUR_FORMAT),
        condition: conditions[index],
        daytime: isNow(index) && live!.daytime !== null ? live!.daytime : reckoned,
        // The sky now, at the far end, and wherever it changes: the same cloud twelve times over
        // says less than one cloud and the hour the rain arrives.
        iconShown: edge || conditions[index] !== conditions[index - 1],
        rain: chanceOf(hour.precipitation_probability),
      };
    }),
    lines: [
      {
        tone,
        values: temperatures,
        positions: bandPositions(temperatures, HOUR_BAND.top, HOUR_BAND.bottom, spread),
        pills: "ends",
        peaks: peaks(temperatures),
      },
    ],
    span: last ? { start: nowLabel, end: strftime(new Date(last.time), SPAN_END_FORMAT) } : null,
    snow,
  };
}

export const forecast = new Forecast();
