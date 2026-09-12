import { describe, expect, it } from "vitest";

import { hourChart, peaks, weekChart } from "../forecast.svelte";
import { sunIsUp } from "../sky";
import type { ForecastHour } from "../types";

const LATITUDE = 45;
const MINUTES_PER_DEGREE = 4;
const NOW = "Now";

/** A longitude where this machine's clock reads roughly solar time, as the sky tests use. */
function localLongitude(at: Date): number {
  return -at.getTimezoneOffset() / MINUTES_PER_DEGREE;
}

function hour(at: Date, temperature: number | null = 62, chance: number | null = 0): ForecastHour {
  return { time: at.toISOString(), condition: "partlycloudy", temperature, precipitation_probability: chance };
}

function live(temperature: number | null, condition: string | null = null, daytime: boolean | null = null) {
  return { temperature, condition, daytime };
}

const twoPm = new Date(2026, 8, 11, 14);
const threePm = new Date(2026, 8, 11, 15);
const threeAm = new Date(2026, 8, 12, 3);

describe("hourChart", () => {
  it("labels the hours on a 24-hour clock", () => {
    const chart = hourChart([hour(twoPm), hour(threePm), hour(threeAm)], null, null, NOW);

    expect(chart.columns.map((column) => column.label)).toEqual(["14", "15", "03"]);
  });

  it("carries the chance of rain, and none for no chance", () => {
    const chart = hourChart([hour(twoPm, 62, 30), hour(threePm, 62, 0), hour(threeAm, 62, null)], null, null, NOW);

    expect(chart.columns.map((column) => column.rain)).toEqual([30, null, null]);
  });

  it("rounds a fractional chance of rain", () => {
    expect(hourChart([hour(twoPm, 62, 12.6)], null, null, NOW).columns[0].rain).toBe(13);
  });

  it("never draws the rain past the chart's full height", () => {
    expect(hourChart([hour(twoPm, 62, 140)], null, null, NOW).columns[0].rain).toBe(100);
  });

  it("draws the sky by night for an hour the sun is down", () => {
    const chart = hourChart([hour(twoPm), hour(threeAm)], LATITUDE, localLongitude(twoPm), NOW);

    expect(chart.columns.map((column) => column.daytime)).toEqual([true, false]);
  });

  it("draws every hour by day with nowhere to reckon the sun from", () => {
    expect(hourChart([hour(threeAm)], null, null, NOW).columns[0].daytime).toBe(true);
  });

  it("runs one temperature line, warmest highest", () => {
    const chart = hourChart([hour(twoPm, 66), hour(threePm, 60)], null, null, NOW);
    const [line] = chart.lines;

    expect(chart.lines).toHaveLength(1);
    expect(line.positions[0]!).toBeLessThan(line.positions[1]!);
  });

  function tone(...temperatures: (number | null)[]): string {
    const at = [twoPm, threePm, threeAm];

    return hourChart(temperatures.map((temperature, index) => hour(at[index], temperature)), null, null, NOW).lines[0]
      .tone;
  }

  it("tones a span that ends warmer than it starts as rising", () => {
    expect(tone(60, 64)).toBe("rising");
  });

  it("tones a span that ends cooler than it starts as falling", () => {
    expect(tone(64, 60)).toBe("falling");
  });

  it("tones a span that ends where it started as rising", () => {
    expect(tone(62, 58, 62)).toBe("rising");
  });

  it("goes by the first and last hours there is a temperature for", () => {
    expect(tone(64, 60, null)).toBe("falling");
  });

  it("goes by the whole degrees the pills give, so a fraction either way holds", () => {
    expect(tone(57.8, 57.6)).toBe("rising");
    expect(tone(58.6, 57.4)).toBe("falling");
  });

  it("opens on the current temperature rather than the forecast's for the hour", () => {
    const chart = hourChart([hour(twoPm, 62), hour(threePm, 60)], null, null, NOW, live(58.4));

    expect(chart.lines[0].values).toEqual([58.4, 60]);
  });

  it("keeps the forecast's first hour with no current temperature", () => {
    const chart = hourChart([hour(twoPm, 62), hour(threePm, 60)], null, null, NOW, live(null));

    expect(chart.lines[0].values).toEqual([62, 60]);
  });

  it("tones the span from the current temperature", () => {
    expect(hourChart([hour(twoPm, 62), hour(threePm, 60)], null, null, NOW, live(58)).lines[0].tone).toBe("rising");
  });

  it("opens on the sky as it is now rather than the forecast's for the hour", () => {
    const chart = hourChart([hour(twoPm), hour(threePm)], null, null, NOW, live(null, "rainy"));

    expect(chart.columns.map((column) => column.condition)).toEqual(["rainy", "partlycloudy"]);
  });

  it("draws the next hour's sky where it differs from the sky now", () => {
    const chart = hourChart([hour(twoPm), hour(threePm), hour(threeAm)], null, null, NOW, live(null, "rainy"));

    expect(chart.columns.map((column) => column.iconShown)).toEqual([true, true, true]);
  });

  it("draws the sky now by night once the sun has set, whatever the hour's own", () => {
    const chart = hourChart([hour(twoPm), hour(threePm)], LATITUDE, localLongitude(twoPm), NOW, live(null, null, false));

    expect(chart.columns.map((column) => column.daytime)).toEqual([false, true]);
  });

  it("pills a low between the ends that the ends do not show", () => {
    const at = [twoPm, threePm, new Date(2026, 8, 11, 16), new Date(2026, 8, 11, 17)];
    const chart = hourChart(
      [57, 52, 55, 57].map((temperature, index) => hour(at[index], temperature)),
      null,
      null,
      NOW,
    );

    expect(chart.lines[0].peaks).toEqual([1]);
  });
});

