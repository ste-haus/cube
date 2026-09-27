import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const API_PREFIX = "/api";
const BACKEND_ORIGIN = "http://127.0.0.1:4096";

// Pages built alongside the panel. The 3d overlay is one so three.js ships in the image rather
// than coming from a CDN a wall panel may not reach.
const PAGES = {
  index: "index.html",
  visualizerRidgeline: "visualizer/ridgeline/index.html",
};

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: PAGES,
    },
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
