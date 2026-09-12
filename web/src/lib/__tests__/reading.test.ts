import { describe, expect, it } from "vitest";

import { readingOffset } from "../reading";

/* A 600px bar with 20px either side of it, and a reading whose number is 100px with a 30px unit. */
const LAYOUT = { barWidth: 600, gap: 20, numberWidth: 100, readingWidth: 130 };
const CENTRED = 50;

describe("readingOffset", () => {
  it("centres the number on a marker in the middle", () => {
    expect(readingOffset({ ...LAYOUT, along: 0.5 })).toBe(CENTRED);
  });

  it("still centres it near an end, wherever it fits", () => {
    expect(readingOffset({ ...LAYOUT, along: 0.1 })).toBe(CENTRED);
    expect(readingOffset({ ...LAYOUT, along: 0.9 })).toBe(CENTRED);
  });

  it("slides it in at the start only as far as keeps it off the start's labels", () => {
    const offset = readingOffset({ ...LAYOUT, along: 0 });

    expect(-offset).toBe(-LAYOUT.gap);
  });

  it("slides it in at the end only as far as keeps its unit off the end's labels", () => {
    const offset = readingOffset({ ...LAYOUT, along: 1 });

    expect(LAYOUT.barWidth - offset + LAYOUT.readingWidth).toBe(LAYOUT.barWidth + LAYOUT.gap);
  });

  it("treats a marker past either end as at that end", () => {
    expect(readingOffset({ ...LAYOUT, along: -0.2 })).toBe(readingOffset({ ...LAYOUT, along: 0 }));
    expect(readingOffset({ ...LAYOUT, along: 1.2 })).toBe(readingOffset({ ...LAYOUT, along: 1 }));
  });
});
