import { describe, expect, it } from "vitest";

import { containedBox, DEFAULT_RATIO, ratioOf, samePicture } from "../picture";

const FRAME = { left: 100, top: 50, width: 400, height: 400 };
const WIDE = { width: 1600, height: 900 };
const TALL = { width: 900, height: 1600 };
const NOTHING_YET = { width: 0, height: 0 };

describe("containedBox", () => {
  it("puts a wide picture across the frame, against the top when anchored there", () => {
    expect(containedBox(FRAME, WIDE, "50% 0%")).toEqual({ left: 100, top: 50, width: 400, height: 225 });
  });

  it("centres it in the slack when anchored in the middle", () => {
    expect(containedBox(FRAME, WIDE, "50% 50%")).toEqual({ left: 100, top: 137.5, width: 400, height: 225 });
  });

  it("puts a tall picture down the frame, centred across it", () => {
    expect(containedBox(FRAME, TALL, "50% 0%")).toEqual({ left: 187.5, top: 50, width: 225, height: 400 });
  });

  it("takes a picture that has not arrived as filling the frame", () => {
    expect(containedBox(FRAME, NOTHING_YET, "50% 0%")).toEqual(FRAME);
  });

  it("centres on a coordinate given as a length rather than a share", () => {
    expect(containedBox(FRAME, WIDE, "0px 10px")).toEqual({ left: 100, top: 137.5, width: 400, height: 225 });
  });
});

describe("ratioOf", () => {
  it("is width over height", () => {
    expect(ratioOf(WIDE)).toBeCloseTo(16 / 9);
  });

  it("assumes the usual camera before the first frame", () => {
    expect(ratioOf(NOTHING_YET)).toBe(DEFAULT_RATIO);
  });
});

describe("samePicture", () => {
  const PICTURE = new Uint8Array([71, 73, 70, 56, 57, 97]);

  it("takes the same bytes as the same picture", () => {
    expect(samePicture(PICTURE, new Uint8Array(PICTURE))).toBe(true);
  });

  it("takes a changed byte as a new picture", () => {
    expect(samePicture(PICTURE, new Uint8Array([71, 73, 70, 56, 57, 98]))).toBe(false);
  });

  it("takes a different length as a new picture", () => {
    expect(samePicture(PICTURE, PICTURE.slice(1))).toBe(false);
  });

  it("takes anything as new when nothing is shown yet", () => {
    expect(samePicture(null, PICTURE)).toBe(false);
  });
});
