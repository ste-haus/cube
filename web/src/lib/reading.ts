/* Where a range bar's reading sits over its marker. */

const HALF = 0.5;
const START = 0;
const END = 1;

export interface ReadingLayout {
  /** How far along the bar the marker is, from 0 to 1. */
  along: number;
  barWidth: number;
  /** The space between the bar and the labels at either end of it. */
  gap: number;
  numberWidth: number;
  /** The whole reading, its number and its unit. */
  readingWidth: number;
}

/**
 * How far back from the marker the reading starts, in pixels.
 *
 * The number is centred on the marker wherever that fits. Only where centring it would run the
 * reading past the space beside the bar and into the labels at an end does it slide inward, and
 * then by no more than keeps it clear of them.
 */
export function readingOffset({ along, barWidth, gap, numberWidth, readingWidth }: ReadingLayout): number {
  const marker = Math.min(Math.max(along, START), END) * barWidth;
  const centred = numberWidth * HALF;
  const clearOfStart = marker + gap;
  const clearOfEnd = marker + readingWidth - barWidth - gap;

  return Math.min(Math.max(centred, clearOfEnd), clearOfStart);
}
