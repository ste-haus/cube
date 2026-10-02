<script lang="ts">
  import { faceVisibility, swipeable, type Direction, TAP_SLOP_PX } from "../lib/cube.svelte";
  import { COLOUR_HOLD_MS } from "../lib/hue";
  import Icon from "../lib/Icon.svelte";
  import { Lapsing, PANE_RESET_MS } from "../lib/panes.svelte";
  import type { Box } from "../lib/picture";
  import { ha } from "../lib/state.svelte";
  import {
    activeRoutes,
    BEAT_MS,
    beatPhase,
    BREATHE_MS,
    carouselStrip,
    countdown,
    departureAt,
    departureTime,
    leavesFromHome,
    MINUS_SIGN,
    PULSE_MS,
    urgency,
    type ActiveRoute,
  } from "../lib/travel";
  import type { DepartureFaceOptions, Labels } from "../lib/types";
  import Reticle from "./Reticle.svelte";
  import TravelWindow from "./TravelWindow.svelte";

  /*
   * The trips under way, two side by side, the trips with a time to leave ahead of the routes that
   * are always there. A route nobody is keeping up to date is left out rather than shown as a
   * stale figure, and with none under way the card says so in grey. With more than two, the rest
   * are a sideways swipe away: the pair slides one card along, round from the last to the first
   * either way, a chevron says there is more and steps on when tapped, and holding a route opens a
   * window with more about it, and like the other cards with panes it goes back to
   * the first pair a minute after it was last swiped.
   *
   * A route that is always there to be read, like a commute, shows how long it takes. A route tied
   * to a particular trip counts down to when to leave for it instead, from below nought as a
   * launch does, then shows `leave_now_icon` once that time has come, and says what the time is.
   * Once leaving is soon the countdown and the time breathe in the primary colour, and once it is
   * imminent or gone they pulse, faster and deeper, in the secondary, the way the fuel gauges go
   * from one colour to the other. A trip whose person is away from home has left already or is
   * leaving from elsewhere, so it keeps its countdown without the colour, and once its time has
   * come shows `departed_icon` in grey rather than urging anyone to run.
   */

  // The countdown is in whole minutes, so being a few seconds late to turn over is no loss.
  const MS_PER_SECOND = 1000;
  const TICK_SECONDS = 15;
  const TICK_MS = TICK_SECONDS * MS_PER_SECOND;
  const MILLISECONDS = "ms";
  const PERCENT = "%";
  const WHOLE_PERCENT = 100;
  const MORE_ICON = "mdi:chevron-right";
  const STAND_IN_FIGURE = "0";

  // How many routes show at once, and the strip's cards either side of them to slide in from.
  const SHOWING = 2;
  const STRIP_LENGTH = SHOWING + 2;
  const CARD_SHARE = WHOLE_PERCENT / STRIP_LENGTH;
  const FIRST = 0;
  const NEXT = 1;
  const PREVIOUS = -1;
  const AT_REST = 0;
  // How long the strip takes to slide one card along, and how long to wait for it to say it has
  // before taking it as done: a slide the browser never finishes, on a strip that was taken away
  // or a face that was turned, must not leave the carousel stuck mid-slide.
  const SLIDE_MS = 420;
  const SLIDE_GIVE_UP_MS = 2 * SLIDE_MS;
  const CARD_SELECTOR = "li";
  const PRIMARY_BUTTON = 0;
  // The reticle round a held route lets go as quickly as the floorplan's does.
  const RETICLE_RELEASE_MS = 260;

  let { options, labels }: { options: DepartureFaceOptions; labels: Labels } = $props();

  const visibility = faceVisibility();

  let now = $state(new Date());

  $effect(() => {
    if (!visibility.showing) {
      return;
    }

    now = new Date();

    const timer = window.setInterval(() => {
      now = new Date();
    }, TICK_MS);

    return () => window.clearInterval(timer);
  });

  const read = (entityId: string) => ha.state(entityId);

  const active = $derived(activeRoutes(options.travel_times, read));
  const carousel = $derived(active.length > SHOWING);

  /* Which route leads the pair, and which way the strip is sliding while a swipe plays out. Once
   * the slide ends the lead moves on and the strip is put back where it rests, with nothing to
   * see, since it is then showing the same cards from its resting place. */
  const lead = new Lapsing<number>(PANE_RESET_MS);
  let sliding = $state(AT_REST);

  const offset = $derived(carousel ? (lead.chosen ?? FIRST) : FIRST);
  const strip = $derived(carousel ? carouselStrip(active, offset, SHOWING) : active);
  const shift = $derived(-(CARD_SHARE * (NEXT + sliding)));

  function step(direction: Direction): void {
    if (!carousel || sliding !== AT_REST) {
      return;
    }

    if (direction === "left") {
      sliding = NEXT;
    } else if (direction === "right") {
      sliding = PREVIOUS;
    } else {
      return;
    }

    cancelSlideGiveUp();
    slideGiveUp = window.setTimeout(() => {
      slideGiveUp = null;
      finishSlide();
    }, SLIDE_GIVE_UP_MS);
  }

  let slideGiveUp: number | null = null;

  function cancelSlideGiveUp(): void {
    if (slideGiveUp !== null) {
      window.clearTimeout(slideGiveUp);
      slideGiveUp = null;
    }
  }

  /** The slide is over: the lead moves on, and the strip goes back to resting on it. */
  function finishSlide(): void {
    if (sliding === AT_REST) {
      return;
    }

    cancelSlideGiveUp();
    if (carousel) {
      lead.choose((((offset + sliding) % active.length) + active.length) % active.length);
    }
    sliding = AT_REST;
  }

  /* A strip that is no longer there, or no longer being looked at, has no slide to finish: it is
   * put straight back at rest. */
  $effect(() => {
    if ((!carousel || !visibility.showing) && sliding !== AT_REST) {
      cancelSlideGiveUp();
      sliding = AT_REST;
    }
  });

  $effect(() => () => cancelSlideGiveUp());

  /* The chevron is tapped, and a swipe across the carousel can start on it, so a release far from
   * the press is the swipe's and not also a tap. */
  let pressedAt: { x: number; y: number } | null = null;

  function press(event: PointerEvent): void {
    pressedAt = { x: event.clientX, y: event.clientY };
  }

  /** Only a release near where the press began is a tap; a click with no press behind it is not. */
  function tapped(event: MouseEvent): boolean {
    const from = pressedAt;
    pressedAt = null;

    return from !== null && Math.hypot(event.clientX - from.x, event.clientY - from.y) <= TAP_SLOP_PX;
  }

  function forget(): void {
    pressedAt = null;
  }

  function tapMore(event: MouseEvent): void {
    if (tapped(event)) {
      step("left");
    }
  }

  /* A route held long enough opens its window out of the reticle round its card, and the card
   * hides while it is open, so the window reads as the card lifted off the rail; it shows again as
   * the brackets come home. Letting go, or sliding off, before the reticle has closed does
   * nothing, and it springs back out. The carousel does not go back to its first pair behind an
   * open window, and starts its wait again once the window is closed. */
  let opened = $state<{ entityId: string; from: Box } | null>(null);
  let away = $state<string | null>(null);
  let lock = $state<{ entityId: string; releasing: boolean } | null>(null);

  const openedEntry = $derived(opened ? (active.find(({ route }) => route.entity_id === opened?.entityId) ?? null) : null);

  let holdTimer: number | null = null;
  let releaseTimer: number | null = null;
  let heldAt: { x: number; y: number } | null = null;

  function hold(event: PointerEvent, entityId: string): void {
    if (event.button !== PRIMARY_BUTTON || !event.isPrimary || holdTimer !== null || opened !== null || sliding !== AT_REST) {
      return;
    }

    const card = (event.currentTarget as HTMLElement).closest(CARD_SELECTOR) ?? (event.currentTarget as HTMLElement);

    cancelRelease();
    heldAt = { x: event.clientX, y: event.clientY };
    lock = { entityId, releasing: false };
    holdTimer = window.setTimeout(() => {
      holdTimer = null;
      stopListening();
      lock = null;
      open(card, entityId);
    }, COLOUR_HOLD_MS);

    window.addEventListener("pointermove", wandered);
    window.addEventListener("pointerup", letGo);
    window.addEventListener("pointercancel", letGo);
  }

  function stopListening(): void {
    window.removeEventListener("pointermove", wandered);
    window.removeEventListener("pointerup", letGo);
    window.removeEventListener("pointercancel", letGo);
  }

  /** A press that wanders is a swipe, not a hold. */
  function wandered(event: PointerEvent): void {
    if (heldAt && Math.hypot(event.clientX - heldAt.x, event.clientY - heldAt.y) > TAP_SLOP_PX) {
      letGo();
    }
  }

  /** Let go before the hold ran out: nothing opens. After it, the hold has already opened. */
  function letGo(): void {
    stopListening();
    heldAt = null;

    if (holdTimer === null) {
      return;
    }

    window.clearTimeout(holdTimer);
    holdTimer = null;

    if (lock) {
      lock = { ...lock, releasing: true };
      releaseTimer = window.setTimeout(() => {
        releaseTimer = null;
        lock = null;
      }, RETICLE_RELEASE_MS);
    }
  }

  function cancelRelease(): void {
    if (releaseTimer !== null) {
      window.clearTimeout(releaseTimer);
      releaseTimer = null;
    }
  }

  // A face turned away mid-hold has nobody holding it.
  $effect(() => {
    if (!visibility.showing) {
      letGo();
    }
  });

  $effect(() => () => {
    letGo();
    cancelRelease();
  });

  function open(card: Element, entityId: string): void {
    const { left, top, width, height } = card.getBoundingClientRect();
    opened = { entityId, from: { left, top, width, height } };
    away = entityId;
    lead.hold();
  }

  function closed(): void {
    opened = null;
    away = null;
    lead.resume();
  }

  /* A route that stops being kept up to date while its window is open takes the window with it,
   * rather than leaving the face waiting on a window that is no longer there. */
  $effect(() => {
    if (opened && !openedEntry) {
      closed();
    }
  });

  function settle(event: TransitionEvent): void {
    if (event.target === event.currentTarget) {
      finishSlide();
    }
  }
