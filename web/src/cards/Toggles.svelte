<script lang="ts">
  import Icon from "../lib/Icon.svelte";
  import { pending } from "../lib/pending.svelte";
  import { ha } from "../lib/state.svelte";
  import type { Toggle } from "../lib/types";

  /*
   * Chips that switch something. A tap switches most of them; one that asks to be held fills
   * from the left while it is, and only switches once it is full, so a brush of the hand does
   * nothing. Either way the chip carries a glint from the moment it is switched until Home
   * Assistant says it has been.
   */

  let { toggles }: { toggles: Toggle[] } = $props();

  const MILLISECONDS_PER_SECOND = 1000;
  // A chip lit, unless it names its own colour; its label lights with its icon.
  const PRIMARY = "var(--color-primary)";
  const PRIMARY_BUTTON = 0;

  const visible = $derived(toggles.filter((item) => !item.visible_when || ha.isOn(item.visible_when)));

  let holding = $state<string | null>(null);
  let holdTimer: number | null = null;

  function press(event: PointerEvent, item: Toggle) {
    if (item.hold_seconds === null || event.button !== PRIMARY_BUTTON || pending.isPending(item.entity_id)) {
      return;
    }

    abandon();
    holding = item.entity_id;
    holdTimer = window.setTimeout(() => {
      holdTimer = null;
      holding = null;
      pending.send(item.entity_id);
    }, item.hold_seconds * MILLISECONDS_PER_SECOND);
  }

  /** Let go, or slid off, before the hold was up: nothing happens. */
  function abandon() {
    if (holdTimer !== null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }

    holding = null;
  }

  function tap(item: Toggle) {
    if (item.hold_seconds === null) {
      pending.send(item.entity_id);
    }
  }
</script>

<div class="toggles">
  {#each visible as item (item.entity_id)}
    {@const on = ha.isOn(item.entity_id)}
    {@const lit = item.active_color ?? PRIMARY}
    <button
      type="button"
      class="toggle"
      class:toggle--holding={holding === item.entity_id}
      class:toggle--pending={pending.isPending(item.entity_id)}
      style:--toggle-hold={item.hold_seconds === null ? null : `${item.hold_seconds}s`}
      onclick={() => tap(item)}
      onpointerdown={(event) => press(event, item)}
      onpointerup={abandon}
      onpointerleave={abandon}
      onpointercancel={abandon}
      oncontextmenu={(event) => event.preventDefault()}
    >
      <Icon name={item.icon} color={on ? lit : item.inactive_color} />
      <span class="toggle__label" style:color={on ? lit : null}>{item.label}</span>
    </button>
  {/each}
</div>

<style>
  .toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
  }

  .toggle {
    --toggle-glint-time: 1.1s;
    --toggle-glint-strength: 0.28;
    --toggle-fill-strength: 0.18;

    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    overflow: hidden;
    padding: 0.4em 0.8em;
    border: 0;
    border-radius: 1em;
    background-color: var(--color-faint);
    color: var(--color-foreground);
    font: inherit;
    font-size: var(--toggle-size);
    cursor: pointer;
    -webkit-touch-callout: none;
    user-select: none;
  }

  /* The icon eases between its colours rather than snapping, so the switch reads as a change. */
  .toggle :global(i),
  .toggle :global(svg) {
    position: relative;
    transition: color var(--colour-fade) ease;
  }

  .toggle__label {
    position: relative;
    transition: color var(--colour-fade) ease;
  }

  /* The hold filling the chip from the left, so it is plain how long is left to go. */
  .toggle::before {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--color-foreground);
    opacity: var(--toggle-fill-strength);
    transform: scaleX(0);
    transform-origin: left;
  }

  .toggle--holding::before {
    animation: toggle-fill var(--toggle-hold) linear forwards;
  }

  /* A glint crossing the chip for as long as the switch is on its way. */
  .toggle::after {
    content: "";
    position: absolute;
    inset: 0;
    opacity: 0;
    background: linear-gradient(
      105deg,
      transparent 35%,
      rgb(255 255 255 / var(--toggle-glint-strength)) 50%,
      transparent 65%
    );
    transform: translateX(-100%);
    pointer-events: none;
  }

  .toggle--pending::after {
    opacity: 1;
    animation: toggle-glint var(--toggle-glint-time) ease-in-out infinite;
  }

  @keyframes toggle-fill {
    to {
      transform: scaleX(1);
    }
  }

  @keyframes toggle-glint {
    to {
      transform: translateX(100%);
    }
  }
</style>
