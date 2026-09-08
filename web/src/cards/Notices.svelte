<script lang="ts">
  import Icon from "../lib/Icon.svelte";
  import { STATE_ON, ha } from "../lib/state.svelte";
  import { agenda as store } from "../lib/agenda.svelte";
  import type { Calendar, Notice } from "../lib/types";

  let {
    notices,
    title,
    calendars = [],
  }: { notices: Notice[]; title: string; calendars?: Calendar[] } = $props();

  const EXTRA = "extra";

  /* Household calendars are not on the timeline; their events read as notices, keeping the
   * calendar's own colour and taking the icon it names. */
  const byName = $derived(new Map(calendars.map((calendar) => [calendar.name, calendar])));

  const calendarNotices = $derived(
    store.events
      .map((event) => ({ event, calendar: byName.get(event.calendar) }))
      .filter(({ calendar }) => calendar?.side === EXTRA)
      .map(({ event, calendar }) => ({
        key: `${event.calendar}:${event.summary}`,
        message: event.summary,
        icon: calendar!.icon,
        past: store.isPast(event),
        color: event.color,
      })),
  );

  // Twenty-odd separately configured notices, each carrying its own text and icon. They are
  // one list rather than one card apiece, which is what the config buys.
  /** An icon named in config wins, since naming one is a deliberate choice. */
  function iconFor(notice: Notice): string {
    return notice.icon || (ha.attribute<string>(notice.entity_id, notice.icon_attribute) ?? "");
  }

  /** A state-driven notice shows whenever its entity is off its nominal state. */
  function shown(notice: Notice): boolean {
    const state = ha.state(notice.entity_id);

    if (notice.nominal_state !== null) {
      return state !== null && state !== notice.nominal_state;
    }

    return notice.conditional ? state === STATE_ON : true;
  }

  const visible = $derived(
    notices
      .map((notice) => {
        const state = ha.state(notice.entity_id);

        return {
          notice,
          message: ha.attribute<string>(notice.entity_id, notice.message_attribute),
          icon: iconFor(notice),
          color: state ? (notice.state_colors[state] ?? null) : null,
          pulsing: notice.pulsing || (!!state && notice.pulsing_states.includes(state)),
        };
      })
      .filter(({ notice, message }) => !!message && shown(notice)),
  );
</script>

<section class="notices">
  <h2 class="panel-title">{title}</h2>
  <ul class="notices__list">
    {#each visible as { notice, message, icon, color, pulsing } (notice.entity_id)}
      <li class="notices__item" class:notices__item--pulsing={pulsing} style:color>
        <Icon name={icon} />
        <span>{message}</span>
      </li>
    {/each}

    {#each calendarNotices as notice (notice.key)}
      <li class="notices__item" class:notices__item--past={notice.past} style:color={notice.past ? null : notice.color}>
        <Icon name={notice.icon} />
        <span>{notice.message}</span>
      </li>
    {/each}
  </ul>
</section>

<style>
  .notices__list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .notices__item {
    display: flex;
    align-items: center;
    gap: 0.6em;
    padding: 0.32em 0;
    font-size: var(--notice-size);
    line-height: 1.35;
  }

  .notices__item--pulsing {
    animation: pulse 3s linear infinite;
  }

  /* Already done, and sitting among things that are not. */
  .notices__item--past {
    color: var(--color-spent);
  }
</style>
