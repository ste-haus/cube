<script lang="ts">
  import { TAP_SLOP_PX } from "../lib/cube.svelte";
  import { fetchHistory, fireEvent } from "../lib/api";
  import { COLOUR_HOLD_MS } from "../lib/hue";
  import Icon from "../lib/Icon.svelte";
  import { PANE_RESET_MS } from "../lib/panes.svelte";
  import type { Box } from "../lib/picture";
  import { ha } from "../lib/state.svelte";
  import {
    BEAT_MS,
    beatPhase,
    clockTime,
    countdownClock,
    destinationFromName,
    localMoment,
    MINUS_SIGN,
    momentOf,
    samePlace,
    timeAgo,
    trafficDelay,
    trendOf,
    urgency,
    type Thresholds,
    type Urgency,
  } from "../lib/travel";
  import type { HistoryState, Labels, MapsLink, TravelTime } from "../lib/types";
  import PanelWindow from "./PanelWindow.svelte";
  import Reticle from "./Reticle.svelte";

  /*
   * A route, closer up, in a window opened out of the card that was tapped.
   *
   * A trip leads with the event it is for, its title and when and where it starts. Under that, how
   * long it takes, how much of that is traffic, and which way it went when it last moved; how far
   * it is, and, with no event to say so, where it goes; and last when to leave, with how long ago
   * that was worked out beside it. A route with no time to leave gives how long ago its time was
   * asked for a line of its own. Each is left out when the route names nothing to read it from, or
   * its entity has nothing to say. The band names the route and, for a trip, carries its countdown
   * to the second, then once the person has left, where they are.
   *
   * While a trip is soon or imminent the window says so as its card does: the band is solid in the
   * card's colour, and the time to leave and the brackets take it too and keep the card's beat,
   * phased by the page's clock so the two stay in step.
   *
   * A trip with a person to send it to, on a face with an event to send it by, is sent to their
   * phone by holding its event, the reticle closing in over the hold as it does on the floorplan,
   * and only when the event is where the trip is going. The window then closes only at a tap on
   * the glass around it; without one, nothing in it is something to press, so a tap anywhere
   * closes it. Either way it closes itself a while after it was last touched.
   */

  const ALL_DAY_ATTRIBUTE = "all_day";
  const EVENT_TITLE_ATTRIBUTE = "message";
  const EVENT_START_ATTRIBUTE = "start_time";
  const EVENT_LOCATION_ATTRIBUTE = "location";
  const TIMESTAMP_ATTRIBUTE = "timestamp";
  const UNIT_ATTRIBUTE = "unit_of_measurement";
  const DISTANCE_PLACES = 1;
  const PLUS = "+";
  const NO_UNIT = "";
  const NOT_HOME = "not_home";
  const SEND_ICON = "mdi:cellphone-marker";
  const SENT_ICON = "mdi:cellphone-check";
  const FAILED_ICON = "mdi:cellphone-remove";
  // Which way the minutes went the last time they moved. Getting slower is worth noticing, so it
  // is drawn in the primary colour, or the secondary once the trip is imminent, and keeps the
  // trip's beat while it is due; getting quicker stays grey and still.
  const TRENDING_UP_ICON = "mdi:trending-up";
  const TRENDING_DOWN_ICON = "mdi:trending-down";
  // How long the phone says it has sent, or could not, before it offers to again.
  const SENT_MS = 4000;
  const MILLISECONDS = "ms";
  // The reticle round the event lets go as quickly as the floorplan's does.
  const RETICLE_RELEASE_MS = 260;
  const PRIMARY_BUTTON = 0;

  let {
    route,
    minutes,
    leave,
    home,
    thresholds,
    sendEvent,
    maps,
    labels,
    from,
    onlanding,
    onclose,
  }: {
    route: TravelTime;
    /** The route's minutes, as the card shows them when it is not counting down. */
    minutes: number;
    /** When to leave, for a trip that knows. */
    leave: Date | null;
    /** Whether the trip's person is home, so a time that has come reads as theirs to act on. */
    home: boolean;
    /** When a trip counts as soon and as imminent, which the band's colour follows. */
    thresholds: Thresholds;
    /** The event that sends the route to its person's phone, if the face has one. */
    sendEvent: string | null;
    /** Which maps the route opens in on the phone it is sent to. */
    maps: MapsLink;
    labels: Labels;
    /** The tapped card, where the brackets start and where they go back to. */
    from: Box;
    /** The brackets are nearly home, so the card can be shown again under them. */
    onlanding: () => void;
    onclose: () => void;
  } = $props();

  // The band, and the time to leave under it, take the trip's colour while it is due, the same
  // colours the card uses.
  const URGENT_BANDS: Record<Urgency, string> = {
    soon: "var(--color-primary)",
    imminent: "var(--color-secondary)",
  };

  /* The band counts down to the second, so it keeps a clock of its own while the window is open
   * rather than the card's, which turns over only often enough for whole minutes. */
  const TICK_MS = 1000;

  let ticking = $state(new Date());

  $effect(() => {
    const ticker = window.setInterval(() => (ticking = new Date()), TICK_MS);

    return () => window.clearInterval(ticker);
  });

  const level = $derived(leave && home ? urgency(leave, ticking, thresholds) : null);

  // The opacity each beat fades to, the card's own.
  const BEAT_LOWS = {
    soon: "var(--travel-breathe-opacity)",
    imminent: "var(--travel-pulse-opacity)",
  } satisfies Record<Urgency, string>;

  const beat = $derived(
    level
      ? { period: `${BEAT_MS[level]}${MILLISECONDS}`, phase: beatPhase(BEAT_MS[level]), low: BEAT_LOWS[level] }
      : null,
  );

  /* Where the person is, while they are not home: the zone they are in, or simply away. Once they
   * have left, this is what the band says in place of a countdown. */
  const location = $derived.by(() => {
    if (home || !route.person_entity_id) {
      return null;
    }

    const where = ha.state(route.person_entity_id);

    return where === NOT_HOME ? labels.travel_away : where;
  });

  /* How the minutes have moved, from what Home Assistant has recorded of them. It is asked again
   * whenever they change, which is only ever when the route has been polled, so this costs no
   * more than the polling does and asks Home Assistant for nothing it has not already kept. */
  let history = $state<HistoryState[]>([]);

  $effect(() => {
    const entityId = route.entity_id;
    void minutes;

    let current = true;
    fetchHistory(entityId)
      .then((states) => current && (history = states))
      .catch(() => current && (history = []));

    return () => {
      current = false;
    };
  });

  const trend = $derived(trendOf(history, minutes));

  /* Sending is a request with nothing in Home Assistant's state to show for it, so the phone
   * waits on the request itself, then says for a moment whether it went. */
  type Sending = "idle" | "sending" | "sent" | "failed";
  let sending = $state<Sending>("idle");

  /* The reticle round the event: closing in while it is held, breathing while the send is on its
   * way, and springing back out when it is let go of or answered. */
  type Lock = "off" | "holding" | "waiting" | "releasing";
  let lock = $state<Lock>("off");

  let alive = true;
  const timers = new Set<number>();

  function after(ms: number, then: () => void): number {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      then();
    }, ms);
    timers.add(timer);

    return timer;
  }

  function cancel(timer: number | null): void {
    if (timer !== null) {
      window.clearTimeout(timer);
      timers.delete(timer);
    }
  }

  $effect(() => () => {
    alive = false;
    timers.forEach((timer) => window.clearTimeout(timer));
    timers.clear();
  });

  /* Left alone, the window closes itself, as a card with panes goes back to its first; a touch
   * anywhere in it starts the wait again. */
  let panel = $state<PanelWindow | null>(null);
  let idleTimer: number | null = null;

  function restartIdle(): void {
    cancel(idleTimer);
    idleTimer = after(PANE_RESET_MS, () => panel?.close());
  }

  $effect(() => {
    restartIdle();
  });

  function numberOf(entityId: string | null): number | null {
    const state = ha.state(entityId);
    const value = state === null ? NaN : Number(state);

    return Number.isFinite(value) ? value : null;
  }

  const event = $derived.by(() => {
    const calendar = route.calendar_entity_id;
    const title = calendar ? ha.attribute<string>(calendar, EVENT_TITLE_ATTRIBUTE) : null;
    if (!calendar || !title) {
      return null;
    }

    const start = localMoment(ha.attribute<string>(calendar, EVENT_START_ATTRIBUTE));
    const allDay = ha.attribute<boolean>(calendar, ALL_DAY_ATTRIBUTE) === true;

    return {
      title,
      when: allDay || !start ? labels.travel_all_day : clockTime(start),
      location: ha.attribute<string>(calendar, EVENT_LOCATION_ATTRIBUTE) || null,
    };
  });

  const delay = $derived(trafficDelay(minutes, numberOf(route.free_flow_entity_id)));

  const distance = $derived.by(() => {
    const value = numberOf(route.distance_entity_id);
    if (value === null) {
      return null;
    }

    const unit = ha.attribute<string>(route.distance_entity_id, UNIT_ATTRIBUTE) ?? NO_UNIT;

    return `${value.toFixed(DISTANCE_PLACES)} ${unit}`.trim();
  });

  const destination = $derived.by(() => {
    const entityId = route.destination_entity_id;
    if (!entityId) {
      return route.departure_entity_id ? null : destinationFromName(route.entity_id);
    }

    const place = route.destination_attribute ? ha.attribute<string>(entityId, route.destination_attribute) : ha.state(entityId);

    return place || null;
  });

  /* Where the trip is going, as Home Assistant routes it, which is what the phone is sent. */
  const routedTo = $derived(route.destination_entity_id ? ha.state(route.destination_entity_id) : null);

  /*
   * Only a trip is sent: a route that is always there is one its person already knows the way
   * on. And only when the event shown is the one the trip is for, which is when its location is
   * where the trip is going; otherwise the phone would be sent somewhere the window does not say.
   */
  const canSend = $derived(
    sendEvent !== null &&
      route.person_entity_id !== null &&
      route.departure_entity_id !== null &&
      routedTo !== null &&
      event !== null &&
      samePlace(event.location, destination),
  );

  let holdTimer: number | null = null;
  let pressedAt: { x: number; y: number } | null = null;

  function press(event: PointerEvent): void {
    if (event.button !== PRIMARY_BUTTON || sending !== "idle" || lock !== "off") {
      return;
    }

    pressedAt = { x: event.clientX, y: event.clientY };
    lock = "holding";
    holdTimer = after(COLOUR_HOLD_MS, () => {
      holdTimer = null;
      void send();
    });

    window.addEventListener("pointermove", moved);
    window.addEventListener("pointerup", letGo);
    window.addEventListener("pointercancel", letGo);
  }

  function stopListening(): void {
    window.removeEventListener("pointermove", moved);
    window.removeEventListener("pointerup", letGo);
    window.removeEventListener("pointercancel", letGo);
  }

  /** A press that wanders is not a hold. */
  function moved(event: PointerEvent): void {
    if (pressedAt && Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > TAP_SLOP_PX) {
      letGo();
    }
  }

  /** Let go before the hold ran out: nothing is sent. After it, the hold has already sent. */
  function letGo(): void {
    stopListening();
    pressedAt = null;

    if (holdTimer !== null) {
      cancel(holdTimer);
      holdTimer = null;
      release();
    }
  }

  function release(): void {
    lock = "releasing";
    after(RETICLE_RELEASE_MS, () => (lock = "off"));
  }

  $effect(() => () => stopListening());

  async function send(): Promise<void> {
    if (!sendEvent || sending !== "idle") {
      return;
    }

    stopListening();
    sending = "sending";
    lock = "waiting";

    let outcome: Sending = "sent";
    try {
      await fireEvent(sendEvent, {
        route: route.entity_id,
        name: route.name,
        person: route.person_entity_id,
        destination: routedTo,
        label: destination,
        maps,
      });
    } catch {
      outcome = "failed";
    }

    if (!alive) {
      return;
    }

    sending = outcome;
    release();
    after(SENT_MS, () => (sending = "idle"));
  }

  const checked = $derived.by(() => {
    const entityId = route.checked_entity_id;

    return entityId ? momentOf(ha.state(entityId), ha.attribute(entityId, TIMESTAMP_ATTRIBUTE)) : null;
  });
