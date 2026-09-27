/**
 * The bars announcement overlay, entered the way every style is: its stylesheet and its script
 * come in through here, and Vite builds the page like the rest.
 *
 * The drawing itself is vendored and kept as it arrived. It is a classic script, one that assigns
 * a variable it never declares, so it cannot run as a module; it is brought in as text instead and
 * run as a classic script, unchanged. It sets up on the page's load, which this runs ahead of.
 *
 * It draws nothing at all in silence, so the bars would vanish the moment the sound stops and
 * leave the overlay blank while it lingers. Ahead of it, the analyser's readings are given a faint
 * floor of noise that wanders from frame to frame: buried under any real sound, and all that
 * shows when there is none.
 *
 * Its own colours are magenta and grey. Straight after it, a second classic script repaints them
 * in the palette every style shares, worked out from the page's `?color=` like the rest: the
 * reference colour for loud bars and the resting colour for quiet ones.
 */

import { tints } from "../shared/tint";
import vendored from "./visualizer.js?raw";
import "./style.css";

const COLOR_PARAM = "color";
// The vendored script's own threshold, in its scale of up to 255 × 2.5, above which a bar is loud.
const LOUD_BUCKET = 165;
const QUIET_BUCKET = 0;

// The noise floor, in the analyser's byte scale of 0 to 255, and how far it moves toward a fresh
// random level each frame, so it drifts rather than flickers.
const NOISE_CEILING = 12;
const NOISE_EASING = 0.15;

let noise = new Float32Array(0);
const read = AnalyserNode.prototype.getByteFrequencyData;

AnalyserNode.prototype.getByteFrequencyData = function (this: AnalyserNode, array: Uint8Array<ArrayBuffer>): void {
  read.call(this, array);

  if (noise.length !== array.length) {
    noise = new Float32Array(array.length);
  }

  for (let bin = 0; bin < array.length; bin++) {
    noise[bin] += (Math.random() * NOISE_CEILING - noise[bin]) * NOISE_EASING;
    array[bin] = Math.max(array[bin], Math.round(noise[bin]));
  }
};

const palette = tints(new URLSearchParams(window.location.search).get(COLOR_PARAM));
const colors = { [LOUD_BUCKET]: palette.body, [QUIET_BUCKET]: palette.rest };

// `CONFIG` is a top-level constant of the vendored script, so a later classic script sees it; the
// binding is fixed but the object it holds is not.
for (const source of [vendored, `CONFIG.colors = ${JSON.stringify(colors)};`]) {
  const script = document.createElement("script");
  script.textContent = source;
  document.body.appendChild(script);
}
