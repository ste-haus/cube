const FIRST_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
const BACKOFF = 2;

/**
 * Keeps trying, forever, with a widening gap.
 *
 * Nothing on a wall panel gets reloaded by hand. A fetch that fails once — most often because
 * the screen booted faster than the server behind it — has to be able to come good on its own,
 * or the panel stays broken until somebody notices it and power-cycles the tablet.
 */
export function keepTrying<T>(attempt: () => Promise<T>, onResult: (value: T) => void): () => void {
  let delay = FIRST_DELAY_MS;
  let timer: number | null = null;
  let stopped = false;

  const run = () => {
    attempt()
      .then((value) => {
        if (stopped) {
          return;
        }

        delay = FIRST_DELAY_MS;
        onResult(value);
      })
      .catch(() => {
        if (stopped) {
          return;
        }

        timer = window.setTimeout(run, delay);
        delay = Math.min(delay * BACKOFF, MAX_DELAY_MS);
      });
  };

  run();

  return () => {
    stopped = true;
    if (timer !== null) {
      window.clearTimeout(timer);
    }
  };
}
