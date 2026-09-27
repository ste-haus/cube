/**
 * Dev only: sends a demo page to the front page with its visualizer standing in an announcement,
 * so a style is seen where it will be used, over the dashboard. Which style comes from the page's
 * own `data-visualizer-style`; see `web/src/lib/visualizerDemo.ts` for what the front page does
 * with it.
 */

const FRONT_PAGE = "/";
const DEMO_PARAM = "visualizerDemo";

const style = document.documentElement.dataset.visualizerStyle;
if (style) {
  const target = new URL(FRONT_PAGE, window.location.origin);
  target.searchParams.set(DEMO_PARAM, style);

  window.location.replace(target);
}
