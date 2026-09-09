import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const API_PREFIX = "/api";
const BACKEND_ORIGIN = "http://127.0.0.1:4096";

export default defineConfig({
  plugins: [svelte()],
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