</script>

<!-- What says holding the event sends the trip: a phone with a pin, then a phone with a tick, or
     one crossed out if it could not be sent. All are drawn in the one place, and fade across into
     each other rather than swapping. -->
{#snippet sendMark()}
  <span class="travel-window__send-mark travel-window__send-mark--{sending}">
    <span class="travel-window__send-icon travel-window__send-icon--ready" aria-hidden="true"><Icon name={SEND_ICON} /></span>
    <span class="travel-window__send-icon travel-window__send-icon--sent" role="img" aria-label={labels.travel_sent}>
      <Icon name={SENT_ICON} />
    </span>
    <span class="travel-window__send-icon travel-window__send-icon--failed" role="img" aria-label={labels.travel_send_failed}>
      <Icon name={FAILED_ICON} />
    </span>
  </span>
{/snippet}

{#snippet band()}
  <h2 class="travel-window__title">{route.name}</h2>
  {#if leave}
    {@const clock = countdownClock(leave, ticking)}
    <span class="travel-window__countdown">
      {#if clock === null}
        {home ? labels.leave_now : (location ?? labels.departed)}
      {:else}
        {labels.travel_countdown}{clock}
      {/if}
    </span>
  {/if}
{/snippet}

<PanelWindow
  bind:this={panel}
  {from}
  label={route.name}
  width="var(--travel-window-width)"
  band={level ? "solid" : "quiet"}
  tint={level ? URGENT_BANDS[level] : null}
  bracketColor={level ? URGENT_BANDS[level] : null}
  {beat}
  interactive={canSend}
  header={band}
  {onlanding}
  {onclose}
>
  <div
    class="travel-window"
    onpointerdowncapture={restartIdle}
    style:--trip-beat={beat?.period}
    style:--trip-phase={beat?.phase}
    style:--trip-low={beat?.low}
  >
    {#if event}
      {#snippet eventBody()}
        <span class="travel-window__event-title">{event.title}</span>
        <span class="travel-window__event-when">
          {event.when}{#if event.location}<span class="travel-window__event-where">{event.location}</span>{/if}
        </span>
      {/snippet}

      {#if canSend}
        <button
          type="button"
          class="travel-window__event travel-window__sendable"
          aria-label={labels.travel_send}
          disabled={sending !== "idle"}
          onpointerdown={press}
        >
          {#if lock !== "off"}
            <span class="travel-window__reticle">
              <Reticle
                holding={lock === "holding"}
                releasing={lock === "releasing"}
                holdMs={COLOUR_HOLD_MS}
                releaseMs={RETICLE_RELEASE_MS}
              />
            </span>
          {/if}
          <span class="travel-window__event-text">{@render eventBody()}</span>
          {@render sendMark()}
        </button>
      {:else}
        <div class="travel-window__event">
          <span class="travel-window__event-text">{@render eventBody()}</span>
        </div>
      {/if}
    {/if}

    <dl class="travel-window__facts">

      <dt>{labels.travel_drive}</dt>
      <dd>
        {minutes}
        {labels.minutes}
        {#if delay > 0}<span class="travel-window__delay">{PLUS}{delay} {labels.travel_in_traffic}</span>{/if}
        {#if trend !== null}
          <span
            class="travel-window__trend"
            class:travel-window__beating={trend > 0 && beat !== null}
            style:color={trend > 0 ? (level === "imminent" ? URGENT_BANDS.imminent : URGENT_BANDS.soon) : undefined}
            role="img"
            aria-label="{trend > 0 ? PLUS : MINUS_SIGN}{Math.abs(trend)} {labels.minutes}"
          >
            <Icon name={trend > 0 ? TRENDING_UP_ICON : TRENDING_DOWN_ICON} />
          </span>
        {/if}
      </dd>


      {#if distance}
        <dt>{labels.travel_distance}</dt>
        <dd>{distance}</dd>
      {/if}

      <!-- An event already says where it is, so where the route goes is only spelled out without one. -->
      {#if destination && !event}
        <dt>{labels.travel_destination}</dt>
        <dd>{destination}</dd>
      {/if}

      <!-- When to leave closes the list, with how fresh that is beside it; a route with no time to
           leave gives how fresh its time is a line of its own instead. -->
      {#if leave}
        <dt>{labels.leave_by}</dt>
        <dd>
          <span class:travel-window__beating={beat !== null} style:color={level ? URGENT_BANDS[level] : undefined}
            >{clockTime(leave)}</span
          >
          {#if checked}
            <span class="travel-window__checked"
              >({labels.travel_checked_note} <time datetime={checked.toISOString()}>{timeAgo(checked, ticking)}</time
              >)</span
            >
          {/if}
        </dd>
      {:else if checked}
        <dt>{labels.travel_checked}</dt>
        <dd><time datetime={checked.toISOString()}>{timeAgo(checked, ticking)}</time></dd>
      {/if}
    </dl>

  </div>
</PanelWindow>

<style>
  .travel-window__title {
    margin: 0;
    font-size: var(--camera-window-title-size);
    font-weight: var(--weight-medium);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  /* Set as the route's name is, so it holds its own on a tinted band, in the band's own type
   * colour: light on the quiet band and dark on a tinted one. */
  .travel-window__countdown {
    color: inherit;
    font-size: var(--camera-window-title-size);
    font-weight: var(--weight-medium);
    letter-spacing: 0.06em;
    font-variant-numeric: tabular-nums;
  }

  .travel-window {
    display: flex;
    flex-direction: column;
    gap: var(--rail-gap);
    padding: var(--travel-window-padding);
  }

  .travel-window__event-title {
    font-size: var(--travel-window-event-size);
    font-weight: var(--weight-light);
    line-height: 1.2;
  }

  .travel-window__event-when {
    color: var(--color-muted);
    font-size: var(--travel-detail-size);
  }

  /* The place follows the time after a dim rule, so the line reads as two things, not one. */
  .travel-window__event-where {
    margin-left: 0.6em;
    padding-left: 0.6em;
    border-left: 1px solid var(--color-faint);
  }

  .travel-window__facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.5em 1.4em;
    margin: 0;
    font-size: var(--travel-detail-size);
  }

  /* Labels run up against what they label, so each pair reads across the gap as one line. */
  .travel-window__facts dt {
    color: var(--color-muted);
    text-align: right;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .travel-window__facts dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .travel-window__checked {
    margin-left: 0.6em;
    color: var(--color-muted);
  }

  .travel-window__trend {
    margin-left: 0.6em;
    color: var(--color-muted);
  }

  /* While the trip is due, the time to leave, and an arrow saying it is getting slower, keep the
   * trip's beat, in step with its card and the window's brackets. */
  .travel-window__beating {
    display: inline-block;
    animation: travel-window-beat var(--trip-beat) ease-in-out var(--trip-phase) infinite;
  }

  @keyframes travel-window-beat {
    50% {
      opacity: var(--trip-low);
    }
  }

  /* The event is what a tap sends: drawn as itself, with the phone at its right the only sign it
   * can be pressed. */
  .travel-window__sendable {
    display: flex;
    align-items: center;
    gap: 1em;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .travel-window__sendable:disabled {
    cursor: default;
  }

  .travel-window__event-text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
  }

  .travel-window__send-mark {
    display: grid;
    flex: 0 0 auto;
    margin-left: auto;
    color: var(--color-muted);
    font-size: var(--travel-window-event-size);
  }

  .travel-window__send-icon {
    grid-area: 1 / 1;
    transition: opacity var(--travel-send-fade) ease-in-out;
  }

  /* Only the phone for where the send has got to shows; the others are faded out. */
  .travel-window__send-icon--sent,
  .travel-window__send-icon--failed,
  .travel-window__send-mark--sent .travel-window__send-icon--ready,
  .travel-window__send-mark--failed .travel-window__send-icon--ready {
    opacity: 0;
  }

  .travel-window__send-mark--sent .travel-window__send-icon--sent,
  .travel-window__send-mark--failed .travel-window__send-icon--failed {
    opacity: 1;
  }

  /* The reticle stands a little off the event, as the floorplan's does off a light. */
  .travel-window__sendable {
    position: relative;
  }

  .travel-window__reticle {
    position: absolute;
    inset: calc(-1 * var(--travel-reticle-reach));
    pointer-events: none;
  }

  .travel-window__delay {
    margin-left: 0.6em;
    color: var(--color-muted);
  }
</style>
