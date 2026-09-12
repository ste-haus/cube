/**
 * The radar's geometry and where its pictures come from.
 *
 * The map beneath the rain is OpenStreetMap's own vector map, drawn by MapLibre in the dark
 * style OpenStreetMap hosts, so it needs no key and matches Home Assistant's own maps. Where
 * there is no WebGL2 to draw it with, the rain is laid out as plain tiles on dark ground instead,
 * which is what the tile arithmetic here is for; the ring arithmetic serves both.
 *
 * Everything is Web Mercator.
 */

import type { DistanceUnit } from "./types";

export const TILE_SIZE = 256;

const HALF_CIRCLE_DEGREES = 180;
const FULL_CIRCLE_DEGREES = 360;
const HALF = 0.5;
const MERCATOR_DIVISOR = 4 * Math.PI;
const EQUATOR_METRES = 40075016.686;
const MS_PER_SECOND = 1000;

const METRES_PER: Record<DistanceUnit, number> = {
  mi: 1609.344,
  km: 1000,
};

/* MapLibre counts zoom in 512-pixel tiles and raster tile servers in 256-pixel ones, so the same
 * scale on the ground is one zoom level lower on the map. */
const VECTOR_ZOOM_OFFSET = 1;

export const MAP_STYLE_URL = "https://vector.openstreetmap.org/styles/shortbread/eclipse.json";
const LABEL_LAYER_TYPE = "symbol";
const FRAME_LAYER_PREFIX = "radar-";

const RAINVIEWER_MAPS_URL = "https://api.rainviewer.com/public/weather-maps.json";
/* RainViewer's "Universal Blue", smoothed and without snow, as the dashboard's radar card asks. */
const RADAR_COLOR_SCHEME = 2;
const RADAR_OPTIONS = "1_0";

const ZOOM_PLACEHOLDER = "{z}";
const X_PLACEHOLDER = "{x}";
const Y_PLACEHOLDER = "{y}";

/** A point on the whole world's map at some zoom, in pixels from its top left. */
export interface Pixel {
  x: number;
  y: number;
}

/** A tile to draw, and where its top left corner falls in the box, in pixels. */
export interface Tile {
  x: number;
  y: number;
  left: number;
  top: number;
}

export interface RadarFrame {
  time: number;
  path: string;
}

export interface RadarFrames {
  host: string;
  frames: RadarFrame[];
}

export function project(latitude: number, longitude: number, zoom: number): Pixel {
  const world = TILE_SIZE * 2 ** zoom;
  const sine = Math.sin((latitude * Math.PI) / HALF_CIRCLE_DEGREES);

  return {
    x: ((longitude + HALF_CIRCLE_DEGREES) / FULL_CIRCLE_DEGREES) * world,
    y: (HALF - Math.log((1 + sine) / (1 - sine)) / MERCATOR_DIVISOR) * world,
  };
}

/**
 * The tiles covering a `width` by `height` box centred on `centre`.
 *
 * Columns wrap round the antimeridian, because the world does; rows past either pole are left out,
 * because there is nothing there to draw.
 */
export function tilesAround(centre: Pixel, zoom: number, width: number, height: number): Tile[] {
  const count = 2 ** zoom;
  const left = centre.x - width * HALF;
  const top = centre.y - height * HALF;

  const tiles: Tile[] = [];
  for (let row = Math.floor(top / TILE_SIZE); row * TILE_SIZE < top + height; row += 1) {
    if (row < 0 || row >= count) {
      continue;
    }

    for (let column = Math.floor(left / TILE_SIZE); column * TILE_SIZE < left + width; column += 1) {
      tiles.push({
        x: ((column % count) + count) % count,
        y: row,
        left: column * TILE_SIZE - left,
        top: row * TILE_SIZE - top,
      });
    }
  }

  return tiles;
}

export function metresPerPixel(latitude: number, zoom: number): number {
  return (EQUATOR_METRES * Math.cos((latitude * Math.PI) / HALF_CIRCLE_DEGREES)) / (TILE_SIZE * 2 ** zoom);
}

/** How many pixels out from home a distance falls, at this latitude and zoom. */
export function ringRadius(distance: number, unit: DistanceUnit, latitude: number, zoom: number): number {
  return (distance * METRES_PER[unit]) / metresPerPixel(latitude, zoom);
}