describe("peaks", () => {
  it("gives a low below both ends", () => {
    expect(peaks([57, 55, 52, 54, 57])).toEqual([2]);
  });

  it("gives a high above both ends", () => {
    expect(peaks([57, 60, 62, 58])).toEqual([2]);
  });

  it("gives both when the line rises above its ends and falls below them", () => {
    expect(peaks([57, 61, 57, 53, 57])).toEqual([1, 3]);
  });

  it("gives nothing when the ends are the high and the low", () => {
    expect(peaks([52, 54, 57])).toEqual([]);
  });

  it("goes by whole degrees, as the pills do", () => {
    expect(peaks([57, 56.6, 57])).toEqual([]);
  });

  it("gives the first point of a low held over several", () => {
    expect(peaks([57, 52, 52, 57])).toEqual([1]);
  });

  it("passes over points with no temperature", () => {
    expect(peaks([57, null, 52, 57])).toEqual([2]);
  });
});

describe("hourChart's sky", () => {
  const fourPm = new Date(2026, 8, 11, 16);
  const fivePm = new Date(2026, 8, 11, 17);

  function sky(conditions: string[]): boolean[] {
    const at = [twoPm, threePm, fourPm, fivePm];
    const hours = conditions.map((condition, index) => ({ ...hour(at[index]), condition }));

    return hourChart(hours, null, null, NOW).columns.map((column) => column.iconShown);
  }

  it("always draws the sky now and at the far end", () => {
    expect(sky(["cloudy", "cloudy", "cloudy", "cloudy"])).toEqual([true, false, false, true]);
  });

  it("draws it between only where the condition changes from the hour before", () => {
    expect(sky(["cloudy", "rainy", "rainy", "cloudy"])).toEqual([true, true, false, true]);
  });

  it("draws every day of the week", () => {
    const week = weekChart([
      { date: "2026-09-10", condition: "sunny", high: 71, low: 54, precipitation_probability: 0 },
      { date: "2026-09-11", condition: "sunny", high: 66, low: 52, precipitation_probability: 0 },
      { date: "2026-09-12", condition: "sunny", high: 66, low: 52, precipitation_probability: 0 },
    ]);

    expect(week.columns.every((column) => column.iconShown)).toBe(true);
  });
});

describe("hourChart's snow", () => {
  function snowy(conditions: string[], now: string | null = null): boolean {
    const at = [twoPm, threePm, threeAm];
    const hours = conditions.map((condition, index) => ({ ...hour(at[index]), condition }));

    return hourChart(hours, null, null, NOW, live(null, now)).snow;
  }

  it("draws the precipitation as snow when any hour names snow", () => {
    expect(snowy(["cloudy", "snowy-rainy", "cloudy"])).toBe(true);
  });

  it("draws it as rain when none does", () => {
    expect(snowy(["cloudy", "rainy", "pouring"])).toBe(false);
  });

  it("counts the sky now among the hours", () => {
    expect(snowy(["cloudy", "cloudy"], "snowy")).toBe(true);
  });

  it("draws the week's precipitation as snow when any day names snow", () => {
    const week = weekChart([
      { date: "2026-12-10", condition: "cloudy", high: 34, low: 28, precipitation_probability: 20 },
      { date: "2026-12-11", condition: "snowy", high: 30, low: 20, precipitation_probability: 80 },
    ]);

    expect(week.snow).toBe(true);
  });
});

describe("hourChart's span", () => {
  const chart = hourChart([hour(twoPm), hour(threePm), hour(threeAm)], null, null, NOW);

  it("runs from now to its last hour on a 24-hour clock", () => {
    expect(chart.span).toEqual({ start: NOW, end: "03:00" });
  });

  it("gives the temperature only at its ends, with dots between", () => {
    expect(chart.lines[0].pills).toBe("ends");
  });

  it("has no span with no hours to run across", () => {
    expect(hourChart([], null, null, NOW).span).toBeNull();
  });
});

describe("weekChart", () => {
  const days = [
    { date: "2026-09-10", condition: "sunny", high: 71, low: 54, precipitation_probability: 0 },
    { date: "2026-09-11", condition: "cloudy", high: 66, low: 52, precipitation_probability: 0 },
  ];

  it("heads each day with its weekday and draws it by day", () => {
    const chart = weekChart(days);

    expect(chart.columns.map((column) => column.label)).toEqual(["Thu", "Fri"]);
    expect(chart.columns.every((column) => column.daytime)).toBe(true);
  });

  it("carries each day's chance of rain, and none for no chance", () => {
    const wet = [
      { ...days[0], precipitation_probability: 30 },
      { ...days[1], precipitation_probability: 0 },
    ];

    expect(weekChart(wet).columns.map((column) => column.rain)).toEqual([30, null]);
    expect(weekChart(wet).snow).toBe(false);
  });

  it("runs a line for the highs and one for the lows", () => {
    expect(weekChart(days).lines.map((line) => line.tone)).toEqual(["high", "low"]);
  });

  it("gives every day's temperatures in pills, under a label per day", () => {
    const chart = weekChart(days);

    expect(chart.lines.every((line) => line.pills === "all" && line.peaks.length === 0)).toBe(true);
    expect(chart.span).toBeNull();
  });
});

describe("sunIsUp", () => {
  it("has the sun up at midday and down in the small hours", () => {
    expect(sunIsUp(twoPm, LATITUDE, localLongitude(twoPm))).toBe(true);
    expect(sunIsUp(threeAm, LATITUDE, localLongitude(threeAm))).toBe(false);
  });
});
