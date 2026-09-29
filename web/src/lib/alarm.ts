/*
 * The alarm's time, as Home Assistant's `input_datetime` holds it and as the panel steps it.
 *
 * The hours and the minutes step on their own, the way a clock's setting wheels do: the minutes go
 * round the hour without carrying into it. A minute that is off the step, set somewhere else, lands
 * on the step in whichever direction it was pressed.
 */

export interface TimeOfDay {
  hours: number;
  minutes: number;
}

export type TimePart = "hours" | "minutes";
export type StepDirection = 1 | -1;

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SEPARATOR = ":";
const PAD_WIDTH = 2;
const PAD = "0";
const TIME_OF_DAY = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

/** Reads `HH:MM` or `HH:MM:SS`, or null for anything else. */
export function parseTime(value: string | null | undefined): TimeOfDay | null {
  const match = value ? TIME_OF_DAY.exec(value) : null;
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  return hours < HOURS_PER_DAY && minutes < MINUTES_PER_HOUR ? { hours, minutes } : null;
}

function pad(value: number): string {
  return String(value).padStart(PAD_WIDTH, PAD);
}

/** `HH:MM`, which is also what Home Assistant is sent. */
export function formatTime(time: TimeOfDay): string {
  return `${pad(time.hours)}${SEPARATOR}${pad(time.minutes)}`;
}

function wrap(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

export function stepTime(time: TimeOfDay, part: TimePart, direction: StepDirection, minuteStep: number): TimeOfDay {
  if (part === "hours") {
    return { ...time, hours: wrap(time.hours + direction, HOURS_PER_DAY) };
  }

  const offStep = time.minutes % minuteStep !== 0;
  const snapped = Math.floor(time.minutes / minuteStep) * minuteStep;
  // Down from off the step lands on the step just below; up goes to the one above either way.
  const minutes = offStep && direction < 0 ? snapped : snapped + direction * minuteStep;

  return { ...time, minutes: wrap(minutes, MINUTES_PER_HOUR) };
}