</script>

{#snippet card({ route, minutes }: ActiveRoute)}
  {@const leave = route.departure_entity_id ? departureAt(ha.state(route.departure_entity_id)) : null}
  {@const home = leavesFromHome(route, read)}
  {@const level = leave && home ? urgency(leave, now, options) : null}
  {@const count = leave ? countdown(leave, now) : minutes}
  <!-- Its beat is phased by the page's clock, so it keeps time with its window's brackets. -->
  <li
    class="travel__route {level ? `travel__route--${level}` : ''}"
    class:travel__route--away={away === route.entity_id}
    style:--travel-phase={level ? beatPhase(BEAT_MS[level]) : undefined}
  >
    <!-- Spans rather than divs, since a button holds only phrasing content; each is set as a block. -->
    <button
      type="button"
      class="travel__card"
      aria-label={route.short_name ?? route.name}
      onpointerdown={(event) => hold(event, route.entity_id)}
      oncontextmenu={(event) => event.preventDefault()}
    >
      {#if lock?.entityId === route.entity_id}
        <span class="travel__reticle">
          <Reticle holding={!lock.releasing} releasing={lock.releasing} holdMs={COLOUR_HOLD_MS} releaseMs={RETICLE_RELEASE_MS} />
        </span>
      {/if}
      <span class="travel__name">{route.short_name ?? route.name}</span>
      <span class="travel__minutes">
        {#if count === null && !home}
          <span class="travel__now travel__now--departed" role="img" aria-label={labels.departed}>
            <Icon name={options.departed_icon} />
          </span>
        {:else if count === null}
          <span class="travel__now" role="img" aria-label={labels.leave_now}>
            <Icon name={options.leave_now_icon} />
          </span>
        {:else}
          {#if count < 0}<span class="travel__sign">{MINUS_SIGN}</span>{/if}{Math.abs(count)}<span class="travel__unit"
            >{labels.minutes}</span
          >
        {/if}
      </span>
      {#if leave}
        <span class="travel__leave">
          {labels.leave_by} <span class="travel__leave-time">{departureTime(leave)}</span>
        </span>
      {/if}
    </button>
  </li>
{/snippet}

<section
  class="travel"
  style:--travel-breathe="{BREATHE_MS}{MILLISECONDS}"
  style:--travel-pulse="{PULSE_MS}{MILLISECONDS}"
  style:--travel-slide="{SLIDE_MS}{MILLISECONDS}"
  style:--travel-showing={SHOWING}
  style:--travel-strip-length={STRIP_LENGTH}
>
  <h2 class="panel-title panel-title--right">{labels.travel}</h2>

  {#if active.length === 0}
    <!-- A card with nothing to show stands unseen behind the words, so the rail is as tall with no
         trips as with one and nothing under it moves up when the last one goes. -->
    <div class="travel__idle">
      <ul class="travel__routes travel__routes--stand-in" aria-hidden="true">
        <li class="travel__route">
          <span class="travel__card">
            <span class="travel__name">{labels.travel_idle}</span>
            <span class="travel__minutes">{STAND_IN_FIGURE}</span>
            <span class="travel__leave">{labels.leave_by}</span>
          </span>
        </li>
      </ul>
      <p class="travel__idle-text">{labels.travel_idle}</p>
    </div>
  {:else if carousel}
    <div class="travel__carousel">
    <div class="travel__window" use:swipeable={{ onSwipe: step, axes: "horizontal", exclusive: true }}>
      <ul
        class="travel__routes travel__routes--strip"
        class:travel__routes--sliding={sliding !== AT_REST}
        style:transform="translateX({shift}{PERCENT})"
        ontransitionend={settle}
      >
        <!-- Keyed by place in the loop, not by slot: a card keeps its own element as the strip
             re-centres, so nothing of one route's colour is left fading out on another's. -->
        {#each strip as entry, slot (offset + slot)}
          {@render card(entry)}
        {/each}
      </ul>
    </div>
    <!-- Outside the window, so it stands in the gutter past the rail rather than over a card. -->
    <button type="button" class="travel__more" aria-label={labels.travel_more} onpointerdown={press} onpointercancel={forget} onclick={tapMore}>
      <Icon name={MORE_ICON} />
    </button>
    </div>
  {:else}
    <ul class="travel__routes">
      {#each strip as entry (entry.route.entity_id)}
        {@render card(entry)}
      {/each}
    </ul>
  {/if}
</section>

{#if opened && openedEntry}
  {@const leave = openedEntry.route.departure_entity_id ? departureAt(ha.state(openedEntry.route.departure_entity_id)) : null}
  <TravelWindow
    route={openedEntry.route}
    minutes={openedEntry.minutes}
    {leave}
    home={leavesFromHome(openedEntry.route, read)}
    thresholds={options}
    sendEvent={options.send_event}
    maps={options.maps}
    {labels}
    from={opened.from}
    onlanding={() => (away = null)}
    onclose={closed}
  />
{/if}

<style>
  .travel {
    display: flex;
    flex-direction: column;
  }

  /* The pair is two halves of the card's width, each as wide whatever it shows. A lone route
   * stands in the middle. */
  .travel__routes {
    display: flex;
    justify-content: center;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .travel__route {
    flex: 0 0 calc(100% / var(--travel-showing));
    min-width: 0;
    padding: var(--travel-route-padding);
    text-align: center;
  }

  .travel__route--away {
    visibility: hidden;
  }

  /* The whole card is what a hold opens, drawn as nothing but what it holds. */
  .travel__card {
    position: relative;
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: inherit;
    cursor: pointer;
    -webkit-touch-callout: none;
    user-select: none;
  }

  /* The reticle stands a little off the card above and below, and no wider than its half of the
   * rail, so it never reaches over the card beside it. */
  .travel__reticle {
    position: absolute;
    inset: calc(-1 * var(--travel-reticle-reach)) 0;
    pointer-events: none;
  }

  .travel__name,
  .travel__minutes,
  .travel__leave {
    display: block;
  }

  /* The strip is the pair with a card either side, laid out so the pair fills the window. */
  .travel__window {
    position: relative;
    overflow: hidden;
  }

  .travel__routes--strip {
    justify-content: flex-start;
    width: calc(100% * var(--travel-strip-length) / var(--travel-showing));
  }

  .travel__routes--strip > .travel__route {
    flex-basis: calc(100% / var(--travel-strip-length));
  }

  .travel__routes--sliding {
    transition: transform var(--travel-slide) ease-in-out;
  }

  .travel__carousel {
    position: relative;
  }

  /* There is more past the right-hand card, and a tap brings it in. It stands just outside the
   * rail, clear of the right-hand card's unit, and reaches further than it shows, so a finger finds
   * it without having to land on the mark itself. */
  .travel__more {
    position: absolute;
    top: 50%;
    left: 100%;
    padding: var(--travel-more-reach);
    border: 0;
    background: none;
    color: var(--color-dim);
    font: inherit;
    font-size: var(--travel-more-size);
    line-height: 1;
    cursor: pointer;
    transform: translateY(-50%);
  }

  .travel__name {
    overflow: hidden;
    color: var(--color-muted);
    font-size: var(--travel-name-size);
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .travel__minutes,
  .travel__leave-time {
    transition: color var(--colour-fade);
  }

  .travel__route--soon {
    --travel-urgent: var(--color-primary);
  }

  .travel__route--imminent {
    --travel-urgent: var(--color-secondary);
  }

  .travel__route--soon :is(.travel__minutes, .travel__leave-time),
  .travel__route--imminent :is(.travel__minutes, .travel__leave-time) {
    color: var(--travel-urgent);
  }

  .travel__route--soon :is(.travel__minutes, .travel__leave-time) {
    animation: travel-breathe var(--travel-breathe) ease-in-out var(--travel-phase) infinite;
  }

  .travel__route--imminent :is(.travel__minutes, .travel__leave-time) {
    animation: travel-pulse var(--travel-pulse) ease-in-out var(--travel-phase) infinite;
  }

  /* Both fade rather than dim: an icon's paring outline is the background's colour, and dimming
   * would darken it into a black rim, where fading takes the icon and its outline down together. */
  @keyframes travel-breathe {
    50% {
      opacity: var(--travel-breathe-opacity);
    }
  }

  /* Down nearly to nothing and back, with a glow of its own colour at the top of each beat. */
  @keyframes travel-pulse {
    0%,
    100% {
      text-shadow: 0 0 var(--travel-pulse-glow) var(--travel-urgent);
    }

    50% {
      opacity: var(--travel-pulse-opacity);
      text-shadow: none;
    }
  }

  /* The digits are centred under the name on their own, with the sign hung off their left and the
   * unit off their right. The room they hang into is kept on both sides, wide enough for the wider
   * of the two, so neither reaches the next card. */
  .travel__minutes {
    padding-inline: var(--travel-unit-room);
    font-size: var(--travel-minutes-size);
    font-weight: var(--weight-thin);
    line-height: 1.1;
  }

  /* The icon stands in the number's place, as tall as its figures. Its glyphs are filled shapes
   * drawn far heavier than the thin figures beside it, so an outline in the background's colour
   * pares every edge back towards the figures' weight. */
  .travel__now {
    display: inline-block;
    line-height: 1;
    -webkit-text-stroke: var(--travel-icon-pare) var(--color-background);
  }

  /* Gone is not something to act on, so it rests in grey like everything else at rest. */
  .travel__now--departed {
    color: var(--color-muted);
  }

  /* The sign hangs off the figure's left as the unit hangs off its right: no width of its own,
   * its glyph running out leftwards, so the digits alone are centred under the name. */
  .travel__sign {
    display: inline-flex;
    justify-content: flex-end;
    width: 0;
    white-space: nowrap;
  }

  /* No width of its own, so it sits on the figure's baseline without moving the figure over. */
  .travel__unit {
    display: inline-block;
    width: 0;
    text-indent: var(--travel-unit-indent);
    white-space: nowrap;
    color: var(--color-muted);
    font-size: var(--travel-name-size);
    font-weight: var(--weight-light);
  }

  .travel__leave {
    color: var(--color-muted);
    font-size: var(--travel-detail-size);
  }

  .travel__leave-time {
    color: var(--color-foreground);
  }

  /* The words and the unseen card share one cell, the words centred in it. */
  .travel__idle {
    display: grid;
  }

  .travel__idle > * {
    grid-area: 1 / 1;
  }

  .travel__routes--stand-in {
    visibility: hidden;
  }

  .travel__idle-text {
    align-self: center;
    margin: 0;
    color: var(--color-dim);
    font-size: var(--travel-name-size);
    text-align: center;
  }
</style>
