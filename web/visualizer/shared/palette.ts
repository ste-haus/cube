/**
 * The colours the drawn styles share, worked out from the reference colour the page is handed as
 * `?color=`, or from the shipped blue without one; see ./tint.ts. They are screened over the
 * panel, so black adds nothing and every colour here is light; fading means dimming toward black.
 */

import { Color } from "three";

import { tints, type Rgb } from "./tint";

const COLOR_PARAM = "color";
const CHANNEL_MAX = 255;

export const TINTS = tints(new URLSearchParams(window.location.search).get(COLOR_PARAM));

function color([red, green, blue]: Rgb): Color {
  return new Color().setRGB(red / CHANNEL_MAX, green / CHANNEL_MAX, blue / CHANNEL_MAX, "srgb");
}

export const NOTHING = new Color(0x000000);

// Lines: dim at rest, near white where they stand tall.
export const LINE_REST = color(TINTS.rest);
export const LINE_PEAK = color(TINTS.peak);

// The glow a line trails: near white at the line, the reference colour as it falls off.
export const GLOW_CORE = color(TINTS.peak);
export const GLOW_BODY = color(TINTS.body);
