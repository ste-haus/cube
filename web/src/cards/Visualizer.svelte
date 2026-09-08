<script lang="ts">
  import { ha } from "../lib/state.svelte";
  import type { Visualizer } from "../lib/types";

  const PLAYING = "playing";
  const SOURCE_PARAM = "src";
  const MUTE_PARAM = "mute";
  const CONTENT_PARAM = "content";

  const VISUALIZER_PAGE = "/visualizer/index.html";
  const ANNOUNCEMENT_AUDIO_PATH = "/api/announcement/{entity_id}/audio";
  const ENTITY_PLACEHOLDER = "{entity_id}";

  let {
    visualizer,
    mediaPlayer,
  }: { visualizer: Visualizer; mediaPlayer: string | null } = $props();

  const content = $derived(ha.attribute<string>(mediaPlayer, "media_content_id"));

  // The overlay is for announcements, not for whatever else the speaker is playing.
  const shown = $derived(
    ha.state(mediaPlayer) === PLAYING && !!content && content.includes(visualizer.content_marker),
  );

  const source = $derived.by(() => {
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

    const page = new URL(VISUALIZER_PAGE, window.location.origin);
    page.searchParams.set(MUTE_PARAM, "true");
    page.searchParams.set(SOURCE_PARAM, audio.pathname + audio.search);

    return page.toString();
  });

  /** The path Home Assistant published the announcement at, which is how the relay names it. */
  function announcementPath(mediaContentId: string): string | null {
    try {
      return new URL(mediaContentId, window.location.origin).pathname;
    } catch {
      return null;
    }
  }
</script>

{#if shown && source}
  <iframe class="visualizer" src={source} title="Announcement"></iframe>
{/if}

<style>
  .visualizer {
    position: absolute;
    inset: 0;
    z-index: 3;
    width: 100%;
    height: 100%;
    border: 0;
    animation: fade-in 1s ease-in;
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
