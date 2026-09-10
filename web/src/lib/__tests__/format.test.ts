import { describe, expect, it } from "vitest";

import { revealSchedule, revealedBy } from "../format";

/** How many syllables a line takes to speak, which is where its schedule ends. */
function beats(text: string): number {
  return revealSchedule(text).at(-1) ?? 0;
}

describe("how a line is paced", () => {
  it("counts a word's vowel groups as its syllables", () => {
    expect(beats("announcement")).toBeCloseTo(4);
    expect(beats("sample")).toBeCloseTo(2);
  });

  it("gives a word with no vowel group a syllable anyway", () => {
    expect(beats("hmm")).toBeCloseTo(1);
  });

  it("does not charge a long word by its spelling", () => {
    // Same syllable, nearly twice the letters: the reveal should not take twice as long.
    expect(beats("through")).toBeCloseTo(beats("thru"));
  });

  it("charges a gap between words less than a syllable", () => {
    // Two syllables either way, so the difference is the space and nothing else.
    const gap = beats("ab ab") - beats("abab");

    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(1);
  });

  it("adds a pause for punctuation without depending on there being any", () => {
    expect(beats("ab,")).toBeGreaterThan(beats("ab"));
    expect(beats("ab.")).toBeGreaterThan(beats("ab,"));
  });

  it("has nothing to say about an empty line", () => {
    expect(beats("")).toBe(0);
  });
});

describe("revealSchedule", () => {
  it("gives every character a moment of its own", () => {
    expect(revealSchedule("abcd")).toHaveLength(4);
  });

  it("runs forwards, and ends where the line's beats run out", () => {
    const schedule = revealSchedule("a sample line");

    expect([...schedule].sort((first, second) => first - second)).toEqual(schedule);
    expect(schedule.at(-1)).toBeCloseTo(beats("a sample line"));
  });

  it("holds longer on a comma than on the letters either side of it", () => {
    const schedule = revealSchedule("ab,cd");
    const runs = schedule.map((at, index) => at - (schedule[index - 1] ?? 0));

    expect(runs[2]).toBeGreaterThan(runs[1]);
    expect(runs[2]).toBeGreaterThan(runs[3]);
  });
});

describe("revealedBy", () => {
  const schedule = revealSchedule("abcd");

  it("shows nothing before the first character is due", () => {
    expect(revealedBy(schedule, 0)).toBe(0);
  });

  it("shows the whole line once its last beat has passed", () => {
    expect(revealedBy(schedule, beats("abcd"))).toBe(4);
  });

  it("does not run past the end however long it is left", () => {
    expect(revealedBy(schedule, Number.MAX_SAFE_INTEGER)).toBe(4);
  });

  it("reveals more as time goes on and never less", () => {
    const counts = [0, 0.25, 0.5, 0.75, 1].map((beats) => revealedBy(schedule, beats));

    expect(counts).toEqual([...counts].sort((first, second) => first - second));
  });
});
