<script lang="ts">
  import HoldQuestion from "./HoldQuestion.svelte";
  import PanelWindow from "./PanelWindow.svelte";
  import { SWITCH_OFF, SWITCH_ON, confirmation, flip, offColour, stillAsking } from "../lib/critical";
  import { wantsLightType } from "../lib/incidents";
  import { PANE_RESET_MS } from "../lib/panes.svelte";
  import { pending } from "../lib/pending.svelte";
  import type { Box } from "../lib/picture";
  import { ha } from "../lib/state.svelte";
  import { PULSE_MS, beatPhase } from "../lib/travel";
  import type { CriticalSwitch, Labels } from "../lib/types";
  import { strikeOut, writeIn } from "../lib/wipe";

  /*
   * A critical switch, in a window opened out of the card it is held behind.
   *
   * It is one switch: a pill of a track with its two words, on and off, and a solid pill of a
   * thumb under the one Home Assistant says it is, primary for on and the colour the card takes
   * while it is off for off, sliding across as the state changes. Nothing moves before Home
   * Assistant says so. A tap anywhere on it flips it.
   *
   * Flipping it on, while it is off, sends at once, since turning it back on is never the mistake.
   * Flipping it off, while it is on, does not send: the switch wipes out and a question wipes in,
   * and while it is asked the band takes the card's off colour and the brackets pulse in it, as an
   * imminent trip's do: what the answer will do is about to happen, not something left off. The answers are two buttons, each
   * a pill the switch's height, and the one that turns it off is held, not tapped: it fills from
   * the left in the off colour over `hold_seconds`, and letting go or sliding off before it is full
   * does nothing. The question stands for as long as the switch is still on, so if it goes off by
   * some other way meanwhile, the switch wipes back in.
   *
   * The window's whole job is the one choice, so it folds back into the card as soon as the
   * choice is made, and the card breathes the reticle until Home Assistant answers. A tap on the
   * glass around it, or a minute untouched, closes it having changed nothing.
   */

  const MILLISECONDS = "ms";
  const PULSE_LOW = "var(--travel-pulse-opacity)";
  const UNCOLOURED_OFF = "var(--color-muted)";
  const SIDES = [SWITCH_ON, SWITCH_OFF] as const;
  const MILLISECONDS_PER_SECOND = 1000;

  let {
    critical,
    labels,
    advisoryColour,
    from,
    onclose,
  }: {
    critical: CriticalSwitch;
    labels: Labels;
    /** The colour a card advises in, which an advising switch's OFF and question take. */
    advisoryColour: string;
    from: Box;
    onclose: () => void;
  } = $props();

  let panel = $state<PanelWindow | null>(null);
  let asking = $state(false);

  const switchState = $derived(ha.state(critical.entity_id));
  const question = $derived(confirmation(critical, labels.critical_switch_confirm));
  const colour = $derived(offColour(critical, advisoryColour));
  const holdMs = $derived(critical.hold_seconds * MILLISECONDS_PER_SECOND);
  const words = $derived({ [SWITCH_ON]: labels.critical_switch_on, [SWITCH_OFF]: labels.critical_switch_off });

  // Phased by the page's clock, as every pulse on the panel is, so they keep time.
  const beat = $derived(
    asking ? { period: `${PULSE_MS}${MILLISECONDS}`, phase: beatPhase(PULSE_MS), low: PULSE_LOW } : null,
  );

  $effect(() => {
    if (asking && !stillAsking(switchState)) {
      asking = false;
    }
  });

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

  function send(): void {
    if (pending.send(critical.entity_id)) {
      panel?.close();
    }
  }

  function tap(): void {
    if (pending.isPending(critical.entity_id)) {
      return;
    }

    const does = flip(switchState);
    if (does === "ask") {
      asking = true;
    } else if (does === "send") {
      send();
    }
  }

  // Only while the question still stands: an answer held as it was wiped away sends nothing.
  function turnOff(): void {
    if (!asking) {
      return;
    }

    asking = false;

    if (stillAsking(switchState)) {
      send();
    }
  }
</script>

