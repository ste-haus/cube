/**
 * How far round a ring style has turned. It starts somewhere round at random, so no two
 * announcements begin in the same place, and turns slowly clockwise from there unless the page is
 * handed `?rotate=false`.
 */

const ROTATE_PARAM = "rotate";
const FALSY = ["false", "f", "0"];
// Once round every this many seconds.
const TURN_SECONDS = 60;
const FULL_TURN = Math.PI * 2;

const START = Math.random();
const ROTATING = !FALSY.includes(new URLSearchParams(window.location.search).get(ROTATE_PARAM) ?? "");

/** The ring's turn about the axis the view looks down, in radians; clockwise is negative. */
export function turned(seconds: number): number {
  const turns = ROTATING ? seconds / TURN_SECONDS : 0;

  return -((START + turns) % 1) * FULL_TURN;
}
