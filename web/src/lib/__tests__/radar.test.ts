import { describe, expect, it } from "vitest";

import {
  firstLabelLayer,
  frameDelay,
  frameLayerId,
  mapZoom,
  highwayLayers,
  metresPerPixel,
  project,
  radarTileTemplate,
  radarUrl,
  ringRadius,
  TILE_SIZE,
  tilesAround,
  withAbsoluteAssets,
  withQuietHighways,
} from "../radar";

const HALF_TILE = TILE_SIZE / 2;
const ZOOM = 7;
const HOME = { latitude: 48.8, longitude: -122.5 };

describe("project", () => {
  it("puts the origin in the middle of the one tile at zoom 0", () => {
    const origin = project(0, 0, 0);

    expect(origin.x).toBeCloseTo(HALF_TILE);
    expect(origin.y).toBeCloseTo(HALF_TILE);
  });

  it("runs west to east across the whole world", () => {
    expect(project(0, -180, ZOOM).x).toBeCloseTo(0);
    expect(project(0, 180, ZOOM).x).toBeCloseTo(TILE_SIZE * 2 ** ZOOM);
  });

  it("puts the north above the south", () => {
    expect(project(HOME.latitude, 0, ZOOM).y).toBeLessThan(project(-HOME.latitude, 0, ZOOM).y);
  });
});

describe("tilesAround", () => {
  const width = 620;
  const height = 370;
  const tiles = tilesAround(project(HOME.latitude, HOME.longitude, ZOOM), ZOOM, width, height);

  it("covers the whole box", () => {
    expect(Math.min(...tiles.map((tile) => tile.left))).toBeLessThanOrEqual(0);
    expect(Math.min(...tiles.map((tile) => tile.top))).toBeLessThanOrEqual(0);
    expect(Math.max(...tiles.map((tile) => tile.left + TILE_SIZE))).toBeGreaterThanOrEqual(width);
    expect(Math.max(...tiles.map((tile) => tile.top + TILE_SIZE))).toBeGreaterThanOrEqual(height);
  });

  it("draws no tile that falls wholly outside it", () => {
    for (const tile of tiles) {
      expect(tile.left).toBeLessThan(width);
      expect(tile.top).toBeLessThan(height);
      expect(tile.left + TILE_SIZE).toBeGreaterThan(0);
      expect(tile.top + TILE_SIZE).toBeGreaterThan(0);
    }
  });

  it("wraps round the antimeridian rather than asking for a column that is not there", () => {
    const wrapped = tilesAround(project(0, 180, 1), 1, TILE_SIZE, TILE_SIZE);

    for (const tile of wrapped) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(2);
    }
  });
});

describe("ringRadius", () => {
  it("shrinks a pixel's worth of ground toward the poles", () => {
    expect(metresPerPixel(HOME.latitude, ZOOM)).toBeLessThan(metresPerPixel(0, ZOOM));
  });

  it("makes a mile longer than a kilometre", () => {
    expect(ringRadius(1, "mi", HOME.latitude, ZOOM)).toBeGreaterThan(ringRadius(1, "km", HOME.latitude, ZOOM));
  });

  it("puts twenty-five miles about fifty pixels out at zoom 7 here", () => {
    expect(ringRadius(25, "mi", HOME.latitude, ZOOM)).toBeCloseTo(50, -1);
  });
});

