<script lang="ts">
  import PanelWindow from "./PanelWindow.svelte";
  import type { Box } from "../lib/picture";
  import { TAP_SLOP_PX } from "../lib/cube.svelte";
  import { wantsLightType } from "../lib/incidents";

  const CANCEL_LABEL = "Cancel";
  const CONFIRM_HOLD_MS = 1000;
  const PRIMARY_BUTTON = 0;

  let { from, title, question, color, confirmLabel, onconfirm, onclose }: {
    from: Box;
    title: string;
    question: string;
    color: string;
    confirmLabel: string;
    onconfirm: () => void;
    onclose: () => void;
  } = $props();

  let panel = $state<PanelWindow | null>(null);
  let answered = $state(false);
  let holding = $state(false);
  let holdTimer: number | null = null;
  let pressedAt: { x: number; y: number } | null = null;

  function letGo(): void {
    if (holdTimer !== null) window.clearTimeout(holdTimer);
    holdTimer = null;
    holding = false;
    pressedAt = null;
  }

  $effect(() => () => letGo());

  function holdToConfirm(event: PointerEvent): void {
    if (answered || event.button !== PRIMARY_BUTTON || !event.isPrimary) return;
    letGo();
    pressedAt = { x: event.clientX, y: event.clientY };
    holding = true;
    holdTimer = window.setTimeout(() => answer(true), CONFIRM_HOLD_MS);
  }

  function moved(event: PointerEvent): void {
    if (pressedAt && Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > TAP_SLOP_PX) letGo();
  }

  function answer(confirmed: boolean): void {
    if (answered) return;
    letGo();
    answered = true;
    if (confirmed) onconfirm();
    panel?.close();
  }
</script>

{#snippet header()}
  <h2>{title}</h2>
{/snippet}

<PanelWindow
  bind:this={panel}
  {from}
  label={title}
  {header}
  {onclose}
  width="var(--critical-switch-window-width)"
  band="solid"
  tint={color}
  bracketColor={color}
  lightType={wantsLightType(color)}
  interactive
>
  <div class="confirmation-window" style:--confirmation-color={color}>
    <p class="confirmation-window__question">{question}</p>
    <div class="confirmation-window__answers">
      <button type="button" disabled={answered} onclick={() => answer(false)}>{CANCEL_LABEL}</button>
      <button
        type="button"
        class="confirmation-window__confirm"
        class:confirmation-window__confirm--holding={holding}
        style:--confirmation-hold="{CONFIRM_HOLD_MS}ms"
        disabled={answered}
        aria-label={`${confirmLabel} (hold to confirm)`}
        onpointerdown={holdToConfirm}
        onpointermove={moved}
        onpointerup={letGo}
        onpointerleave={letGo}
        onpointercancel={letGo}
        oncontextmenu={(event) => event.preventDefault()}
      ><span class="confirmation-window__word">{confirmLabel}</span></button>
    </div>
  </div>
</PanelWindow>

<style>
  h2 {
    margin: 0;
    font-size: var(--camera-window-title-size);
    font-weight: var(--weight-medium);
    text-transform: uppercase;
  }

  .confirmation-window {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--critical-switch-window-gap);
    padding: var(--critical-switch-window-padding);
  }

  p {
    margin: 0;
    text-align: center;
  }

  .confirmation-window__question {
    font-size: var(--critical-switch-question-size);
  }

  .confirmation-window__answers {
    display: flex;
    gap: var(--critical-switch-answer-gap);
    width: var(--critical-switch-control-width);
  }

  button {
    position: relative;
    isolation: isolate;
    flex: 1;
    height: var(--critical-switch-control-height);
    border: var(--critical-switch-track) solid var(--color-dim);
    border-radius: var(--critical-switch-round);
    background: transparent;
    color: var(--color-foreground);
    font: inherit;
    font-size: var(--critical-switch-control-size);
    cursor: pointer;
  }

  button:disabled {
    opacity: var(--waiting-opacity);
    cursor: default;
  }

  .confirmation-window__confirm {
    color: var(--confirmation-color);
    touch-action: none;
    -webkit-touch-callout: none;
    user-select: none;
  }

  .confirmation-window__confirm::before {
    content: "";
    position: absolute;
    z-index: -1;
    inset: var(--critical-switch-inset);
    border-radius: var(--critical-switch-round);
    background: var(--confirmation-color);
    clip-path: inset(0 100% 0 0 round var(--critical-switch-round));
  }

  .confirmation-window__confirm--holding::before {
    animation: confirmation-fill var(--confirmation-hold) linear forwards;
  }

  .confirmation-window__word {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-image: linear-gradient(90deg, var(--color-background) 0 50%, var(--confirmation-color) 50% 100%);
    background-size: 200% 100%;
    background-position: 100% 0;
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
  }

  .confirmation-window__confirm--holding .confirmation-window__word {
    animation: confirmation-split var(--confirmation-hold) linear forwards;
  }

  @keyframes confirmation-fill {
    to { clip-path: inset(0 0 0 0 round var(--critical-switch-round)); }
  }

  @keyframes confirmation-split {
    to { background-position: 0 0; }
  }

</style>
