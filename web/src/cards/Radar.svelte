<script lang="ts">
  import "maplibre-gl/dist/maplibre-gl.css";
  import type { Map as VectorMap } from "maplibre-gl";
  import { untrack } from "svelte";
  import { faceVisibility } from "../lib/cube.svelte";
  import {
    fetchRadarFrames,
    firstLabelLayer,
    frameDelay,
    frameLayerId,
    MAP_STYLE_URL,
    mapZoom,
    project,
    radarTileTemplate,
    radarUrl,
    ringRadius,
    TILE_SIZE,
    tilesAround,
    withQuietHighways,
    type RadarFrames,
    type Tile,
  } from "../lib/radar";
  import { ha } from "../lib/state.svelte";
  import type { Radar, Weather } from "../lib/types";

  /*
   * The last couple of hours of rain, looped over a dark map of the country round home.
   *
   * The map is OpenStreetMap's, drawn by MapLibre from VersaTiles' vector tiles, with one layer of
   * rain per frame slotted in under the place names so they read through it; only the current
   * frame is opaque. Range rings and home sit over the top. Without WebGL2, or without the map's
   * style, there is no map, and the rain is laid out as plain tiles on dark ground instead — less
   * to go on, but nothing stamped across it.
   *
   * The frames are fetched and the loop runs only while the face is being looked at. The map is
   * never touchable, so a swipe across it turns the cube.
   *
   * Credits live in a footer along the foot, which fades up under a pointer — or a tap, on a
   * touchscreen — and is never dismissed for good.
   */

  /* RainViewer adds a frame every ten minutes. */
  const REFRESH_MS = 10 * 60 * 1000;

  const LATITUDE_ATTRIBUTE = "latitude";
  const LONGITUDE_ATTRIBUTE = "longitude";
  const HALF = 0.5;

  const RAIN_OPACITY = 0.8;
  const HIDDEN = 0;
  const RASTER = "raster";
  const OPACITY_PROPERTY = "raster-opacity";
  const FADE_PROPERTY = "raster-fade-duration";
  const HIGHWAY_COLOR_TOKEN = "--radar-highway-color";
  const HIGHWAY_OUTLINE_COLOR_TOKEN = "--radar-highway-outline-color";

  const WEBGL2 = "webgl2";
  const LOSE_CONTEXT_EXTENSION = "WEBGL_lose_context";

  const MAP_CREDITS = ["© OpenStreetMap contributors", "Style © VersaTiles"];
  const RADAR_CREDIT = "Radar © RainViewer";
  const CREDIT_SEPARATOR = " · ";

  let { radar, weather }: { radar: Radar; weather: Weather } = $props();

  const visibility = faceVisibility();

  function supportsWebGL2(): boolean {
    try {
      const context = document.createElement("canvas").getContext(WEBGL2);

      // A page gets only a handful of drawing contexts, so the probe hands its own straight back.
      context?.getExtension(LOSE_CONTEXT_EXTENSION)?.loseContext();

      return context !== null;
    } catch {
      return false;
    }
  }

  let width = $state(0);
  let height = $state(0);
  let loaded = $state<RadarFrames | null>(null);
  let current = $state(0);

  /* Given up for good if the browser takes the drawing context back, which it does to the oldest
   * once too many are open; the plain tiles need none. */
  let vector = $state(supportsWebGL2());
  let container = $state<HTMLDivElement | null>(null);
  let map = $state.raw<VectorMap | null>(null);
  let frameIds = $state<string[]>([]);

  const latitude = $derived(ha.attribute<number>(weather.zone_entity_id, LATITUDE_ATTRIBUTE));
  const longitude = $derived(ha.attribute<number>(weather.zone_entity_id, LONGITUDE_ATTRIBUTE));

  const centre = $derived(latitude !== null && longitude !== null ? project(latitude, longitude, radar.zoom) : null);
  const tiles = $derived(centre && width > 0 && height > 0 ? tilesAround(centre, radar.zoom, width, height) : []);
  const rings = $derived(
    latitude === null ? [] : radar.rings.map((distance) => ringRadius(distance, radar.ring_unit, latitude, radar.zoom)),
  );

  const count = $derived(loaded?.frames.length ?? 0);
  const shown = $derived(count > 0 ? current % count : 0);

  const credits = $derived([...(vector ? MAP_CREDITS : []), RADAR_CREDIT].join(CREDIT_SEPARATOR));

  function key(tile: Tile): string {
    return `${tile.left},${tile.top}`;
  }

  /* The map, built once there is somewhere to put it and somewhere to centre it. MapLibre is a
   * sizeable library and loads only here, the first time a radar is on screen. */
  $effect(() => {
    const element = container;
    if (!vector || element === null || latitude === null || longitude === null) {
      return;
    }

    const home: [number, number] = [longitude, latitude];
    let created: VectorMap | null = null;
    let disposed = false;

    Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url")])
      .then(([{ Map: VectorMapClass, setWorkerUrl }, { default: workerUrl }]) => {
        if (disposed) {
          return;
        }

        // MapLibre looks for its worker beside its own module unless told otherwise, and that
        // address does not survive bundling. Vite builds the worker into a file of its own and
        // says where it put it.
        setWorkerUrl(workerUrl);

        created = new VectorMapClass({
          container: element,
          center: home,
          zoom: mapZoom(radar.zoom),
          interactive: false,
          attributionControl: false,
          fadeDuration: 0,
        });

        // The style draws its highways in orange, the loudest colour on the face and close to the
        // rain's own, so they are greyed to the panel's palette as the style arrives, before any of
        // it is drawn. The road numbers and the edging under a bridge are left as they are.
        const styles = getComputedStyle(element);
        const line = styles.getPropertyValue(HIGHWAY_COLOR_TOKEN).trim();
        const outline = styles.getPropertyValue(HIGHWAY_OUTLINE_COLOR_TOKEN).trim();
        created.setStyle(MAP_STYLE_URL, {
          transformStyle: (_previous, next) => (line && outline ? withQuietHighways(next, line, outline) : next),
        });

        const ready = created;
        ready.on("load", () => {
          map = ready;
        });

        // An error before the style has arrived is the style failing to, and then no map is ever
        // drawn, so the rain goes on plain ground instead. After it, the error is a tile or an
        // icon, and the map carries on without it.
        let styled = false;
        ready.once("styledata", () => {
          styled = true;
        });
        ready.on("error", () => {
          if (!styled) {
            vector = false;
          }
        });
        ready.on("webglcontextlost", () => {
          vector = false;
        });
      })
      .catch(() => {
        vector = false;
      });

    return () => {
      disposed = true;
      map = null;
      frameIds = [];
      created?.remove();
    };
  });

  function syncFrames(target: VectorMap, frames: RadarFrames): void {
    const wanted = frames.frames.map(frameLayerId);

    for (const id of frameIds) {
      if (!wanted.includes(id)) {
        target.removeLayer(id);
        target.removeSource(id);
      }
    }

    const beneath = firstLabelLayer(target.getStyle().layers);

    frames.frames.forEach((frame, index) => {
      const id = wanted[index];
      if (target.getSource(id)) {
        return;
      }

      // Tiles past the radar's zoom are RainViewer's placeholder, so the map enlarges the closest real ones.
      target.addSource(id, {
        type: RASTER,
        tiles: [radarTileTemplate(frames.host, frame)],
        tileSize: TILE_SIZE,
        maxzoom: radar.zoom,
      });
      target.addLayer({ id, type: RASTER, source: id, paint: { [OPACITY_PROPERTY]: HIDDEN, [FADE_PROPERTY]: 0 } }, beneath);
    });

    frameIds = wanted;
  }

  $effect(() => {
    const target = map;
    const frames = loaded;
    if (target === null || frames === null) {
      return;
    }

    untrack(() => syncFrames(target, frames));
  });

  $effect(() => {
    const target = map;
    if (target === null) {
      return;
    }

    frameIds.forEach((id, index) => {
      target.setPaintProperty(id, OPACITY_PROPERTY, index === shown ? RAIN_OPACITY : HIDDEN);
    });
  });

  /* A face turned away is not drawn at all, so the map is told its size again on the way back. */
  $effect(() => {
    if (map !== null && visibility.showing && width > 0 && height > 0) {
      map.resize();
    }
  });

  $effect(() => {
    if (!visibility.showing) {
      return;
    }

    let cancelled = false;

    const load = () =>
      fetchRadarFrames()
        .then((frames) => {
          if (!cancelled) {
            loaded = frames;
          }
        })
        .catch(() => {
          // Old rain is better than no map; the next refresh tries again.
        });

    load();
    const timer = window.setInterval(load, REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  });

  $effect(() => {
    if (!visibility.showing || count === 0) {
      return;
    }

    const frames = count;
    let timer = 0;

    const advance = () => {
      current = (current + 1) % frames;
      timer = window.setTimeout(advance, frameDelay(current, frames, radar.frame_seconds, radar.pause_seconds));
    };

    // Read without subscribing, or every step of the loop would tear the loop down and start it again.
    const from = untrack(() => current) % frames;
    timer = window.setTimeout(advance, frameDelay(from, frames, radar.frame_seconds, radar.pause_seconds));

    return () => window.clearTimeout(timer);
  });
</script>

<div class="radar" bind:clientWidth={width} bind:clientHeight={height}>
  {#if vector}
    <div class="radar__layer radar__map" bind:this={container}></div>
  {:else if loaded}
    {#each loaded.frames as frame, index (frame.time)}
      <div class="radar__layer radar__rain" class:radar__rain--showing={index === shown}>
        {#each tiles as tile (key(tile))}
          <img
            class="radar__tile"
            src={radarUrl(loaded.host, frame, tile, radar.zoom)}
            style:left="{tile.left}px"
            style:top="{tile.top}px"
            alt=""
          />
        {/each}
      </div>
    {/each}
  {/if}

  {#if centre}
    <svg class="radar__layer" viewBox="0 0 {width} {height}" aria-hidden="true">
      {#each rings as radius (radius)}
        <circle class="radar__ring" cx={width * HALF} cy={height * HALF} r={radius} />
      {/each}
    </svg>

    <span class="radar__home"></span>
  {/if}

  <footer class="radar__credits">{credits}</footer>
</div>

<style>
  .radar {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background-color: var(--color-background);
  }

  .radar__layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  /* Never touched, so a gesture that starts on the map is the cube's. */
  .radar__map {
    pointer-events: none;
  }

  .radar__tile {
    position: absolute;
    display: block;
    width: 256px;
    height: 256px;
    max-width: none;
  }

  /* Without the map, every frame is on the page at once so all of them are loaded before the
   * loop reaches them; only the current one is visible. */
  .radar__rain {
    opacity: 0;
  }

  .radar__rain--showing {
    opacity: 0.8;
  }

  .radar__ring {
    fill: none;
    stroke: var(--radar-ring-color);
    stroke-width: 1;
    stroke-dasharray: 4 4;
  }

  .radar__home {
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--radar-home-size);
    height: var(--radar-home-size);
    border: 2px solid var(--color-background);
    border-radius: 50%;
    background-color: var(--radar-home-color);
    transform: translate(-50%, -50%);
  }

  .radar__credits {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 2.2rem 0.9rem 0.55rem;
    background: linear-gradient(to bottom, transparent, var(--credits-gradient-end));
    color: var(--color-muted);
    font-size: var(--radar-credits-size);
    text-align: right;
    opacity: 0;
    transition: opacity 300ms ease;
    pointer-events: none;
  }

  .radar:hover .radar__credits {
    opacity: 1;
  }
</style>
