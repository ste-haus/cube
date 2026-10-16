/*
 * Air coming off the thermostat while its equipment runs: crests that leave the open side of its
 * oval one after another, travel out from it, and fade, several out at once.
 *
 * A crest starts on the oval's outline, following its curve, and grows wavier as it travels: its
 * shape is a few ripples of different lengths laid over one another, each drifting along it at its
 * own pace, and no two crests are drawn alike, so the line reads as air carried off the card
 * rather than a ring drawn round it. It only goes off the side facing into the screen, never back
 * towards the edge the card hangs from.
 */

/** The oval a crest comes off: its centre and its half-width and half-height, in the drawing's units. */
export interface Oval {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** One ripple along a crest: how far it pushes, how many fit along it, and where it starts and drifts. */
export interface Ripple {
  amplitude: number;
  count: number;
  phase: number;
  drift: number;
}

/** What makes one crest unlike the next, chosen when it leaves. */
export interface CrestCharacter {
  ripples: Ripple[];
  /** How far round from straight out its middle is, in radians. */
  lean: number;
  /** Its reach round the oval, against the usual. */
  breadth: number;
}

export interface CrestShape {
  /** How far through its life, from leaving the oval at 0 to gone at 1. */
  progress: number;
  /** How far out it has travelled by the end of its life, in the drawing's units. */
  travel: number;
  /** How far either side of its middle the crest reaches round the oval, in radians. */
  halfAngle: number;
  /** How much its ripples push it in and out once fully grown, in the drawing's units. */
  amplitude: number;
  character: CrestCharacter;
}

const SAMPLES = 32;
const FULL_TURN = 2 * Math.PI;
const DECIMALS = 1;
// A crest spreads a little as it travels, as air does, rather than keeping the oval's reach.
const SPREAD = 0.4;
// Its ripples grow in over the first part of its life, so it leaves as the outline.
const RIPPLE_GROWTH = 0.35;
// It comes up quickly and fades over the rest of its life, faster at first than at the end.
const ARRIVE = 0.15;
const FADE = 2;

// What each crest's character is drawn from: a long ripple, a middling one and a short one, the
// shorter the weaker, each as strong as somewhere in its range and as many along the crest.
const RIPPLE_SHARES = [1, 0.55, 0.3];
const RIPPLE_STRENGTH: [number, number] = [0.6, 1];
const RIPPLE_COUNTS: [number, number][] = [
  [1, 2],
  [2.5, 4],
  [5, 7],
];
const RIPPLE_DRIFT = Math.PI * 1.5;
const MAX_LEAN = Math.PI / 14;
const BREADTH: [number, number] = [0.8, 1.15];

function between(random: () => number, [low, high]: [number, number]): number {
  return low + (high - low) * random();
}

/** A crest's own character, drawn at random so no two leave alike. */
export function crestCharacter(random: () => number = Math.random): CrestCharacter {
  const ripples = RIPPLE_SHARES.map((share, index) => ({
    amplitude: share * between(random, RIPPLE_STRENGTH),
    count: between(random, RIPPLE_COUNTS[index]),
    phase: between(random, [0, FULL_TURN]),
    drift: between(random, [-RIPPLE_DRIFT, RIPPLE_DRIFT]),
  }));
  const total = ripples.reduce((sum, ripple) => sum + ripple.amplitude, 0);

  return {
    ripples: ripples.map((ripple) => ({ ...ripple, amplitude: ripple.amplitude / total })),
    lean: between(random, [-MAX_LEAN, MAX_LEAN]),
    breadth: between(random, BREADTH),
  };
}

/** The crest as an SVG path, opening to the right of the oval's centre and never inside the oval. */
export function crestPath(oval: Oval, crest: CrestShape): string {
  const { progress, character } = crest;
  const out = crest.travel * progress;
  const grown = crest.amplitude * Math.min(1, progress / RIPPLE_GROWTH);
  const reach = crest.halfAngle * character.breadth * (1 + SPREAD * progress);
  const points: string[] = [];

  for (let index = 0; index <= SAMPLES; index++) {
    const along = index / SAMPLES;
    const angle = character.lean - reach + 2 * reach * along;
    const ripple = character.ripples.reduce(
      (sum, wave) =>
        sum + wave.amplitude * Math.sin(FULL_TURN * wave.count * along + wave.phase + wave.drift * progress),
      0,
    );
    const offset = Math.max(0, out + grown * ripple);
    const x = oval.cx + (oval.rx + offset) * Math.cos(angle);
    const y = oval.cy + (oval.ry + offset) * Math.sin(angle);

    points.push(`${index === 0 ? "M" : "L"}${x.toFixed(DECIMALS)} ${y.toFixed(DECIMALS)}`);
  }

  return points.join(" ");
}

/** How strongly the crest shows: up quickly as it leaves, then fading to nothing. */
export function crestOpacity(progress: number): number {
  if (progress <= 0 || progress >= 1) {
    return 0;
  }

  return Math.min(1, progress / ARRIVE) * (1 - progress) ** FADE;
}
