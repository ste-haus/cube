<script lang="ts">
  import { ha } from "../lib/state.svelte";
  import type { Visualizer, VisualizerStyle } from "../lib/types";
  import { clipLength, demoStyle, DEMO_CLIP } from "../../visualizer/demo/frontPage";

  const PLAYING = "playing";
  const SOURCE_PARAM = "src";
  const MUTE_PARAM = "mute";
  const CONTENT_PARAM = "content";
  const TRUE = "true";

  const VISUALIZER_PAGES: Record<VisualizerStyle, string> = {
    bars: "/visualizer/bars/index.html",
    ridgeline: "/visualizer/ridgeline/index.html",
  };
  // A backend older than the style setting sends none; it drew bars.
  const DEFAULT_STYLE: VisualizerStyle = "bars";
  const ANNOUNCEMENT_AUDIO_PATH = "/api/announcement/{entity_id}/audio";
  const ENTITY_PLACEHOLDER = "{entity_id}";

  /**
   * How each style comes and goes. Bars cover the panel and leave with the sound. The ridgeline
   * lies along the bottom of the panel over everything else, arrives at once, and settles back to
   * static for a moment after the sound stops before it fades away.
   */
  interface Timing {
    fadeInMs: number;
    lingerMs: number;
    fadeOutMs: number;
  }

  const TIMINGS: Record<VisualizerStyle, Timing> = {
    bars: { fadeInMs: 1000, lingerMs: 0, fadeOutMs: 0 },
    ridgeline: { fadeInMs: 150, lingerMs: 2000, fadeOutMs: 800 },
  };

  let {
    visualizer,
    mediaPlayer,
  }: { visualizer: Visualizer; mediaPlayer: string | null } = $props();

  const demo = $derived(demoStyle(visualizer));
  const style = $derived(demo ?? visualizer.style ?? DEFAULT_STYLE);
  const timing = $derived(TIMINGS[style]);

  const content = $derived(ha.attribute<string>(mediaPlayer, "media_content_id"));

  // The overlay is for announcements, not for whatever else the speaker is playing.
  const announcing = $derived(
    ha.state(mediaPlayer) === PLAYING && !!content && content.includes(visualizer.content_marker),
  );

  const announcement = $derived.by(() => {
    const path = mediaPlayer && content ? announcementPath(content) : null;
    if (!mediaPlayer || !path) {
      return null;
    }

    // The overlay analyses what it draws, so the audio has to reach it from this origin rather
    // than from Home Assistant. Naming the announcement by path is what makes each one a
    // distinct address, so the frame reloads instead of redrawing the one before it.
    const audio = new URL(
      ANNOUNCEMENT_AUDIO_PATH.replace(ENTITY_PLACEHOLDER, encodeURIComponent(mediaPlayer)),
      window.location.origin,
    );
    audio.searchParams.set(CONTENT_PARAM, path);

    const page = new URL(VISUALIZER_PAGES[style], window.location.origin);
    page.searchParams.set(MUTE_PARAM, TRUE);
    page.searchParams.set(SOURCE_PARAM, audio.pathname + audio.search);

    return page.toString();
  });

  // The demo plays its clip aloud, since there is no speaker in the room saying it.
  let demoPlaying = $state(false);
  const demoSource = $derived.by(() => {
    const page = new URL(VISUALIZER_PAGES[style], window.location.origin);
    page.searchParams.set(SOURCE_PARAM, DEMO_CLIP);

    return page.toString();
  });

  // The demo stands in for an announcement while it plays; real ones still come through.
  const playing = $derived(demoPlaying || announcing);
  const source = $derived(demoPlaying ? demoSource : announcement);

  // What the frame shows outlives the announcement by the style's linger and fade, so the last
  // source is held on to after the one that named it has gone.
  let present = $state(false);
  let leaving = $state(false);
  let shownSource = $state<string | null>(null);

  // A frame shows the browser's empty white page until what it loads has painted, and screened
  // over the panel that white is the whole screen. The overlay stays out of sight until then.
  let loaded = $state(false);

  $effect(() => {
    if (playing && source) {
      if (source !== shownSource) {
        loaded = false;
      }

      shownSource = source;
      present = true;
      leaving = false;

      return;
    }

    if (!present) {
      return;
    }

    const linger = setTimeout(() => {
      if (timing.fadeOutMs > 0) {
        leaving = true;
      } else {
        present = false;
        loaded = false;
      }
    }, timing.lingerMs);

    return () => clearTimeout(linger);
  });

  function faded(): void {
    if (leaving) {
      present = false;
      leaving = false;
      loaded = false;
    }
  }

  async function playDemo(): Promise<void> {
    const length = await clipLength();

    demoPlaying = true;
    setTimeout(() => (demoPlaying = false), length);
  }

  /** The path Home Assistant published the announcement at, which is how the relay names it. */
  function announcementPath(mediaContentId: string): string | null {
    try {
      return new URL(mediaContentId, window.location.origin).pathname;
    } catch {
      return null;
    }
  }
</script>

{#if present && shownSource}
  <iframe
    class="visualizer visualizer--{style}"
    class:visualizer--loaded={loaded}
    class:visualizer--leaving={leaving}
    style:--fade-in="{timing.fadeInMs}ms"
    style:--fade-out="{timing.fadeOutMs}ms"
    src={shownSource}
    title="Announcement"
    allow="autoplay"
    onload={() => (loaded = true)}
    ontransitionend={faded}
  ></iframe>
{/if}

{#if demo && !present}
  <button class="visualizer-demo" onclick={playDemo}>Play a {demo} announcement</button>
{/if}

<style>
  .visualizer {
    position: absolute;
    inset: 0;
    z-index: 3;
    width: 100%;
    height: 100%;
    border: 0;
    opacity: 0;
  }

  /* The fade in starts once the page is there to fade in, rather than when the frame is made. */
  .visualizer--loaded {
    opacity: 1;
    animation: fade-in var(--fade-in) ease-in;
  }

  .visualizer--leaving {
    opacity: 0;
    transition: opacity var(--fade-out) ease-out;
  }

  /*
   * Drawn over the panel rather than in place of it. Screening adds the page's light and leaves
   * its black alone, so the panel shows through wherever nothing is lit, and stays in reach.
   */
  .visualizer--ridgeline {
    pointer-events: none;
    mix-blend-mode: screen;
  }

  .visualizer-demo {
    position: absolute;
    top: var(--panel-padding);
    left: 50%;
    z-index: 5;
    transform: translateX(-50%);
    padding: 0.5em 1.5em;
    font: inherit;
    color: var(--color-foreground);
    background: var(--color-faint);
    border: 0;
    border-radius: var(--transcript-radius);
    cursor: pointer;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