{#snippet band()}
  <h2 class="critical-switch-window__title">{critical.label}</h2>
{/snippet}

<PanelWindow
  bind:this={panel}
  {from}
  label={critical.label}
  width="var(--critical-switch-window-width)"
  band="solid"
  tint={asking ? colour : null}
  lightType={asking && colour !== null && wantsLightType(colour)}
  bracketColor={asking ? colour : null}
  {beat}
  interactive
  header={band}
  {onclose}
>
  <div
    class="critical-switch-window"
    style:--critical-switch-off-colour={colour ?? UNCOLOURED_OFF}
    onpointerdowncapture={restartIdle}
  >
    <!-- Both views share the one cell, and the question's room is always held, so the window is
         as big as the larger from the start and never reflows. -->
    <div class="critical-switch-window__view critical-switch-window__view--room" aria-hidden="true" inert>
      <HoldQuestion
        {question}
        cancelLabel={labels.critical_switch_cancel}
        confirmLabel={labels.critical_switch_turn_off}
        colour={colour ?? UNCOLOURED_OFF}
        {holdMs}
        disabled
        oncancel={() => {}}
        onconfirm={() => {}}
      />
    </div>

    {#if !asking}
      <div class="critical-switch-window__view" in:writeIn out:strikeOut>
        <button
          type="button"
          class="critical-switch-window__switch"
          class:critical-switch-window__switch--on={switchState === SWITCH_ON}
          class:critical-switch-window__switch--off={switchState === SWITCH_OFF}
          role="switch"
          aria-checked={switchState === SWITCH_ON}
          aria-label={critical.label}
          disabled={flip(switchState) === "nothing"}
          onclick={tap}
        >
          <span class="critical-switch-window__thumb" aria-hidden="true"></span>
          {#each SIDES as side (side)}
            <span class="critical-switch-window__side" class:critical-switch-window__side--lit={switchState === side}>
              {words[side]}
            </span>
          {/each}
        </button>
      </div>
    {:else}
      <div class="critical-switch-window__view" in:writeIn out:strikeOut>
        <HoldQuestion
          {question}
          cancelLabel={labels.critical_switch_cancel}
          confirmLabel={labels.critical_switch_turn_off}
          colour={colour ?? UNCOLOURED_OFF}
          {holdMs}
          oncancel={() => (asking = false)}
          onconfirm={turnOff}
        />
      </div>
    {/if}
  </div>
</PanelWindow>

<style>
  .critical-switch-window__title {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: var(--title-size);
    font-weight: var(--weight-medium);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .critical-switch-window {
    display: grid;
    padding: var(--critical-switch-window-padding);
  }

  .critical-switch-window__view {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--critical-switch-window-gap);
    grid-area: 1 / 1;
  }

  .critical-switch-window__view--room {
    visibility: hidden;
  }

  /*
   * The switch: a pill of a track drawn in a line, its two words side by side, with a solid pill
   * of a thumb set inside it, a margin all round, under the word Home Assistant says, that word
   * dark on it. It is one button, so a tap anywhere on it flips it, and the thumb slides across
   * rather than jumping. Set in from the track, the thumb never meets its line.
   */
  .critical-switch-window__switch {
    --critical-switch-lit-colour: transparent;

    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: var(--critical-switch-control-width);
    height: var(--critical-switch-control-height);
    padding: 0;
    border: var(--critical-switch-track) solid var(--color-dim);
    border-radius: var(--critical-switch-round);
    background: transparent;
    color: var(--color-muted);
    font: inherit;
    font-size: var(--critical-switch-control-size);
    font-weight: var(--weight-light);
    cursor: pointer;
  }

  .critical-switch-window__switch:disabled {
    cursor: default;
    opacity: var(--waiting-opacity);
  }

  .critical-switch-window__switch--on {
    --critical-switch-lit-colour: var(--color-primary);
  }

  .critical-switch-window__switch--off {
    --critical-switch-lit-colour: var(--critical-switch-off-colour);
  }

  .critical-switch-window__thumb {
    position: absolute;
    top: var(--critical-switch-inset);
    bottom: var(--critical-switch-inset);
    left: var(--critical-switch-inset);
    width: calc(50% - var(--critical-switch-inset));
    border-radius: var(--critical-switch-round);
    background: var(--critical-switch-lit-colour);
    opacity: 0;
    transition:
      transform var(--critical-switch-slide) cubic-bezier(0.65, 0, 0.35, 1),
      background-color var(--colour-fade),
      opacity var(--colour-fade);
  }

  .critical-switch-window__switch--on .critical-switch-window__thumb,
  .critical-switch-window__switch--off .critical-switch-window__thumb {
    opacity: 1;
  }

  /* Its own width across, which is from the margin on the left to the middle on the right. */
  .critical-switch-window__switch--off .critical-switch-window__thumb {
    transform: translateX(100%);
  }

  .critical-switch-window__side {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color var(--colour-fade);
  }

  .critical-switch-window__side--lit {
    color: var(--color-background);
    font-weight: var(--weight-regular);
  }
</style>
