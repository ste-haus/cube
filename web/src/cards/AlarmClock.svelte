<script lang="ts">
  import Icon from "../lib/Icon.svelte";
  import { formatTime, parseTime, stepTime, type StepDirection, type TimeOfDay, type TimePart } from "../lib/alarm";
  import { pending } from "../lib/pending.svelte";
  import { ha } from "../lib/state.svelte";
  import { WIPE_MS, wipeFromStart } from "../lib/wipe";
  import type { Alarm, Labels } from "../lib/types";

  /*
   * An alarm clock: the bell arms and disarms it, and while it is armed the time it goes off at
   * is shown beside it, set with a wheel above and below each half.
   *
   * Pressing a wheel moves the time on the panel at once, and sends it to Home Assistant once the
   * presses stop. Sending each press would make every one a round trip, and the next press would
   * land on whatever the last answer was rather than on what is showing. Once sent, the time
   * breathes until Home Assistant says it has it, and goes back to Home Assistant's time if it
   * never does.
   *
   * The time comes out of the bell and goes back into it. Arming it slides the bell from the middle
   * over to the left, making room, and then the time is written in left to right away from it.
   * Disarming erases the time right to left back into the bell, and then the bell slides back to
   * the middle. The bell eases from grey to the primary colour as it goes.
   */

  const COMMIT_DELAY_MS = 1500;
  const BELL_ICON = "mdi:alarm";
  const UP_ICON = "mdi:chevron-up";
  const DOWN_ICON = "mdi:chevron-down";
  const UP: StepDirection = 1;
  const DOWN: StepDirection = -1;
  const PARTS: TimePart[] = ["hours", "minutes"];
  const SEPARATOR = ":";
  const PAD_WIDTH = 2;
  const PAD = "0";
  const PLACEHOLDER = "--";
  // The bell's slide takes the share of the wipe a row's room does, and the time's wipe the rest.
  const SLIDE_SHARE = 0.35;
  const SLIDE_MS = Math.round(WIPE_MS * SLIDE_SHARE);
  const TIME_WIPE_MS = WIPE_MS - SLIDE_MS;
  const HALF = 2;

  let { alarm, labels }: { alarm: Alarm; labels: Labels } = $props();

  let draft = $state<TimeOfDay | null>(null);
  let sent = $state(false);
  let timer: number | null = null;
  let slotWidth = $state(0);

  const armed = $derived(ha.isOn(alarm.enabled_entity_id));
  const held = $derived(parseTime(ha.state(alarm.time_entity_id)));
  const shown = $derived(draft ?? held);
  const waiting = $derived(sent && pending.isPending(alarm.time_entity_id));

  /* The answer, or the lack of one, is what ends a draft: from then on the time is Home
   * Assistant's again. */
  $effect(() => {
    if (sent && !pending.isPending(alarm.time_entity_id)) {
      draft = null;
      sent = false;
    }
  });

  $effect(() => () => stopTimer());

  function stopTimer() {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  function step(part: TimePart, direction: StepDirection) {
    if (shown === null) {
      return;
    }

    draft = stepTime(shown, part, direction, alarm.minute_step);
    sent = false;

    stopTimer();
    timer = window.setTimeout(commit, COMMIT_DELAY_MS);
  }

  function commit() {
    timer = null;

    if (draft === null) {
      return;
    }

    if (held !== null && formatTime(draft) === formatTime(held)) {
      draft = null;
      return;
    }

    sent = pending.set(alarm.time_entity_id, formatTime(draft));
  }

  function digits(time: TimeOfDay | null, part: TimePart): string {
    return time === null ? PLACEHOLDER : String(time[part]).padStart(PAD_WIDTH, PAD);
  }
</script>

<section class="alarm">
  <h2 class="panel-title">{labels.alarm}</h2>

  <!-- Disarmed, it is the bell and nothing else, since a time that will not go off is not worth
       reading, and it sits in the middle. Armed, the bell sits to the left with the time beside it.
       The row is always laid out armed; disarmed, the bell is carried over to the middle of it. -->
  {#snippet time()}
    <div class="alarm__time" class:alarm__time--waiting={waiting}>
      {#each PARTS as part, index (part)}
        {#if index > 0}<span class="alarm__separator">{SEPARATOR}</span>{/if}
        <div class="alarm__part">
          <button type="button" class="alarm__wheel" aria-label="{part} up" onclick={() => step(part, UP)}>
            <Icon name={UP_ICON} />
          </button>
          <span class="alarm__digits">{digits(shown, part)}</span>
          <button type="button" class="alarm__wheel" aria-label="{part} down" onclick={() => step(part, DOWN)}>
            <Icon name={DOWN_ICON} />
          </button>
        </div>
      {/each}
    </div>
  {/snippet}

  <div
    class="alarm__body"
    class:alarm__body--armed={armed}
    style:--alarm-slot="{slotWidth}px"
    style:--alarm-slide="{SLIDE_MS}ms"
    style:--alarm-slide-delay="{armed ? 0 : TIME_WIPE_MS}ms"
    style:--alarm-half={HALF}
  >
    <button
      type="button"
      class="alarm__bell"
      class:alarm__bell--waiting={pending.isPending(alarm.enabled_entity_id)}
      aria-pressed={armed}
      onclick={() => pending.send(alarm.enabled_entity_id)}
    >
      <Icon name={BELL_ICON} />
    </button>

    <div class="alarm__slot" bind:clientWidth={slotWidth}>
      <!-- Never seen or pressed: it keeps the time's room, width and height, whether or not the
           time is there, so the card never changes size and the bell has a fixed place to go. -->
      <div class="alarm__sizer" aria-hidden="true" inert>{@render time()}</div>

      {#if armed}
        <div
          class="alarm__shown"
          in:wipeFromStart={{ duration: TIME_WIPE_MS, delay: SLIDE_MS }}
          out:wipeFromStart={{ duration: TIME_WIPE_MS }}
        >
          {@render time()}
        </div>
      {/if}
    </div>
  </div>
</section>

<style>
  .alarm__body {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--alarm-gap);
  }

  /* The time and its stand-in share one cell. */
  .alarm__slot {
    display: grid;
  }

  .alarm__sizer,
  .alarm__shown {
    grid-area: 1 / 1;
  }

  .alarm__sizer {
    visibility: hidden;
  }

  button {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    -webkit-touch-callout: none;
  }

  /* Disarmed, carried from its place at the left of the row over to the middle of it: half the
   * time's room and half the gap. The delay, set with the state, is what orders the steps: arming
   * slides first and wipes after, disarming wipes first and slides after. */
  .alarm__bell {
    color: var(--color-dim);
    font-size: var(--alarm-bell-size);
    line-height: 1;
    transform: translateX(calc((var(--alarm-slot) + var(--alarm-gap)) / var(--alarm-half)));
    transition:
      transform var(--alarm-slide) cubic-bezier(0.65, 0, 0.35, 1) var(--alarm-slide-delay),
      color var(--colour-fade) ease var(--alarm-slide-delay);
  }

  /* Armed is the card's one colour: it is what decides whether anyone is woken. */
  .alarm__body--armed .alarm__bell {
    color: var(--color-primary);
    transform: none;
  }

  .alarm__time {
    color: var(--color-foreground);
    display: flex;
    align-items: center;
    font-size: var(--alarm-time-size);
    font-weight: var(--weight-thin);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .alarm__part {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .alarm__wheel {
    color: var(--color-muted);
    font-size: var(--alarm-wheel-size);
    line-height: 1;
  }

  /* Asked Home Assistant, waiting on the answer: the floorplan reticle's breathe. */
  .alarm__bell--waiting,
  .alarm__time--waiting .alarm__digits {
    animation: alarm-waiting var(--waiting-breathe) ease-in-out infinite;
  }

  @keyframes alarm-waiting {
    50% {
      opacity: var(--waiting-opacity);
    }
  }
</style>
