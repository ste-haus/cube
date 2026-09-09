import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import customProperties from "postcss-custom-properties";

const API_PREFIX = "/api";
const BACKEND_ORIGIN = "http://127.0.0.1:4096";

/*
 * Every declaration written against a custom property is emitted twice: the resolved value
 * first, then the var() itself.
 *
 * A panel is whatever browser is bolted to the wall, not one we get to choose, and at least
 * one of them resolves var() in ordinary properties but not in SVG fill and stroke. The
 * floorplan is painted almost entirely through those two, so on that panel the drawing fell
 * back to the colours Illustrator left in it: white walls, a white fence, a yellow room.
 *
 * `preserve` keeps the var() in place, so the palette is still a runtime knob everywhere it
 * works; the static value beneath it is only ever reached by an engine that dropped the
 * declaration anyway.
 */
const cssFallbacks = customProperties({ preserve: true });

export default defineConfig({
  plugins: [svelte()],
  css: {
    postcss: {
      plugins: [cssFallbacks],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      [API_PREFIX]: {
        target: BACKEND_ORIGIN,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