describe("the vector map", () => {
  it("sits one zoom level below the radar, so both draw the ground at one scale", () => {
    expect(mapZoom(ZOOM)).toBe(ZOOM - 1);
  });

  it("puts the rain under the first layer of labels", () => {
    const layers = [
      { id: "background", type: "background" },
      { id: "water", type: "fill" },
      { id: "place-city", type: "symbol" },
      { id: "place-town", type: "symbol" },
    ];

    expect(firstLabelLayer(layers)).toBe("place-city");
  });

  it("puts the rain on top when the style has no labels", () => {
    expect(firstLabelLayer([{ id: "water", type: "fill" }])).toBeUndefined();
  });

  it("names each frame's layer after the moment it shows", () => {
    expect(frameLayerId({ time: 1, id: "a" })).not.toBe(frameLayerId({ time: 2, id: "a" }));
  });

  it("finds the orange highways: every highway's outline, and the motorways themselves", () => {
    const style = [
      { id: "water", type: "fill" },
      { id: "street-motorway:outline", type: "line" },
      { id: "street-motorway", type: "line" },
      { id: "street-trunk:outline", type: "line" },
      { id: "street-trunk", type: "line" },
      { id: "tunnel-street-secondary-link:outline", type: "line" },
      { id: "bridge-street-motorway:bridge", type: "line" },
      { id: "street-tertiary:outline", type: "line" },
      { id: "label-motorway-shield", type: "symbol" },
    ];

    expect(highwayLayers(style)).toEqual([
      { id: "street-motorway:outline", outline: true },
      { id: "street-motorway", outline: false },
      { id: "street-trunk:outline", outline: true },
      { id: "tunnel-street-secondary-link:outline", outline: true },
    ]);
  });

  it("greys the highways in a style, and leaves the rest of it and the original alone", () => {
    const style = {
      version: 8,
      layers: [
        { id: "water", type: "fill", paint: { "fill-color": "blue" } },
        { id: "street-motorway:outline", type: "line", paint: { "line-color": "orange", "line-width": 2 } },
        { id: "street-motorway", type: "line", paint: { "line-color": "brown" } },
      ],
    };

    const quiet = withQuietHighways(style, "#4a4a4a", "#333333");

    expect(quiet.layers.map((layer) => layer.paint)).toEqual([
      { "fill-color": "blue" },
      { "line-color": "#333333", "line-width": 2 },
      { "line-color": "#4a4a4a" },
    ]);
    expect(style.layers[1].paint).toEqual({ "line-color": "orange", "line-width": 2 });
  });
});

describe("the map's assets", () => {
  const origin = "https://cube.example";

  it("completes the addresses cube gives as paths", () => {
    const style = {
      sprite: [{ id: "basics", url: "/api/map/sprites/basics/sprites" }],
      glyphs: "/api/map/glyphs/{fontstack}/{range}.pbf",
    };

    expect(withAbsoluteAssets(style, origin)).toEqual({
      sprite: [{ id: "basics", url: "https://cube.example/api/map/sprites/basics/sprites" }],
      glyphs: "https://cube.example/api/map/glyphs/{fontstack}/{range}.pbf",
    });
  });

  it("leaves whole addresses alone", () => {
    const style = { sprite: "https://elsewhere.example/sprite", glyphs: "//elsewhere.example/{fontstack}/{range}.pbf" };

    expect(withAbsoluteAssets(style, origin)).toEqual(style);
  });

  it("adds nothing a style did not have", () => {
    expect(withAbsoluteAssets({ glyphs: "/api/map/glyphs/{fontstack}/{range}.pbf" }, origin)).not.toHaveProperty(
      "sprite",
    );
  });
});

describe("tile addresses", () => {
  const frame = { time: 0, id: "abc" };
  const origin = "https://cube.example";

  it("leaves the tile to MapLibre in the template", () => {
    expect(radarTileTemplate(origin, frame)).toBe("https://cube.example/api/radar/tiles/abc/{z}/{x}/{y}.png");
  });

  it("asks cube for each tile by frame, zoom, column and row", () => {
    expect(radarUrl(origin, frame, { x: 20, y: 44, left: 0, top: 0 }, ZOOM)).toBe(
      "https://cube.example/api/radar/tiles/abc/7/20/44.png",
    );
  });
});

describe("frameDelay", () => {
  it("holds the newest frame for the pause as well", () => {
    expect(frameDelay(0, 3, 0.2, 0.5)).toBe(200);
    expect(frameDelay(2, 3, 0.2, 0.5)).toBe(700);
  });
});
