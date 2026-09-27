/**
 * The visualizer demo: a button on the front page that plays a clip through the overlay the way
 * an announcement would, for seeing a style without one. It is there only when the config turns
 * on `visualizer.demo`, and the clip is the one it names in the resources directory. While it is
 * on, `?visualizerDemo=<style>` on the front page's address picks which style the button plays.
 */

import type { Visualizer, VisualizerStyle } from "../../src/lib/types";

const DEMO_PARAM = "visualizerDemo";
const STYLES: VisualizerStyle[] = ["bars", "ridgeline", "corona"];
const MILLISECONDS = 1000;

/** Where the backend serves the configured clip, and only while the demo is on. */
export const DEMO_CLIP = "/api/visualizer/demo-clip";

/** The style the demo plays, or nothing when the demo is off. */
export function demoStyle(visualizer: Visualizer): VisualizerStyle | null {
  if (!visualizer.demo) {
    return null;
  }

  const requested = new URLSearchParams(window.location.search).get(DEMO_PARAM);

  return STYLES.find(style => style === requested) ?? visualizer.style;
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
