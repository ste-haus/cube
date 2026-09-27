/**
 * Dev only: stands in an announcement for the visualizer on the front page, so a style can be
 * watched over the dashboard without Home Assistant playing anything. `?visualizerDemo=<style>`
 * on the dashboard's address turns it on. Everything here sits behind `import.meta.env.DEV`, so a
 * production build drops it.
 */

import { DEMO_CLIP } from "../visualizerDemo/clip";
import type { VisualizerStyle } from "./types";

// Set by the demo pages under web/visualizer/demo/; see web/src/visualizerDemo/open.ts.
const DEMO_PARAM = "visualizerDemo";
const STYLES: VisualizerStyle[] = ["bars", "ridgeline"];
const MILLISECONDS = 1000;

export { DEMO_CLIP };

/** The style the demo was asked for, or nothing outside a dev server or without the parameter. */
export function demoStyle(): VisualizerStyle | null {
  if (!import.meta.env.DEV) {
    return null;
  }

  const requested = new URLSearchParams(window.location.search).get(DEMO_PARAM);

  return STYLES.find(style => style === requested) ?? null;
}

/** How long the demo clip runs, so the stand-in announcement ends when the sound does. */
export function clipLength(): Promise<number> {
  const audio = new Audio();
  audio.preload = "metadata";

  return new Promise((resolve, reject) => {
    audio.addEventListener("loadedmetadata", () => resolve(audio.duration * MILLISECONDS), { once: true });
    audio.addEventListener("error", () => reject(new Error(`Could not load ${DEMO_CLIP}`)), { once: true });
    audio.src = DEMO_CLIP;
  });
}
