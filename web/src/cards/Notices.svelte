<script lang="ts">
  import { TAP_SLOP_PX } from "../lib/cube.svelte";
  import Icon from "../lib/Icon.svelte";
  import type { Box } from "../lib/picture";
  import { STATE_ON, ha } from "../lib/state.svelte";
  import { agenda as store } from "../lib/agenda.svelte";
  import type { Calendar, DashboardConfig, Notice } from "../lib/types";
  import { wipeIn, wipeOut } from "../lib/wipe";
  import NoticeWindow from "./NoticeWindow.svelte";

  let {
    notices,
    title,
    calendars = [],
    config,
  }: { notices: Notice[]; title: string; calendars?: Calendar[]; config: DashboardConfig } = $props();

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

  /*
   * A notice naming a window opens it out of its row when tapped, and the row hides while it is
   * open so the brackets read as lifting it out of the list. A press that moved further than a
   * tap is the cube's swipe, not a tap.
   */
  let opened = $state<{ notice: Notice; from: Box } | null>(null);
  let away = $state<string | null>(null);
  let pressedAt: { x: number; y: number } | null = null;

  function press(event: PointerEvent): void {
    pressedAt = { x: event.clientX, y: event.clientY };
  }

  function open(notice: Notice, event: MouseEvent): void {
    const moved = pressedAt ? Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) : 0;
    pressedAt = null;

    if (!notice.window || opened !== null || moved > TAP_SLOP_PX || !(event.currentTarget instanceof HTMLElement)) {
      return;
    }

    const box = event.currentTarget.getBoundingClientRect();
    opened = { notice, from: { left: box.left, top: box.top, width: box.width, height: box.height } };
    away = notice.entity_id;
  }

  function closed(): void {
    opened = null;
    away = null;
  }
</script>

<section class="notices">
  <h2 class="panel-title">{title}</h2>
  <ul class="notices__list">
    {#each visible as { notice, message, icon, color, pulsing } (notice.entity_id)}
      <!-- A wall panel has no keyboard; the row is tapped. -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <li
        class="notices__item"
        class:notices__item--pulsing={pulsing}
        class:notices__item--opens={notice.window !== null}
        class:notices__item--away={away === notice.entity_id}
        style:color
        in:wipeIn
        out:wipeOut
        onpointerdown={notice.window ? press : undefined}
        onclick={notice.window ? (event) => open(notice, event) : undefined}
      >
        <Icon name={icon} />
        <span>{message}</span>
      </li>
    {/each}

    {#each calendarNotices as notice (notice.key)}
      <li
        class="notices__item"
        class:notices__item--past={notice.past}
        style:color={notice.past ? null : notice.color}
        in:wipeIn
        out:wipeOut
      >
        <Icon name={notice.icon} />
        <span>{notice.message}</span>
      </li>
    {/each}
  </ul>
</section>

{#if opened?.notice.window}
  <NoticeWindow
    window={opened.notice.window}
    {config}
    from={opened.from}
    onlanding={() => (away = null)}
    onclose={closed}
  />
{/if}

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

  .notices__item--opens {
    cursor: pointer;
  }

  /* Hidden while its window is open, so the brackets read as lifting it out of the list. */
  .notices__item--away {
    visibility: hidden;
  }

  .notices__item--pulsing {
    animation: pulse 3s linear infinite;
  }

  /* Already done, and sitting among things that are not. */
  .notices__item--past {
    color: var(--color-spent);
  }
</style>
