<script lang="ts">
  import { agenda as store, focusOf, spineBreaks } from "../lib/agenda.svelte";
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

  const PERCENT = 100;
  const LEFT: Side = "left";
  const RIGHT: Side = "right";
  const EXTRA: Side = "extra";

  let {
    agenda,
    title,
    countEntities,
  }: { agenda: Agenda; title: string; countEntities: string[] } = $props();

  const events = $derived(store.events);
  const now = $derived(store.now);

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

    return [...buckets.entries()].map(([time, entries]) => {
      const running = entries.filter((event) => progressOf(event) !== null);
      const tracked = running[0] ?? null;
      const columns = new Set(running.map(side));

      return {
        time,
        entries,
        // A slot showing a meter has given up its clock: the meter says when far better.
        progress: tracked ? progressOf(tracked) : null,
        // The bar is drawn in the colour of what it is measuring. A slot running on both
        // sides at once gets one bar that belongs to neither, so it stays neutral rather
        // than picking a side.
        progressColor: tracked && columns.size === 1 ? tracked.color : null,
        startsAt: startOf(entries),
      };
    });
  });

  /** When a row begins, or null for an untimed one. */
  function startOf(entries: AgendaEvent[]): number | null {
    const times = entries
      .filter((event) => !event.all_day && event.start !== null)
      .map((event) => new Date(event.start as string).getTime());

    return times.length > 0 ? Math.min(...times) : null;
  }

  const breaks = $derived(spineBreaks(slots.map((slot) => slot.startsAt)));

  /* Only these titles scroll; see focusOf. */
  const timelineEvents = $derived(events.filter((event) => side(event) !== EXTRA && !event.all_day));

  const focused = $derived(focusOf(timelineEvents, now));

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
            {#if breaks.has(index)}
              <svg class="agenda__break" viewBox="0 0 8 22" aria-hidden="true">
                <path d="M4 0 L1 5 L7 11 L1 17 L4 22" fill="none" stroke="currentColor" />
              </svg>
            {/if}
            {#each [LEFT, RIGHT] as column (column)}
              <div class="agenda__side agenda__side--{column}">
                {#each slot.entries.filter((event) => side(event) === column) as event, position (event.calendar + event.summary + position)}
                  {@const past = store.isPast(event)}
                  <div class="agenda__event" style:color={past ? null : event.color} class:agenda__event--past={past}>
                    <span class="agenda__summary" class:agenda__summary--focused={focused.has(event)}>
                      {event.summary}
                    </span>
                  </div>
                {/each}
              </div>

              {#if column === LEFT}
                <span class="agenda__time">
                  {#if slot.progress !== null}
                    <progress
                      class="agenda__progress"
                      style:--progress-color={slot.progressColor}
                      value={slot.progress}
                      max={PERCENT}
                    ></progress>
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
    color: var(--agenda-label-color);
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
      transparent calc(50% - 0.5px),
      var(--agenda-spine-color) calc(50% - 0.5px),
      var(--agenda-spine-color) calc(50% + 0.5px),
      transparent calc(50% + 0.5px)
    );
  }

  .agenda__timeline--scrolling {
    animation: agenda-scroll var(--scroll-duration) linear infinite;
  }

  .agenda__slot {
    position: relative;
    display: flex;
    align-items: center;
    padding: 0.5em 0;
  }

  /* Sits on the spine where a long empty stretch would otherwise pass unremarked, masking the
   * straight line behind it the way the times do. */
  .agenda__break {
    position: absolute;
    top: 0;
    left: 50%;
    width: 8px;
    height: 22px;
    transform: translate(-50%, -50%);
    color: var(--agenda-spine-color);
    background-color: var(--color-background);
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

  /* Something already done is still worth seeing, but not worth the calendar's colour. */
  .agenda__event--past {
    color: var(--color-spent);
  }

  .agenda__summary {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Worth reading in full, so it travels rather than being cut off. The offset is zero unless
   * the title is genuinely wider than its column, so a short one simply does not move. */
  .agenda__summary--focused {
    display: inline-block;
    /* An inline-block sits its bottom edge on the baseline, so the line box grows by the
     * strut's descent below it — which made the running row taller than every other, and left
     * its title above the gutter the meter is centred in. Aligning to the top keeps the line
     * box the height it is when the title is not travelling. */
    vertical-align: top;
    text-overflow: clip;
    animation: agenda-marquee 9s ease-in-out infinite alternate;
  }

  .agenda__time {
    flex: 0 0 12%;
    /* A flex item's automatic minimum is the intrinsic size of what it holds, so without this
     * the gutter widens to fit a meter and shoves both columns outward with it. The gutter is
     * this wide whatever is in it. */
    min-width: 0;
    /* Centred as a box rather than on a baseline: `vertical-align: middle` puts an inline
     * box's midpoint at half an x-height above the baseline, which left the meter riding high
     * over event titles set a size larger than the gutter. */
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--agenda-label-color);
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
    --meter-height: 0.35em;

    /* Centred in the row, which is where the times it stands in for sit: their ink lands
     * within a fifth of a pixel of the row's middle. Aligning to the titles instead would
     * read better against the one title beside it and worse against the column of times it
     * runs down, and the column is what the eye follows. */
    display: block;
    /* Sized by `width`, never by a flex basis or an intrinsic minimum, so the meter stays
     * inside the gutter it is centred in. Titles sit hard against the gutter on both sides,
     * so the slack left over here is the only margin between the two. */
    flex: none;
    min-width: 0;
    width: 66%;
    height: var(--meter-height);
    border: 0;
    border-radius: calc(var(--meter-height) / 2);
    overflow: hidden;
    appearance: none;
    background-color: var(--color-faint);
  }

  .agenda__progress::-webkit-progress-bar {
    border-radius: inherit;
    background-color: var(--color-faint);
  }

  .agenda__progress::-webkit-progress-value {
    border-radius: inherit;
    background-color: var(--progress-color, var(--color-muted));
  }

  .agenda__progress::-moz-progress-bar {
    border-radius: inherit;
    background-color: var(--progress-color, var(--color-muted));
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
