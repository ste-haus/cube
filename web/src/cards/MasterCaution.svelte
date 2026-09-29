<script lang="ts">
  import { fireEvent } from "../lib/api";
  import { alertTime, elapsedLabel, masterLook, readAlerts, tierSince } from "../lib/mcw";
  import { ha } from "../lib/state.svelte";
  import type { AlertTier, Labels, Mcw } from "../lib/types";

  /*
   * Master warning and master caution, side by side across the top of every face.
   *
   * Mounted beside the cube rather than on a face, so it stays put while the cube turns and is
   * the same on every side. A master that is lit wants attention; one that is dark has only
   * cleared alerts, and is still there to be asked what they are; one with no alerts at all is
   * not there. Tapping a master lists its tier's alerts. Holding a lit one fires the clear event
   * with its tier. The clear is Home Assistant's to record, so the master goes dark on every panel
   * at once, and only when the state stream says it has.
   */

  let { mcw, labels }: { mcw: Mcw; labels: Labels } = $props();

  const ALERTS_ATTRIBUTE = "alerts";
  const TIER_FIELD = "tier";
  const MILLISECONDS_PER_SECOND = 1000;
  const PRIMARY_BUTTON = 0;
  const WORD_BREAK = " ";
  const HALF = 2;
  const PIXELS = "px";

  // The window's choreography, handed to the stylesheet so the two cannot drift apart. Opening:
  // the corner brackets fly out of the master to the corners of the header, then the header
  // wipes in between them while the rest of the window drops down with the bottom brackets.
  // Closing folds the window back up into the header, holds there a beat, then the brackets fly
  // home as the header wipes out.
  const FLY_MS = 300;
  const WIPE_MS = 200;
  const EXPAND_MS = 240;
  const HOLD_MS = 150;
  // A lit warning blinks hard; a lit caution breathes, slower and smoother, so the tier reads
  // from across the room by its rhythm as well as its colour. A list's brackets keep time with
  // their master.
  const FLASH_MS = 1000;
  const BREATHE_MS = 3000;
  const MILLISECONDS = "ms";
  const HEADER_SELECTOR = ".mcw-list__header";

  const TIERS: AlertTier[] = ["warning", "caution"];
  const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];

  const masters = $derived(
    TIERS.map((tier) => {
      const warning = tier === "warning";
      const entityId = warning ? mcw.warning_entity_id : mcw.caution_entity_id;
      const alerts = readAlerts(ha.attribute(entityId, ALERTS_ATTRIBUTE));

      return {
        tier,
        alerts,
        look: masterLook(ha.isOn(entityId), alerts),
        label: warning ? labels.master_warning : labels.master_caution,
        color: warning ? mcw.warning_color : mcw.caution_color,
      };
    }),
  );

  let listing = $state<AlertTier | null>(null);
  let holding = $state<AlertTier | null>(null);
  let holdTimer: number | null = null;
  // Where the list was asked for from, so it can unfold out of the master that was tapped and
  // fold back into it.
  let origin: { x: number; y: number } | null = null;
  let windowElement = $state<HTMLElement | null>(null);
  const buttons: Partial<Record<AlertTier, HTMLElement>> = {};
  let closing = $state(false);
  let closeTimer: number | null = null;
  let now = $state(new Date());

  const listed = $derived(masters.find((master) => master.tier === listing && master.look !== "hidden") ?? null);
  const open = $derived(listed !== null);
  const since = $derived(listed ? tierSince(listed.alerts) : null);
  // What the brackets do: keep time with a lit master, or sit dimmed with a dark one.
  const pulse = $derived(listed ? (listed.look === "lit" ? listed.tier : "dark") : null);

  // The clock in the header only ticks while there is a header to show it in.
  $effect(() => {
    if (!open) {
      return;
    }

    now = new Date();
    const ticker = window.setInterval(() => (now = new Date()), MILLISECONDS_PER_SECOND);

    return () => window.clearInterval(ticker);
  });

  // A list whose alerts have all gone is closed, rather than reopening by itself when one returns.
  $effect(() => {
    if (listing !== null && listed === null) {
      settle();
    }
  });

  $effect(() => {
    if (windowElement) {
      measure(windowElement);
    }
  });

  function press(event: PointerEvent, tier: AlertTier, lit: boolean) {
    if (event.button !== PRIMARY_BUTTON) {
      return;
    }

    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    abandon();

    // A dark master has nothing to clear, so pressing it is only ever a tap.
    holding = lit ? tier : null;
    holdTimer = window.setTimeout(() => {
      holdTimer = null;
      holding = null;

      if (lit) {
        void fireEvent(mcw.clear_event, { [TIER_FIELD]: tier });
      }
    }, mcw.hold_seconds * MILLISECONDS_PER_SECOND);
  }

  /** Let go before the hold ran out: a tap. After it, the hold has already done its work. */
  function release(event: PointerEvent, tier: AlertTier) {
    if (holdTimer === null) {
      return;
    }

    abandon();
    settle();

    const box = (event.currentTarget as Element).getBoundingClientRect();
    origin = { x: box.left + box.width / HALF, y: box.top + box.height / HALF };
    listing = tier;
  }

  /** Folds the window back into its master, and only then lets it go. */
  function close() {
    if (closing) {
      return;
    }

    // Measured again, since the window may have grown or shrunk while it was open.
    if (windowElement) {
      measure(windowElement);
    }

    closing = true;
    closeTimer = window.setTimeout(settle, EXPAND_MS + HOLD_MS + FLY_MS);
  }

  /** Gone at once, with no fold: for a list that has nothing left to show, or a new one opening. */
  function settle() {
    if (closeTimer !== null) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }

    closing = false;
    listing = null;
  }

  /**
   * Tells the corner brackets where they fly from and back to, the tapped master's middle
   * measured from the window's top left, and how big the window is, so each can work out its
   * own way there.
   */
  function measure(node: HTMLElement) {
    const box = node.getBoundingClientRect();
    const start = origin ?? { x: box.left + box.width / HALF, y: box.top + box.height / HALF };

    node.style.setProperty("--mcw-from-x", `${start.x - box.left}${PIXELS}`);
    node.style.setProperty("--mcw-from-y", `${start.y - box.top}${PIXELS}`);
    node.style.setProperty("--mcw-window-width", `${box.width}${PIXELS}`);
    node.style.setProperty("--mcw-window-height", `${box.height}${PIXELS}`);

    // How far into its beat the master is right now, so brackets starting now start there too.
    const beat = listing ? buttons[listing]?.getAnimations()[0] : undefined;
    const period = listing === "warning" ? FLASH_MS : BREATHE_MS;
    const phase = Number(beat?.currentTime ?? 0) % period;
    node.style.setProperty("--mcw-pulse-phase", `${-phase}${MILLISECONDS}`);

    const header = node.querySelector(HEADER_SELECTOR)?.getBoundingClientRect();
    node.style.setProperty("--mcw-header-height", `${header?.height ?? box.height}${PIXELS}`);
  }

  function abandon() {
    if (holdTimer !== null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }

    holding = null;
  }
