<script lang="ts">
  import Icon from "../lib/Icon.svelte";
  import {
    byCriticality,
    CLOSED_ICON,
    incidentIcon,
    incidentsTitle,
    incidentTime,
    roadOf,
    severityColour,
    severityOf,
    type Incident,
  } from "../lib/incidents";
  import { PANE_RESET_MS } from "../lib/panes.svelte";
  import type { Box } from "../lib/picture";
  import type { Labels } from "../lib/types";
  import PanelWindow from "./PanelWindow.svelte";

  /*
   * Every traffic incident, closer up, in a window opened out of the banner that was tapped. The
   * band is solid in the banner's colour and says what the incident is, or for several of them
   * that they are incidents, and how many; the brackets take the colour too. Each incident leads
   * with its road and how bad it is, its icon in its own colour, then what HERE says of it, where,
   * and when it began and is due to end.
   *
   * Nothing in it is something to press, so a tap anywhere closes it, and it closes itself once
   * the last incident clears, or a while after it was last touched.
   */

  const TIME_SEPARATOR = " · ";

  let {
    incidents,
    live,
    colour,
    lightType,
    criticalColour,
    labels,
    from,
    onlanding,
    onclose,
  }: {
    incidents: Incident[];
    /** Whether there are still incidents; the window closes once there are none. */
    live: boolean;
    /** The banner's colour, as CSS, and whether its type is light. */
    colour: string;
    lightType: boolean;
    /** The colour a critical incident is drawn in. */
    criticalColour: string;
    labels: Labels;
    /** The banner, where the brackets start and where they go back to. */
    from: Box;
    onlanding: () => void;
    onclose: () => void;
  } = $props();

  const sorted = $derived(byCriticality(incidents));

  /* The times are only told to the minute, so the window's clock is the one it opened with. */
  const now = new Date();

  let panel = $state<PanelWindow | null>(null);
  let idleTimer: number | null = null;

  function restartIdle(): void {
    if (idleTimer !== null) {
      window.clearTimeout(idleTimer);
    }

    idleTimer = window.setTimeout(() => panel?.close(), PANE_RESET_MS);
  }

  $effect(() => {
    restartIdle();

    return () => {
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer);
      }
    };
  });

  $effect(() => {
    if (!live) {
      panel?.close();
    }
  });

  function when(incident: Incident): string {
    const since = incidentTime(incident.start_time, now);
    const until = incidentTime(incident.end_time, now);
    const parts = [since && `${labels.incidents_since} ${since}`, until && `${labels.incidents_until} ${until}`];

    return parts.filter(Boolean).join(TIME_SEPARATOR);
  }
</script>

{#snippet band()}
  <h2 class="incidents-window__title">{incidentsTitle(incidents, labels)}</h2>
  <span class="incidents-window__count">{incidents.length}</span>
{/snippet}

<PanelWindow
  bind:this={panel}
  {from}
  label={incidentsTitle(incidents, labels)}
  width="var(--incidents-window-width)"
  band="solid"
  tint={colour}
  {lightType}
  bracketColor={colour}
  header={band}
  {onlanding}
  {onclose}
>
  <ul class="incidents-window" onpointerdowncapture={restartIdle} onscroll={restartIdle}>
    {#each sorted as incident, index (incident.id ?? index)}
      {@const road = roadOf(incident, labels.incidents_unnamed)}
      {@const tint = severityColour(severityOf(incident), criticalColour)}
      {@const times = when(incident)}
      <li class="incidents-window__incident">
        <span class="incidents-window__icon" style:color={tint}><Icon name={incidentIcon(incident)} /></span>

        <div class="incidents-window__text">
          <div class="incidents-window__head">
            <span class="incidents-window__line incidents-window__road">
              <span class="incidents-window__run"
                >{road}{#if incident.direction}<span class="incidents-window__direction">{incident.direction}</span
                  >{/if}</span
              >
            </span>
            {#if incident.criticality}
              <span class="incidents-window__criticality" style:color={tint}>{incident.criticality}</span>
            {/if}
          </div>

          {#if incident.description ?? incident.summary}
            <p class="incidents-window__description">{incident.description ?? incident.summary}</p>
          {/if}

          {#if incident.location && incident.location !== road}
            <p class="incidents-window__line incidents-window__detail">
              <span class="incidents-window__run">{incident.location}</span>
            </p>
          {/if}

          {#if incident.road_closed || times}
            <p class="incidents-window__line incidents-window__detail">
              <span class="incidents-window__run">
                {#if incident.road_closed}
                  <span class="incidents-window__closed" style:color={tint}
                    ><Icon name={CLOSED_ICON} /> {labels.incidents_closed}</span
                  >
                {/if}
                {times}
              </span>
            </p>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
</PanelWindow>

<style>
  .incidents-window__title {
    margin: 0;
    font-size: var(--camera-window-title-size);
    font-weight: var(--weight-medium);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .incidents-window__count {
    font-size: var(--camera-window-title-size);
    font-weight: var(--weight-medium);
    font-variant-numeric: tabular-nums;
  }

  .incidents-window {
    max-height: var(--incidents-window-height);
    margin: 0;
    padding: var(--travel-window-padding);
    overflow-y: auto;
    list-style: none;
  }

  .incidents-window__incident {
    display: flex;
    gap: 1em;
    padding-block: 0.9em;
    font-size: var(--travel-detail-size);
  }

  .incidents-window__incident + .incidents-window__incident {
    border-top: 1px solid var(--color-faint);
  }

  .incidents-window__icon {
    flex: 0 0 auto;
    font-size: var(--travel-window-event-size);
    line-height: 1;
  }

  .incidents-window__text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.3em;
    min-width: 0;
  }

  .incidents-window__head {
    display: flex;
    align-items: baseline;
    gap: 0.6em;
  }

  /* Travels like the lines under it, so the criticality keeps its place at the end of the row. */
  .incidents-window__road {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--travel-window-event-size);
    font-weight: var(--weight-light);
    line-height: 1.2;
  }

  .incidents-window__direction {
    margin-left: 0.6em;
    color: var(--color-muted);
  }

  /* What HERE says of it is the part worth reading whole, so it wraps rather than travelling. */
  .incidents-window__description {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .incidents-window__criticality {
    margin-left: auto;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  /* The road and the lines of detail keep to one each, and one too long for it travels back and
   * forth to show the rest, as the agenda's running title does. The offset is nought unless the line is wider
   * than the window, so one that fits does not move. */
  .incidents-window__line {
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
    container-type: inline-size;
  }

  .incidents-window__run {
    display: inline-block;
    vertical-align: top;
    animation: incidents-window-marquee var(--incident-marquee-duration) ease-in-out infinite alternate;
  }

  @keyframes incidents-window-marquee {
    from {
      transform: translateX(0);
    }

    to {
      transform: translateX(min(0px, calc(100cqw - 100%)));
    }
  }

  .incidents-window__detail {
    color: var(--color-muted);
  }

  .incidents-window__closed {
    margin-right: 0.6em;
  }
</style>
