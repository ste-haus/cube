/**
 * The colours the drawn styles share. They are screened over the panel, so black adds nothing and
 * every colour here is light; fading means dimming toward black.
 */

import { Color } from "three";

export const NOTHING = new Color(0x000000);

// Lines: dim blue at rest, white-blue where they stand tall.
export const LINE_REST = new Color(0x2c4a6e);
export const LINE_PEAK = new Color(0xdff0ff);

// The glow a line trails: white-blue at the line, blue as it falls off.
export const GLOW_CORE = new Color(0xdff0ff);
export const GLOW_BODY = new Color(0x3d8bdc);
