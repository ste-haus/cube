/**
 * Fold an analyser's frequency bins into bands. Spaced evenly, a voice's harmonics stand apart
 * as spikes all the way up; `warp` above one gives the low end, where most of a voice is, a
 * little more of the row without smearing the top end into one slope the way a log scale does.
 */

const BYTE_MAX = 255;

export interface BandOptions {
  sampleRate: number;
  fftSize: number;
  lowestHz: number;
  highestHz: number;
  /** One spaces bands evenly; higher gives the low end more of them. */
  warp: number;
  /** Above one, quiet bands sink and loud ones stand out. */
  contrast: number;
}

export function bands(bins: Uint8Array, options: BandOptions, out: Float32Array): Float32Array {
  const { sampleRate, fftSize, lowestHz, highestHz, warp, contrast } = options;
  const binHz = sampleRate / fftSize;
  const span = highestHz - lowestHz;

  for (let band = 0; band < out.length; band++) {
    const low = lowestHz + span * (band / out.length) ** warp;
    const high = lowestHz + span * ((band + 1) / out.length) ** warp;

    const first = Math.min(Math.floor(low / binHz), bins.length - 1);
    const last = Math.min(Math.max(Math.ceil(high / binHz), first + 1), bins.length);

    // The loudest bin rather than the mean, so a harmonic stays a spike when a band spans several.
    let loudest = 0;
    for (let bin = first; bin < last; bin++) {
      loudest = Math.max(loudest, bins[bin]);
    }

    out[band] = (loudest / BYTE_MAX) ** contrast;
  }

  return out;
}