/** The vector map's zoom for a radar zoom, so the two draw the ground at the same scale. */
export function mapZoom(zoom: number): number {
  return zoom - VECTOR_ZOOM_OFFSET;
}

/** The style's first layer of labels, which the rain goes under so the names read through it. */
export function firstLabelLayer(layers: { id: string; type: string }[]): string | undefined {
  return layers.find((layer) => layer.type === LABEL_LAYER_TYPE)?.id;
}

/* The style draws its highways in orange: the outlines round motorways, trunk roads, and primary
 * and secondary roads, and the motorways themselves. The other roads' lines are not orange, and
 * the dark edging under a bridge is not an outline, so both are left out. */
const HIGHWAY_CLASSES = ["-motorway", "-trunk", "-primary", "-secondary"];
const ORANGE_LINE_CLASS = "-motorway";
const OUTLINE_SUFFIX = ":outline";
const BRIDGE_EDGE_SUFFIX = ":bridge";
const LINE_LAYER_TYPE = "line";

/** The style's orange highway lines, and which of them are the outlines drawn round the rest. */
export function highwayLayers(layers: { id: string; type: string }[]): { id: string; outline: boolean }[] {
  return layers.flatMap((layer) => {
    if (layer.type !== LINE_LAYER_TYPE || layer.id.endsWith(BRIDGE_EDGE_SUFFIX)) {
      return [];
    }

    const outline = layer.id.endsWith(OUTLINE_SUFFIX);
    const orange = outline
      ? HIGHWAY_CLASSES.some((kind) => layer.id.includes(kind))
      : layer.id.includes(ORANGE_LINE_CLASS);

    return orange ? [{ id: layer.id, outline }] : [];
  });
}

const LINE_COLOR_PROPERTY = "line-color";

type StyleLayer = { id: string; type: string; paint?: Record<string, unknown> };

/** A style with its orange highways greyed, the lines to one colour and their outlines to another. */
export function withQuietHighways<Style extends { layers: StyleLayer[] }>(
  style: Style,
  line: string,
  outline: string,
): Style {
  const colours = new Map(highwayLayers(style.layers).map((layer) => [layer.id, layer.outline ? outline : line]));

  return {
    ...style,
    layers: style.layers.map((layer) => {
      const colour = colours.get(layer.id);

      return colour === undefined ? layer : { ...layer, paint: { ...layer.paint, [LINE_COLOR_PROPERTY]: colour } };
    }),
  } as Style;
}

export function frameLayerId(frame: RadarFrame): string {
  return `${FRAME_LAYER_PREFIX}${frame.time}`;
}

/** A frame's tile address with the tile left as placeholders, which is the form MapLibre takes. */
export function radarTileTemplate(host: string, frame: RadarFrame): string {
  return `${host}${frame.path}/${TILE_SIZE}/${ZOOM_PLACEHOLDER}/${X_PLACEHOLDER}/${Y_PLACEHOLDER}/${RADAR_COLOR_SCHEME}/${RADAR_OPTIONS}.png`;
}

export function radarUrl(host: string, frame: RadarFrame, tile: Tile, zoom: number): string {
  return radarTileTemplate(host, frame)
    .replace(ZOOM_PLACEHOLDER, String(zoom))
    .replace(X_PLACEHOLDER, String(tile.x))
    .replace(Y_PLACEHOLDER, String(tile.y));
}

/** The radar frames RainViewer has now: the last couple of hours, oldest first. */
export async function fetchRadarFrames(): Promise<RadarFrames> {
  const response = await fetch(RAINVIEWER_MAPS_URL);
  if (!response.ok) {
    throw new Error(`Could not load radar frames: ${response.status}`);
  }

  const body = await response.json();

  return { host: body.host, frames: body.radar?.past ?? [] };
}

/** How long a frame shows before the next. The newest holds for the pause as well, so the loop has an end. */
export function frameDelay(index: number, count: number, frameSeconds: number, pauseSeconds: number): number {
  const newest = index === count - 1;

  return (frameSeconds + (newest ? pauseSeconds : 0)) * MS_PER_SECOND;
}
