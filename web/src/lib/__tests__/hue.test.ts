import { describe, expect, it } from "vitest";

import { colourOf, hexToHueSaturation, xyToHueSaturation, hueAt, pointAtHue, readHueSaturation, sameColour, takesHue, wantsLightType } from "../hue";

describe("takesHue", () => {
  it("is true of a light with any colour mode that takes a hue", () => {
    expect(takesHue(["hs"])).toBe(true);
    expect(takesHue(["color_temp", "xy"])).toBe(true);
  });

  it("is false of a light with only brightness, colour temperature, or nothing said", () => {
    expect(takesHue(["brightness"])).toBe(false);
    expect(takesHue(["color_temp"])).toBe(false);
    expect(takesHue(null)).toBe(false);
  });
});

describe("hueAt", () => {
  it("reads red at the top and runs clockwise", () => {
    expect(hueAt(0, -1)).toBe(0);
    expect(hueAt(1, 0)).toBe(90);
    expect(hueAt(0, 1)).toBe(180);
    expect(hueAt(-1, 0)).toBe(270);
  });

  it("puts a hue back where it reads it", () => {
    const { x, y } = pointAtHue(200, 0, 0, 10);

    expect(hueAt(x, y)).toBe(200);
  });
});

describe("readHueSaturation", () => {
  it("reads Home Assistant's pair", () => {
    expect(readHueSaturation([210.5, 80])).toEqual({ hue: 210.5, saturation: 80 });
  });

  it("reads nothing from anything else", () => {
    expect(readHueSaturation(null)).toBeNull();
    expect(readHueSaturation([1])).toBeNull();
  });
});

describe("sameColour", () => {
  it("allows for Home Assistant's rounding, round the top of the wheel too", () => {
    expect(sameColour({ hue: 43, saturation: 73 }, { hue: 44.5, saturation: 71 })).toBe(true);
    expect(sameColour({ hue: 359, saturation: 100 }, { hue: 1, saturation: 100 })).toBe(true);
    expect(sameColour({ hue: 43, saturation: 73 }, { hue: 60, saturation: 73 })).toBe(false);
    expect(sameColour(null, { hue: 0, saturation: 0 })).toBe(false);
  });
});

describe("hexToHueSaturation", () => {
  it("reads a colour's hue and saturation", () => {
    expect(hexToHueSaturation("#ff0000")).toEqual({ hue: 0, saturation: 100 });
    expect(hexToHueSaturation("#00f")).toEqual({ hue: 240, saturation: 100 });
    expect(hexToHueSaturation("#ffffff")).toEqual({ hue: 0, saturation: 0 });
  });

  it("reads nothing from something that is not a hex colour", () => {
    expect(hexToHueSaturation("amber")).toBeNull();
  });
});

describe("colourOf", () => {
  it("draws a colour at full value, as Home Assistant has it", () => {
    expect(colourOf({ hue: 0, saturation: 100 })).toBe("rgb(255 0 0)");
    expect(colourOf({ hue: 120, saturation: 100 })).toBe("rgb(0 255 0)");
    expect(colourOf({ hue: 0, saturation: 0 })).toBe("rgb(255 255 255)");
  });

  it("gives back the colour a hex was read as", () => {
    const amber = hexToHueSaturation("#f5c242");

    expect(amber && colourOf(amber)).toBe("rgb(255 202 69)");
  });
});

describe("wantsLightType", () => {
  it("puts light type on a dark colour and dark type on a light one", () => {
    expect(wantsLightType({ hue: 240, saturation: 100 })).toBe(true);
    expect(wantsLightType({ hue: 60, saturation: 100 })).toBe(false);
    expect(wantsLightType({ hue: 120, saturation: 100 })).toBe(false);
  });
});

describe("xyToHueSaturation", () => {
  it("reads the full profile's warm white as Home Assistant does", () => {
    const colour = xyToHueSaturation({ x: 0.469, y: 0.403 });

    expect(colour.hue).toBeCloseTo(35.3, 0);
    expect(colour.saturation).toBeCloseTo(54.1, 0);
  });
});
