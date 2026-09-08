<script lang="ts">
  import { ha } from "../lib/state.svelte";
  import type { Visualizer } from "../lib/types";

  const PLAYING = "playing";
  const SOURCE_PARAM = "src";
  const MUTE_PARAM = "mute";

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
    if (!content) {
      return null;
    }

    const url = new URL(visualizer.url);
    url.searchParams.set(MUTE_PARAM, "true");
    url.searchParams.set(SOURCE_PARAM, content);

    return url.toString();
  });
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
