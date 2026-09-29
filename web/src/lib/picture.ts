/*
 * Where a picture actually is inside the frame showing it.
 *
 * A camera frame scales its picture down whole (`object-fit: contain`), so the element's box
 * and the picture's differ by whatever bars the fit leaves. Anything that wants to start from
 * the picture itself, rather than from the box it is letterboxed in, measures it here.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

// The shape a camera is assumed to be before its first frame has said otherwise.
export const DEFAULT_RATIO = 16 / 9;

const CENTRED = 0.5;
const PERCENT = 100;
const PERCENT_SUFFIX = "%";

/** Width over height, or the usual camera's shape for a picture that has not arrived. */
export function ratioOf(natural: Size): number {
  return natural.width > 0 && natural.height > 0 ? natural.width / natural.height : DEFAULT_RATIO;
}

/** One `object-position` coordinate as a share of the slack, taking anything but a percentage as centred. */
function share(value: string | undefined): number {
  if (!value?.endsWith(PERCENT_SUFFIX)) {
    return CENTRED;
  }

  const parsed = parseFloat(value);

  return Number.isFinite(parsed) ? parsed / PERCENT : CENTRED;
}

/**
 * The picture's box within a frame's, given the picture's own size and the frame's computed
 * `object-position` (which a browser always reports as two lengths or percentages). A picture
 * with no size yet is taken to fill the frame.
 */
export function containedBox(frame: Box, natural: Size, position: string): Box {
  if (natural.width <= 0 || natural.height <= 0) {
    return frame;
  }

  const scale = Math.min(frame.width / natural.width, frame.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  const [x, y] = position.trim().split(/\s+/);

  return {
    left: frame.left + (frame.width - width) * share(x),
    top: frame.top + (frame.height - height) * share(y),
    width,
    height,
  };
}
