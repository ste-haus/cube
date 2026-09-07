<script lang="ts">
  import { fetchAgenda } from "../lib/api";
  import { eventProgress, eventTime } from "../lib/format";
  import { ha } from "../lib/state.svelte";
  import type { Agenda, AgendaEvent } from "../lib/types";

  const REFRESH_MS = 5 * 60 * 1000;
  const PROGRESS_TICK_MS = 30 * 1000;
  const PERCENT = 100;

  let {
    agenda,
    title,
    countEntities,
  }: { agenda: Agenda; title: string; countEntities: string[] } = $props();

  let events = $state<AgendaEvent[]>([]);
  let now = $state(new Date());

  $effect(() => {
    const load = () => {
      fetchAgenda().then((loaded) => {
        events = loaded;
      });
    };

    load();
    const refresh = window.setInterval(load, REFRESH_MS);
    const tick = window.setInterval(() => {
      now = new Date();
    }, PROGRESS_TICK_MS);

    return () => {
      window.clearInterval(refresh);
      window.clearInterval(tick);
    };
  });

  // The list only scrolls once it outgrows its panel, and the further it overflows the
  // further and slower it travels. Counts come from Home Assistant rather than from the
  // rendered rows, so notices sharing the column are accounted for too.
  const itemCount = $derived(countEntities.reduce((total, entity) => total + ha.number(entity), 0));
  const overflow = $derived(Math.max(itemCount - agenda.scroll_threshold_items, 0));
  const scrollPercent = $derived(-overflow * agenda.scroll_percent_per_item);
  const scrollSeconds = $derived(
    overflow > 0 ? itemCount * agenda.scroll_seconds_per_item : agenda.base_scroll_seconds,
  );
</script>

<section class="agenda">
  <h2 class="panel-title">{title}</h2>

  {#if events.length === 0}
    <p class="agenda__empty">{agenda.empty_text}</p>
  {:else}
    <div class="agenda__viewport">
      <ul
        class="agenda__list"
        class:agenda__list--scrolling={overflow > 0}
        style:--scroll-offset="{scrollPercent}%"
        style:--scroll-duration="{scrollSeconds}s"
      >
        {#each events as event, index (event.calendar + event.start + index)}
          {@const progress = eventProgress(event.start, event.end, now)}
          <li class="agenda__event">
            <span class="agenda__marker" style:background-color={event.color}></span>
            <span class="agenda__summary">{event.summary}</span>
            <span class="agenda__time">
              {#if progress !== null}
                <progress class="agenda__progress" value={progress} max={PERCENT}></progress>
              {:else}
                {eventTime(event.start, event.all_day)}
              {/if}
            </span>
          </li>
        {/each}
      </ul>
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
  }

  .agenda__viewport {
    overflow: hidden;
    min-height: 0;
  }

  .agenda__list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .agenda__list--scrolling {
    animation: agenda-scroll var(--scroll-duration) linear infinite;
  }

  .agenda__event {
    display: flex;
    align-items: center;
    gap: 0.5em;
    padding: 0.35em 0;
  }

  .agenda__marker {
    flex: 0 0 auto;
    width: 3px;
    height: 1.2em;
  }

  .agenda__summary {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .agenda__time {
    flex: 0 0 auto;
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }

  .agenda__progress {
    width: 3em;
    height: 0.4em;
    border: 0;
    background-color: var(--color-faint);
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
