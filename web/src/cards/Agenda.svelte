<script lang="ts">
  import { agenda as store } from "../lib/agenda.svelte";
  import { eventProgress, eventTime } from "../lib/format";
  import { ha } from "../lib/state.svelte";
  import type { Agenda, AgendaEvent, Side } from "../lib/types";

  /*
   * A two-sided timeline, carried over from the panel that predates Lovelace: one household's
   * calendars run down the left, the other's down the right, and the time of day sits in a
   * gutter between them over a hairline spine.
   *
   * Calendars belonging to neither person are not on it at all — they read as notices, which is
   * closer to what a chore actually is.
   */

  const PROGRESS_TICK_MS = 30 * 1000;
  const PERCENT = 100;
  const LEFT: Side = "left";
  const RIGHT: Side = "right";
  const EXTRA: Side = "extra";

  let {
    agenda,
    title,
    countEntities,
  }: { agenda: Agenda; title: string; countEntities: string[] } = $props();

  let now = $state(new Date());

  const events = $derived(store.events);

  $effect(() => {
    const tick = window.setInterval(() => {
      now = new Date();
    }, PROGRESS_TICK_MS);

    return () => window.clearInterval(tick);
  });

  const sideOf = $derived(new Map(agenda.calendars.map((calendar) => [calendar.name, calendar.side])));

  function side(event: AgendaEvent): Side {
    return sideOf.get(event.calendar) ?? RIGHT;
  }

  function progressOf(event: AgendaEvent): number | null {
    return event.all_day ? null : eventProgress(event.start, event.end, now);
  }

  /** Events sharing a start time share a slot, so the gutter shows each time once. */
  const slots = $derived.by(() => {
    const buckets = new Map<string, AgendaEvent[]>();

    for (const event of events) {
      if (side(event) === EXTRA) {
        continue;
      }

      const key = event.all_day ? "" : eventTime(event.start, event.all_day);
      const bucket = buckets.get(key);
      bucket ? bucket.push(event) : buckets.set(key, [event]);
    }

    return [...buckets.entries()].map(([time, entries]) => ({
      time,
      entries,
      // A slot showing a meter has given up its clock: the meter says when far better.
      progress: entries.map(progressOf).find((value) => value !== null) ?? null,
    }));
  });

  const itemCount = $derived(countEntities.reduce((total, entity) => total + ha.number(entity), 0));
  const overflow = $derived(Math.max(itemCount - agenda.scroll_threshold_items, 0));
  const scrollPercent = $derived(-overflow * agenda.scroll_percent_per_item);
  const scrollSeconds = $derived(
    overflow > 0 ? itemCount * agenda.scroll_seconds_per_item : agenda.base_scroll_seconds,
  );
</script>

<section class="agenda">
  <h2 class="panel-title">{title}</h2>

  {#if agenda.side_labels[LEFT] || agenda.side_labels[RIGHT]}
    <div class="agenda__headers">
      <span class="agenda__header agenda__header--left">{agenda.side_labels[LEFT] ?? ""}</span>
      <span class="agenda__gutter"></span>
      <span class="agenda__header agenda__header--right">{agenda.side_labels[RIGHT] ?? ""}</span>
    </div>
  {/if}

  {#if events.length === 0}
    <p class="agenda__empty">{agenda.empty_text}</p>
  {:else}
    <div class="agenda__viewport">
      <div
        class="agenda__timeline"
        class:agenda__timeline--scrolling={overflow > 0}
        style:--scroll-offset="{scrollPercent}%"
        style:--scroll-duration="{scrollSeconds}s"
      >
        {#each slots as slot, index (slot.time + index)}
          <div class="agenda__slot">
            {#each [LEFT, RIGHT] as column (column)}
              <div class="agenda__side agenda__side--{column}">
                {#each slot.entries.filter((event) => side(event) === column) as event, position (event.calendar + event.summary + position)}
                  {@const running = progressOf(event) !== null}
                  <div class="agenda__event" style:color={event.color}>
                    <span class="agenda__summary" class:agenda__summary--running={running}>
                      {event.summary}
                    </span>
                  </div>
                {/each}
              </div>

              {#if column === LEFT}
                <span class="agenda__time">
                  {#if slot.progress !== null}
                    <progress class="agenda__progress" value={slot.progress} max={PERCENT}></progress>
                  {:else}
                    {slot.time}
                  {/if}
                </span>
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</section>

<style>
  .agenda {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .agenda__empty {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--agenda-size);
  }

  .agenda__headers {
    display: flex;
    align-items: baseline;
    color: var(--color-dim);
    font-size: var(--agenda-time-size);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .agenda__header {
    flex: 1 1 0;
    min-width: 0;
  }

  .agenda__header--left {
    text-align: right;
  }

  .agenda__header--right {
    text-align: left;
  }

  .agenda__gutter {
    flex: 0 0 12%;
  }

  .agenda__viewport {
    overflow: hidden;
    min-height: 0;
  }

  /* The spine the times sit on, drawn as a hairline down the middle. */
  .agenda__timeline {
    background: linear-gradient(
      to right,
      transparent calc(50% - 1px),
      var(--agenda-spine-color) calc(50% - 1px),
      var(--agenda-spine-color) calc(50% + 1px),
      transparent calc(50% + 1px)
    );
  }

  .agenda__timeline--scrolling {
    animation: agenda-scroll var(--scroll-duration) linear infinite;
  }

  .agenda__slot {
    display: flex;
    align-items: center;
    padding: 0.5em 0;
  }

  .agenda__side {
    flex: 1 1 0;
    min-width: 0;
    /* Gives the running title a width to measure its overflow against. */
    container-type: inline-size;
  }

  .agenda__side--left {
    text-align: right;
  }

  .agenda__side--right {
    text-align: left;
  }

  .agenda__event {
    font-size: var(--agenda-size);
    line-height: 1.5;
    overflow: hidden;
    white-space: nowrap;
  }

  .agenda__summary {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Something under way is worth reading in full, so it travels rather than being cut off.
   * The offset is zero unless the title is genuinely wider than its column. */
  .agenda__summary--running {
    display: inline-block;
    text-overflow: clip;
    animation: agenda-marquee 9s ease-in-out infinite alternate;
  }

  .agenda__time {
    flex: 0 0 12%;
    text-align: center;
    color: var(--color-dim);
    font-size: var(--agenda-time-size);
    font-variant-numeric: tabular-nums;
    background: linear-gradient(
      transparent,
      var(--color-background) 25%,
      var(--color-background) 75%,
      transparent
    );
  }

  .agenda__progress {
    display: inline-block;
    width: 90%;
    height: 0.35em;
    vertical-align: middle;
    border: 0;
    appearance: none;
    background-color: var(--color-faint);
  }

  .agenda__progress::-webkit-progress-bar {
    background-color: var(--color-faint);
  }

  .agenda__progress::-webkit-progress-value {
    background-color: var(--color-muted);
  }

  .agenda__progress::-moz-progress-bar {
    background-color: var(--color-muted);
  }

  @keyframes agenda-marquee {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(min(0px, calc(100cqw - 100%)));
    }
  }

  @keyframes agenda-scroll {
    10% {
      transform: translateY(0);
    }
    50%,
    60% {
      transform: translateY(var(--scroll-offset));
    }
    100% {
      transform: translateY(0);
    }
  }
</style>
