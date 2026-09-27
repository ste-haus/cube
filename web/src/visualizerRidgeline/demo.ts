/**
 * A stand-in announcement for looking at the overlay without one: a few seconds of something
 * shaped like speech, written straight into an analyser's bins rather than played. A browser will
 * not start audio without a click, and a page that needs one cannot be tested by reloading it.
 *
 * It is built the way a voice is: a comb of harmonics over a drifting pitch, shaped by a few
 * resonances, falling off toward the top, over a floor of breath. Written as the bins an analyser
 * would hand over, so it goes through the same banding as the real thing.
 */

// Some rest first, so a reload shows the static before the sound arrives behind it.
const LEAD_IN_MS = 1000;
const SPEAKING_MS = 5000;

const SYLLABLE_SHORTEST_MS = 140;
const SYLLABLE_LONGEST_MS = 320;
const GAP_MS = 60;
// How much quieter than the loudest a syllable may be, in decibels.
const SYLLABLE_RANGE_DB = 12;

const PITCH_LOWEST_HZ = 110;
const PITCH_HIGHEST_HZ = 170;
const VIBRATO_HZ = 5;
const VIBRATO_DEPTH = 0.03;
const HARMONIC_WIDTH_HZ = 22;

const FORMANTS = [
  { lowestHz: 300, highestHz: 800, widthHz: 140 },
  { lowestHz: 900, highestHz: 2200, widthHz: 220 },
  { lowestHz: 2400, highestHz: 3100, widthHz: 300 },
];
// Each resonance quieter than the one below it, in decibels.
const FORMANT_STEP_DB = 8;
// The voice itself, before the resonances shape it: every harmonic carries this much on its own,
// so the pitch and the harmonics just above it stay strong the way they do in real speech.
const SOURCE_LEVEL = 0.5;
// Speech loses this much per octave above its pitch.
const TILT_DB_PER_OCTAVE = 6;
const BREATH_DB = -52;
const BREATH_JITTER_DB = 6;

// The analyser's defaults, which is the range its bytes are spread across.
const MIN_DB = -100;
const MAX_DB = -30;
// Where the loudest harmonic of the loudest syllable lands within that range.
const PEAK_DB = -34;
const BYTE_MAX = 255;
const MILLISECONDS = 1000;

interface Syllable {
  endsAt: number;
  gainDb: number;
  pitchHz: number;
  formantsHz: number[];
}

function decibels(amplitude: number): number {
  return 20 * Math.log10(Math.max(amplitude, Number.MIN_VALUE));
}

export class Voice {
  private readonly startedAt: number;
  private readonly random: () => number;
  private syllable: Syllable | null = null;

  constructor(startedAt: number, random: () => number = Math.random) {
    this.startedAt = startedAt;
    this.random = random;
  }

  /** Write this moment's spectrum into `bins`, as an analyser would, `binHz` apart. */
  hear(now: number, bins: Uint8Array, binHz: number): void {
    const elapsed = now - this.startedAt - LEAD_IN_MS;
    const speaking = elapsed >= 0 && elapsed < SPEAKING_MS;

    const syllable = speaking ? this.current(now) : null;
    const voiced = syllable !== null && now < syllable.endsAt - GAP_MS;

    if (!voiced) {
      bins.fill(0);

      return;
    }

    const vibrato = 1 + VIBRATO_DEPTH * Math.sin((now / MILLISECONDS) * Math.PI * 2 * VIBRATO_HZ);
    const pitch = syllable.pitchHz * vibrato;

    for (let bin = 0; bin < bins.length; bin++) {
      const hz = bin * binHz;

      const nearest = Math.max(Math.round(hz / pitch), 1);
      const offset = (hz - nearest * pitch) / HARMONIC_WIDTH_HZ;
      const harmonic = Math.exp(-offset * offset);

      let resonance = SOURCE_LEVEL;
      syllable.formantsHz.forEach((centre, index) => {
        const away = (hz - centre) / FORMANTS[index].widthHz;
        resonance += Math.exp(-away * away) * 10 ** ((-FORMANT_STEP_DB * index) / 20);
      });

      const tilt = -TILT_DB_PER_OCTAVE * Math.max(Math.log2(Math.max(hz, pitch) / pitch), 0);
      const voice = decibels(harmonic * resonance) + tilt;
      const breath = BREATH_DB + (this.random() * 2 - 1) * BREATH_JITTER_DB;

      const db = PEAK_DB + syllable.gainDb + Math.max(voice, breath);
      bins[bin] = Math.round(Math.min(Math.max((db - MIN_DB) / (MAX_DB - MIN_DB), 0), 1) * BYTE_MAX);
    }
  }

  private current(now: number): Syllable {
    if (this.syllable && now < this.syllable.endsAt) {
      return this.syllable;
    }

    const between = (low: number, high: number) => low + this.random() * (high - low);

    this.syllable = {
      endsAt: now + between(SYLLABLE_SHORTEST_MS, SYLLABLE_LONGEST_MS),
      gainDb: -this.random() * SYLLABLE_RANGE_DB,
      pitchHz: between(PITCH_LOWEST_HZ, PITCH_HIGHEST_HZ),
      formantsHz: FORMANTS.map(formant => between(formant.lowestHz, formant.highestHz)),
    };

    return this.syllable;
  }
}
