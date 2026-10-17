<script lang="ts">
  import Icon from "../lib/Icon.svelte";
  import { ha } from "../lib/state.svelte";
  import { wipeIn, wipeOut } from "../lib/wipe";
  import type { MediaSession, NetworkMedia } from "../lib/types";

  /*
   * Who is streaming from the media server, one row to a session: what, on a line of its own that
   * travels back and forth when it is too long for the card, as the agenda's running title does;
   * then who, on what, at what resolution and rate, with how it plays pinned to the right; and how
   * far in. A stream comes and goes as any row does, wiping in and out, so when one stops the ones
   * below slide up. Read from a single sensor listing them, since the sessions come and go faster
   * than any config could name them.
   *
   * Each says how it reaches its client. A transcode is the one worth noticing, since it is the
   * server doing work for every frame, so its pill is in the secondary colour; a stream played as
   * it is rests in grey.
   */

  const SESSIONS_ATTRIBUTE = "sessions";
  const PLAYING = "playing";
  const PLAYING_ICON = "mdi:play";
  const PAUSED_ICON = "mdi:pause";
  const SERIES_SEPARATOR = " · ";
  const KEY_SEPARATOR = "|";
  const IDLE_TEXT = "Nothing playing";
  const PERCENT = 100;
  const TRANSCODE = "Transcode";
  const PLAY_METHODS: Record<string, string> = { DirectPlay: "Direct", DirectStream: "Remux", Transcode: "Transcode" };
  const BITS_PER_MEGABIT = 1_000_000;
  const BITRATE_DECIMALS = 1;
  const BITRATE_UNIT = "Mbit/s";

  let { media }: { media: NetworkMedia } = $props();

  const sessions = $derived(ha.attribute<MediaSession[]>(media.entity_id, SESSIONS_ATTRIBUTE) ?? []);

  function progress(session: MediaSession): number | null {
    if (!session.duration || session.position === null) {
      return null;
    }

    return Math.min(session.position / session.duration, 1) * PERCENT;
  }

  function format(session: MediaSession): string {
    const rate = session.bitrate ? `${(session.bitrate / BITS_PER_MEGABIT).toFixed(BITRATE_DECIMALS)} ${BITRATE_UNIT}` : null;

    return [session.resolution, rate].filter(Boolean).join(SERIES_SEPARATOR);
  }

  function title(session: MediaSession): string {
    return [session.series, session.title].filter(Boolean).join(SERIES_SEPARATOR);
  }
</script>

<section class="media-sessions">
  <h3 class="media-sessions__heading card-title">{media.title}</h3>

  <!-- Always drawn, so each row wipes in and out as it comes and goes, even the first and the last:
       a transition only plays for the block it belongs to, not for one around it. -->
  <ul class="media-sessions__list">
    {#each sessions as session (`${session.device}${KEY_SEPARATOR}${session.user ?? ""}`)}
      {@const done = progress(session)}
      <li
        class="media-sessions__session"
        class:media-sessions__session--paused={session.state !== PLAYING}
        in:wipeIn
        out:wipeOut
      >
        <span class="media-sessions__state">
          <Icon name={session.state === PLAYING ? PLAYING_ICON : PAUSED_ICON} />
        </span>
        <!-- The title on a line of its own, travelling back and forth when it is too long for it. -->
        <span class="media-sessions__title">
          <span class="media-sessions__run">{title(session)}</span>
        </span>
        <span class="media-sessions__details">
          <span class="media-sessions__where">{[session.user, session.device, format(session)].filter(Boolean).join(SERIES_SEPARATOR)}</span>
          {#if session.play_method}
            <span class="media-sessions__method" class:media-sessions__method--transcode={session.play_method === TRANSCODE}>
              {PLAY_METHODS[session.play_method] ?? session.play_method}
            </span>
          {/if}
        </span>
        {#if done !== null}
          <span class="media-sessions__bar">
            <span class="media-sessions__fill" style:width="{done}%"></span>
          </span>
        {/if}
      </li>
    {/each}
  </ul>

  {#if sessions.length === 0}
    <p class="media-sessions__idle" in:wipeIn out:wipeOut>{IDLE_TEXT}</p>
  {/if}
</section>

<style>
  .media-sessions {
    min-height: 0;
    padding: var(--network-host-padding);
    border: 1px solid var(--color-faint);
    border-radius: var(--network-host-radius);
  }

  .media-sessions__heading {
    margin: 0 0 0.5em;
    color: var(--color-foreground);
    font-size: var(--network-card-title-size);
    font-weight: var(--weight-thin);
  }

  .media-sessions__idle {
    margin: 0;
    color: var(--color-dim);
    font-size: var(--network-host-detail-size);
  }

  /* Spaced by each row's own padding rather than a gap, so a closing row takes its spacing with it. */
  .media-sessions__list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .media-sessions__session {
    padding-bottom: var(--network-host-gap);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: baseline;
    gap: 0.25em 0.6em;
    font-size: var(--network-host-detail-size);
  }

  .media-sessions__state {
    color: var(--color-primary);
    transition: color var(--colour-fade);
  }

  .media-sessions__session--paused .media-sessions__state {
    color: var(--color-muted);
  }

  /* The offset is nought unless the title is wider than its line, so one that fits does not move. */
  .media-sessions__title {
    overflow: hidden;
    white-space: nowrap;
    container-type: inline-size;
  }

  .media-sessions__run {
    display: inline-block;
    vertical-align: top;
    color: var(--color-foreground);
    animation: media-sessions-marquee var(--media-marquee-duration) ease-in-out infinite alternate;
  }

  @keyframes media-sessions-marquee {
    from {
      transform: translateX(0);
    }

    to {
      transform: translateX(min(0px, calc(100cqw - 100%)));
    }
  }

  .media-sessions__details {
    display: flex;
    grid-column: 2;
    align-items: baseline;
    gap: 0.6em;
    min-width: 0;
    color: var(--color-muted);
    font-size: var(--network-host-small-size);
    white-space: nowrap;
  }

  /* Fits its line, so its border never reaches the bar under it. */
  .media-sessions__method {
    display: inline-block;
    flex: 0 0 auto;
    margin-left: auto;
    padding: 0 0.55em;
    border: 1px solid var(--color-dim);
    border-radius: 1em;
    color: var(--color-muted);
    line-height: 1.35;
  }

  .media-sessions__method--transcode {
    border-color: var(--color-secondary);
    color: var(--color-secondary);
  }

  .media-sessions__where {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .media-sessions__bar {
    position: relative;
    grid-column: 2;
    height: var(--network-host-bar);
    background: var(--color-faint);
  }

  .media-sessions__fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--color-dim);
    border-right: var(--network-host-edge) solid var(--color-primary);
  }
</style>
