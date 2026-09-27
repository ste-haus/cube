/**
 * Hearing an announcement: the page is handed the audio's address as `?src=`, plays it through an
 * analyser, and reads it back as bands that follow the sound smoothly, quicker on the way up than
 * on the way down.
 */

import { bands, type BandOptions } from "./spectrum";

// Query parameters, shared by every style's page.
const SOURCE_PARAM = "src";
const MUTE_PARAM = "mute";
const LOOP_PARAM = "loop";
const TRUTHY = ["true", "t", "1"];
// A browser that will not start audio on its own starts it on the first of these.
const UNBLOCKING_EVENTS = ["pointerdown", "keydown"];

const FFT_SIZE = 2048;
const ANALYSER_SMOOTHING = 0.6;
// The loudness range the analyser spreads its bytes across. The default ceiling of -30 dB is
// reached by ordinary speech, which then pins most bands at full and leaves nothing to vary.
const MIN_DECIBELS = -90;
const MAX_DECIBELS = -22;

// How quickly the bands follow the sound: rising fast enough to catch a syllable's onset, falling
// slowly enough that they do not chatter.
const ATTACK_SECONDS = 0.04;
const RELEASE_SECONDS = 0.18;
const MILLISECONDS = 1000;

export type HearingOptions = Omit<BandOptions, "sampleRate" | "fftSize"> & { bandCount: number };

export interface Ear {
  /** The bands as they stand at `now`, low bands first; the same array every time. */
  hear(now: number): Float32Array;
}

/** An ear on the page's announcement, or nothing when the page was given none to play. */
export function listen(options: HearingOptions): Ear | null {
  const params = new URLSearchParams(window.location.search);
  const source = params.get(SOURCE_PARAM);

  if (!source) {
    return null;
  }

  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = ANALYSER_SMOOTHING;
  analyser.minDecibels = MIN_DECIBELS;
  analyser.maxDecibels = MAX_DECIBELS;

  const audio = new Audio();
  audio.crossOrigin = "anonymous";
  audio.src = source;
  audio.loop = TRUTHY.includes(params.get(LOOP_PARAM) ?? "");

  context.createMediaElementSource(audio).connect(analyser);

  // The speaker in the room is the one saying it; the panel only needs to hear it.
  if (!TRUTHY.includes(params.get(MUTE_PARAM) ?? "")) {
    analyser.connect(context.destination);
  }

  // A wall panel is set up to let pages play on their own. A desktop browser is not, and holds the
  // audio until the page is touched; trying again then costs a panel nothing.
  const begin = () => {
    context.resume();
    audio.play().catch(error => console.warn("Announcement would not play", error));
  };
  const unblock = () => {
    UNBLOCKING_EVENTS.forEach(event => window.removeEventListener(event, unblock));
    if (audio.paused) {
      begin();
    }
  };

  UNBLOCKING_EVENTS.forEach(event => window.addEventListener(event, unblock));
  begin();

  const { bandCount, ...shaping } = options;
  const banding = { ...shaping, sampleRate: context.sampleRate, fftSize: FFT_SIZE };
  const bins = new Uint8Array(analyser.frequencyBinCount);
  const heard = new Float32Array(bandCount);
  const followed = new Float32Array(bandCount);
  let last = performance.now();

  return {
    hear(now: number): Float32Array {
      analyser.getByteFrequencyData(bins);
      bands(bins, banding, heard);

      const elapsed = (now - last) / MILLISECONDS;
      last = now;
      const attack = 1 - Math.exp(-elapsed / ATTACK_SECONDS);
      const release = 1 - Math.exp(-elapsed / RELEASE_SECONDS);

      for (let band = 0; band < bandCount; band++) {
        const rate = heard[band] > followed[band] ? attack : release;
        followed[band] += (heard[band] - followed[band]) * rate;
      }

      return followed;
    },
  };
}