</script>

<div
  class="mcw"
  style:--mcw-hold="{mcw.hold_seconds}s"
  style:--mcw-flash="{FLASH_MS}{MILLISECONDS}"
  style:--mcw-breathe="{BREATHE_MS}{MILLISECONDS}"
>
  {#each masters as master (master.tier)}
    {#if master.look === "hidden"}
      <span class="mcw__slot" aria-hidden="true"></span>
    {:else}
      <button
        type="button"
        bind:this={buttons[master.tier]}
        class="mcw__master mcw__master--{master.tier} mcw__master--{master.look}"
        class:mcw__master--holding={holding === master.tier}
        style:--mcw-color={master.color}
        onpointerdown={(event) => press(event, master.tier, master.look === "lit")}
        onpointerup={(event) => release(event, master.tier)}
        onpointercancel={abandon}
        oncontextmenu={(event) => event.preventDefault()}
      >
        {#each master.label.split(WORD_BREAK) as word, index (index)}
          <span class="mcw__word">{word}</span>
        {/each}
      </button>
    {/if}
  {/each}
</div>

{#if listed}
  <!-- Anywhere on the glass closes it: a wall panel has no keyboard, and nothing in the list is
       itself something to press. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="mcw-list mcw-list--pulse-{pulse}"
    class:mcw-list--closing={closing}
    style:--mcw-color={listed.color}
    style:--mcw-fly="{FLY_MS}{MILLISECONDS}"
    style:--mcw-expand="{EXPAND_MS}{MILLISECONDS}"
    style:--mcw-wipe="{WIPE_MS}{MILLISECONDS}"
    style:--mcw-pause="{HOLD_MS}{MILLISECONDS}"
    style:--mcw-flash="{FLASH_MS}{MILLISECONDS}"
    style:--mcw-breathe="{BREATHE_MS}{MILLISECONDS}"
    onclick={close}
  >
    <div class="mcw-list__window" bind:this={windowElement}>
      {#each CORNERS as corner (corner)}
        <span class="mcw-list__bracket mcw-list__bracket--{corner}" aria-hidden="true"></span>
      {/each}

      <div class="mcw-list__panel" role="dialog" aria-label={listed.label}>
        <header class="mcw-list__header">
          <h2 class="mcw-list__title">{listed.label}</h2>
          {#if since}
            <span class="mcw-list__elapsed">{elapsedLabel(since, now)}</span>
          {/if}
        </header>

        <ul class="mcw-list__alerts">
          {#each listed.alerts as alert (alert.entity_id)}
            <li class="mcw-list__alert" class:mcw-list__alert--cleared={alert.cleared}>
              <span class="mcw-list__message">{alert.message}</span>
              {#if alert.cleared}
                <span class="mcw-list__ack">{labels.alert_cleared}</span>
              {/if}
              <span class="mcw-list__time">{alertTime(alert.triggered)}</span>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  </div>
{/if}

<style>
  .mcw {
    --mcw-width: 8.5rem;
    --mcw-height: 3.6rem;
    --mcw-gap: 2.5rem;
    --mcw-radius: 0.35rem;
    --mcw-border: 2px;
    --mcw-dark-opacity: 0.45;
    --mcw-glow: 1.2rem;
    /* Where a lit master's beat dims to, and where a dark one's brackets sit. */
    --mcw-dim-brightness: 0.55;

    position: fixed;
    top: 1.2vh;
    left: 50%;
    /* Over the announcement overlay and its transcript: a warning is not something to hide
     * behind whatever is being said. */
    z-index: 6;
    display: grid;
    grid-template-columns: repeat(2, var(--mcw-width));
    gap: var(--mcw-gap);
    transform: translateX(-50%);
    /* The empty slots, and the gap between the masters, are not there to be pressed. */
    pointer-events: none;
  }

  .mcw__slot {
    height: var(--mcw-height);
  }

  .mcw__master {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: var(--mcw-height);
    overflow: hidden;
    padding: 0;
    border: var(--mcw-border) solid var(--mcw-color);
    border-radius: var(--mcw-radius);
    background: transparent;
    color: var(--mcw-color);
    font: inherit;
    font-weight: var(--weight-medium);
    font-size: 1rem;
    line-height: 1.15;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
    pointer-events: auto;
    touch-action: none;
    -webkit-touch-callout: none;
  }

  .mcw__master--lit {
    background: var(--mcw-color);
    color: var(--color-background);
    box-shadow: 0 0 var(--mcw-glow) var(--mcw-color);
    animation: mcw-flash var(--mcw-flash) steps(1, end) infinite;
  }

  .mcw__master--lit.mcw__master--caution {
    animation: mcw-breathe var(--mcw-breathe) ease-in-out infinite;
  }

  .mcw__master--dark {
    opacity: var(--mcw-dark-opacity);
  }

  .mcw__word {
    position: relative;
  }

  /* The hold filling the master from the left, so it is plain how long is left to go. */
  .mcw__master::before {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--color-background);
    opacity: 0.4;
    transform: scaleX(0);
    transform-origin: left;
  }

  .mcw__master--holding {
    animation: none;
  }

  .mcw__master--holding::before {
    animation: mcw-hold var(--mcw-hold) linear forwards;
  }

  @keyframes mcw-flash {
    50% {
      filter: brightness(var(--mcw-dim-brightness));
      box-shadow: none;
    }
  }

  @keyframes mcw-breathe {
    50% {
      filter: brightness(var(--mcw-dim-brightness));
      box-shadow: 0 0 0 transparent;
    }
  }

  @keyframes mcw-hold {
    to {
      transform: scaleX(1);
    }
  }

  /*
   * The list opens the way a readout comes up. The corner brackets fly out of the tapped master
   * to the corners of where the header will be, the header wipes in between them, and then the
   * rest of the window drops down with the bottom pair. Closing folds the window back up into
   * its header, holds there a moment, and then the brackets fly home as the header wipes out.
   */
  .mcw-list {
    --mcw-bracket-size: 1.6rem;
    --mcw-bracket-weight: 3px;
    --mcw-bracket-inset: -6px;
    --mcw-shimmer-time: 5s;
    --mcw-shimmer-strength: 0.3;
    --mcw-dim-brightness: 0.55;
    /* One curve both ways, so flying home takes as long, and feels as long, as flying out. */
    --mcw-flight: cubic-bezier(0.65, 0, 0.35, 1);
    --mcw-opened: calc(var(--mcw-fly) + var(--mcw-expand));
    --mcw-leaving: calc(var(--mcw-expand) + var(--mcw-pause));

    position: fixed;
    inset: 0;
    z-index: 7;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 0.65);
    animation: mcw-fade var(--mcw-fly) ease-out both;
  }

  .mcw-list--closing {
    animation: mcw-fade-out var(--mcw-fly) ease-in var(--mcw-leaving) both;
  }

  .mcw-list__window {
    --mcw-from-x: 0px;
    --mcw-from-y: 0px;
    --mcw-window-width: 0px;
    --mcw-window-height: 0px;
    --mcw-header-height: 0px;
    /* How much of the window lies under the header, which is what folds away. */
    --mcw-body-height: calc(var(--mcw-window-height) - var(--mcw-header-height));
    --mcw-pulse-phase: 0ms;

    position: relative;
    min-width: 40vw;
    max-width: 70vw;
  }

  .mcw-list__bracket {
    /* Where each bracket rests while only the header is showing: the top pair are already
     * home, and the bottom pair sit up at the header's bottom edge. */
    --mcw-header-only: translate(0, 0);

    position: absolute;
    z-index: 1;
    width: var(--mcw-bracket-size);
    height: var(--mcw-bracket-size);
    border: 0 solid var(--mcw-color);
    pointer-events: none;
    /* The second only holds forwards, so while the first is flying it is not also applied. */
    animation:
      mcw-fly var(--mcw-fly) var(--mcw-flight) both,
      mcw-bracket-open var(--mcw-expand) ease-out var(--mcw-fly) forwards;
  }

  .mcw-list--closing .mcw-list__bracket {
    animation:
      mcw-bracket-close var(--mcw-expand) ease-in both,
      mcw-return var(--mcw-fly) var(--mcw-flight) var(--mcw-leaving) forwards;
  }

  /* In step with the lit master, which is where the phase comes from. */
  .mcw-list--pulse-warning .mcw-list__bracket {
    animation:
      mcw-fly var(--mcw-fly) var(--mcw-flight) both,
      mcw-bracket-open var(--mcw-expand) ease-out var(--mcw-fly) forwards,
      mcw-bracket-flash var(--mcw-flash) steps(1, end) var(--mcw-pulse-phase) infinite;
  }

  .mcw-list--pulse-warning.mcw-list--closing .mcw-list__bracket {
    animation:
      mcw-bracket-close var(--mcw-expand) ease-in both,
      mcw-return var(--mcw-fly) var(--mcw-flight) var(--mcw-leaving) forwards,
      mcw-bracket-flash var(--mcw-flash) steps(1, end) var(--mcw-pulse-phase) infinite;
  }

  .mcw-list--pulse-caution .mcw-list__bracket {
    animation:
      mcw-fly var(--mcw-fly) var(--mcw-flight) both,
      mcw-bracket-open var(--mcw-expand) ease-out var(--mcw-fly) forwards,
      mcw-bracket-breathe var(--mcw-breathe) ease-in-out var(--mcw-pulse-phase) infinite;
  }

  .mcw-list--pulse-caution.mcw-list--closing .mcw-list__bracket {
    animation:
      mcw-bracket-close var(--mcw-expand) ease-in both,
      mcw-return var(--mcw-fly) var(--mcw-flight) var(--mcw-leaving) forwards,
      mcw-bracket-breathe var(--mcw-breathe) ease-in-out var(--mcw-pulse-phase) infinite;
  }

  /* A dark master's brackets hold where a lit one's dim to. */
  .mcw-list--pulse-dark .mcw-list__bracket {
    filter: brightness(var(--mcw-dim-brightness));
  }

  /* Each corner's way out is the tapped master's middle less where the corner itself sits. */
  .mcw-list__bracket--top-left {
    --mcw-start: translate(var(--mcw-from-x), var(--mcw-from-y));

    top: var(--mcw-bracket-inset);
    left: var(--mcw-bracket-inset);
    border-top-width: var(--mcw-bracket-weight);
    border-left-width: var(--mcw-bracket-weight);
  }

  .mcw-list__bracket--top-right {
    --mcw-start: translate(calc(var(--mcw-from-x) - var(--mcw-window-width)), var(--mcw-from-y));

    top: var(--mcw-bracket-inset);
    right: var(--mcw-bracket-inset);
    border-top-width: var(--mcw-bracket-weight);
    border-right-width: var(--mcw-bracket-weight);
  }

  .mcw-list__bracket--bottom-left {
    --mcw-start: translate(var(--mcw-from-x), calc(var(--mcw-from-y) - var(--mcw-window-height)));
    --mcw-header-only: translateY(calc(-1 * var(--mcw-body-height)));

    bottom: var(--mcw-bracket-inset);
    left: var(--mcw-bracket-inset);
    border-bottom-width: var(--mcw-bracket-weight);
    border-left-width: var(--mcw-bracket-weight);
  }

  .mcw-list__bracket--bottom-right {
    --mcw-start: translate(
      calc(var(--mcw-from-x) - var(--mcw-window-width)),
      calc(var(--mcw-from-y) - var(--mcw-window-height))
    );
    --mcw-header-only: translateY(calc(-1 * var(--mcw-body-height)));

    right: var(--mcw-bracket-inset);
    bottom: var(--mcw-bracket-inset);
    border-right-width: var(--mcw-bracket-weight);
    border-bottom-width: var(--mcw-bracket-weight);
  }

  /* Clipped rather than resized, so nothing inside it reflows as it opens and closes. */
  .mcw-list__panel {
    max-height: 70vh;
    overflow-y: auto;
    border: var(--mcw-border, 2px) solid var(--mcw-color);
    border-radius: 0.6rem;
    background: var(--color-background);
    animation: mcw-unfold var(--mcw-expand) ease-out var(--mcw-fly) both;
  }

  .mcw-list--closing .mcw-list__panel {
    animation:
      mcw-fold var(--mcw-expand) ease-in both,
      mcw-wipe-out var(--mcw-wipe) ease-in var(--mcw-leaving) forwards;
  }

  /* Drawn the way a lit master is, a band of the tier's colour, so it reads as what the list
   * is rather than as the first thing on it. */
  .mcw-list__header {
    position: relative;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 2rem;
    overflow: hidden;
    padding: 0.7rem 2rem;
    background: var(--mcw-color);
    color: var(--color-background);
  }

  /* A glint crossing the band now and then, so it reads as live rather than printed. */
  .mcw-list__header::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      105deg,
      transparent 40%,
      rgb(255 255 255 / var(--mcw-shimmer-strength)) 50%,
      transparent 60%
    );
    transform: translateX(-100%);
    animation: mcw-shimmer var(--mcw-shimmer-time) ease-in-out var(--mcw-opened) infinite;
    pointer-events: none;
  }

  .mcw-list__title {
    margin: 0;
    font-size: var(--title-size);
    font-weight: var(--weight-medium);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .mcw-list__elapsed {
    font-family: "Roboto Mono", monospace;
    font-size: 1.3rem;
    font-weight: var(--weight-medium);
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
  }

  .mcw-list__alerts {
    margin: 0;
    padding: 0.8rem 2rem 1.2rem;
    list-style: none;
  }

  .mcw-list__alert {
    display: flex;
    align-items: baseline;
    gap: 1.2rem;
    padding: 0.45em 0;
    /* The tier's colour is the header's and the frame's; the alerts are there to be read. */
    color: var(--color-foreground);
    font-size: var(--notice-size);
  }

  .mcw-list__alert + .mcw-list__alert {
    border-top: 1px solid var(--color-faint);
  }

  .mcw-list__message {
    flex: 1;
  }

  /* Seen to and cleared, but still happening: kept on the list, the way a cockpit keeps an
   * acknowledged message up after its master light goes out. */
  .mcw-list__alert--cleared {
    color: var(--color-dim);
  }

  .mcw-list__ack {
    flex-shrink: 0;
    padding: 0.05em 0.45em;
    border: 1px solid currentColor;
    border-radius: 0.2em;
    font-family: "Roboto Mono", monospace;
    font-size: 0.7em;
    letter-spacing: 0.15em;
  }

  .mcw-list__time {
    flex-shrink: 0;
    color: var(--color-muted);
    font-family: "Roboto Mono", monospace;
    font-size: 0.85em;
  }

  .mcw-list__alert--cleared .mcw-list__time {
    color: var(--color-dim);
  }

  /* The same beats as the masters', dimming where they dim. */
  @keyframes mcw-bracket-flash {
    50% {
      filter: brightness(var(--mcw-dim-brightness));
    }
  }

  @keyframes mcw-bracket-breathe {
    50% {
      filter: brightness(var(--mcw-dim-brightness));
    }
  }

  @keyframes mcw-fade {
    from {
      opacity: 0;
    }
  }

  @keyframes mcw-fade-out {
    to {
      opacity: 0;
    }
  }

  /* Out of the master to the corners of the header. */
  @keyframes mcw-fly {
    from {
      opacity: 0;
      transform: var(--mcw-start) scale(0.4);
    }

    30% {
      opacity: 1;
    }

    to {
      transform: var(--mcw-header-only);
    }
  }

  @keyframes mcw-bracket-open {
    from {
      transform: var(--mcw-header-only);
    }

    to {
      transform: none;
    }
  }

  @keyframes mcw-bracket-close {
    from {
      transform: none;
    }

    to {
      transform: var(--mcw-header-only);
    }
  }

  /* Home again: the way out, backwards. */
  @keyframes mcw-return {
    from {
      transform: var(--mcw-header-only);
    }

    70% {
      opacity: 1;
    }

    to {
      opacity: 0;
      transform: var(--mcw-start) scale(0.4);
    }
  }

  /*
   * The window's outline as a header strip, its right edge in the second and third points, and
   * a body under it, its bottom edge in the last two. Written as one shape so the header can
   * wipe across while the body drops, which two clips on one element cannot do.
   */
  @keyframes mcw-unfold {
    from {
      clip-path: polygon(
        0 0,
        0 0,
        0 var(--mcw-header-height),
        100% var(--mcw-header-height),
        100% var(--mcw-header-height),
        0 var(--mcw-header-height)
      );
    }

    to {
      clip-path: polygon(0 0, 100% 0, 100% var(--mcw-header-height), 100% var(--mcw-header-height), 100% 100%, 0 100%);
    }
  }

  @keyframes mcw-fold {
    from {
      clip-path: polygon(0 0, 100% 0, 100% var(--mcw-header-height), 100% var(--mcw-header-height), 100% 100%, 0 100%);
    }

    to {
      clip-path: polygon(
        0 0,
        100% 0,
        100% var(--mcw-header-height),
        100% var(--mcw-header-height),
        100% var(--mcw-header-height),
        0 var(--mcw-header-height)
      );
    }
  }

  @keyframes mcw-wipe-out {
    from {
      clip-path: polygon(
        0 0,
        100% 0,
        100% var(--mcw-header-height),
        100% var(--mcw-header-height),
        100% var(--mcw-header-height),
        0 var(--mcw-header-height)
      );
    }

    to {
      clip-path: polygon(
        0 0,
        0 0,
        0 var(--mcw-header-height),
        100% var(--mcw-header-height),
        100% var(--mcw-header-height),
        0 var(--mcw-header-height)
      );
    }
  }

  @keyframes mcw-shimmer {
    0% {
      transform: translateX(-100%);
    }

    30%,
    100% {
      transform: translateX(100%);
    }
  }
</style>
