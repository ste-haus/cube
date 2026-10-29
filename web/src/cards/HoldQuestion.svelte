<script lang="ts">
  /*
   * A question with two answers, the second of which is held rather than tapped.
   *
   * The answers are two pills side by side. The first, a tap, says no. The second is in `colour`,
   * and as it is held a thumb of that colour fills in under it from the left over `holdMs`, so it
   * is plain how long is left to go; letting go or sliding off before it is full does nothing.
   * Its word is dark wherever the fill is under it: the word spans the whole button, so a split in
   * its colour moves across with the fill.
   *
   * `disabled` is read again when the hold comes up, so a question that has gone, or been
   * answered, while it was held never sends.
   *
   * Stacked, the question stands over its answers, as a window of its own. Inline, it takes the
   * place of a row's details: the question at the row's size on the left, wrapping if it must, and
   * the answers on the right, both as wide as the wider of their words.
   */

  type Layout = "stacked" | "inline";

  const PRIMARY_BUTTON = 0;

  let {
    question,
    cancelLabel,
    confirmLabel,
    colour,
    holdMs,
    layout = "stacked",
    disabled = false,
    oncancel,
    onconfirm,
  }: {
    question: string;
    cancelLabel: string;
    confirmLabel: string;
    colour: string;
    holdMs: number;
    layout?: Layout;
    disabled?: boolean;
    oncancel: () => void;
    onconfirm: () => void;
  } = $props();

  let holding = $state(false);
  let holdTimer: number | null = null;

  function hold(event: PointerEvent): void {
    if (disabled || event.button !== PRIMARY_BUTTON || !event.isPrimary) {
      return;
    }

    letGo();
    holding = true;
    holdTimer = window.setTimeout(() => {
      holdTimer = null;
      holding = false;

      if (!disabled) {
        onconfirm();
      }
    }, holdMs);
  }

  /** Let go, or slid off, before the hold was up: nothing happens. */
  function letGo(): void {
    if (holdTimer !== null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }

    holding = false;
  }

  $effect(() => {
    if (disabled) {
      letGo();
    }
  });

  $effect(() => () => letGo());
</script>

<div
  class="hold-question hold-question--{layout}"
  style:--hold-question-colour={colour} style:--hold-question-hold="{holdMs}ms"
>
  <p class="hold-question__question">{question}</p>
  <div class="hold-question__answers">
    <button type="button" class="hold-question__answer" {disabled} onclick={oncancel}>{cancelLabel}</button>
    <button
      type="button"
      class="hold-question__answer hold-question__answer--held"
      class:hold-question__answer--holding={holding}
      {disabled}
      onpointerdown={hold}
      onpointerup={letGo}
      onpointerleave={letGo}
      onpointercancel={letGo}
      oncontextmenu={(event) => event.preventDefault()}
    >
      <!-- The word drawn over the fill takes no room, so this unseen copy sizes the pill to it -->
      <span class="hold-question__room" aria-hidden="true">{confirmLabel}</span>
      <span class="hold-question__word">{confirmLabel}</span>
    </button>
  </div>
</div>

<style>
  .hold-question {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--critical-switch-window-gap);
  }

  .hold-question__question {
    max-width: 100%;
    margin: 0;
    color: var(--color-foreground);
    font-size: var(--critical-switch-question-size);
    font-weight: var(--weight-thin);
    text-align: center;
  }

  /* Two buttons, each a pill as tall as a critical switch, across as wide as one. */
  .hold-question__answers {
    display: flex;
    gap: var(--critical-switch-answer-gap);
    width: var(--critical-switch-control-width);
  }

  .hold-question__answer {
    position: relative;
    isolation: isolate;
    flex: 1 1 0;
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--critical-switch-control-height);
    padding: 0 1em;
    border: var(--critical-switch-track) solid var(--color-dim);
    border-radius: var(--critical-switch-round);
    background: transparent;
    color: var(--color-muted);
    font: inherit;
    font-size: var(--critical-switch-control-size);
    font-weight: var(--weight-light);
    cursor: pointer;
  }

  .hold-question--inline {
    flex-direction: row;
    justify-content: space-between;
    gap: var(--critical-switch-answer-gap);
  }

  .hold-question--inline .hold-question__question {
    flex: 1 1 auto;
    min-width: 0;
    font-size: inherit;
    font-weight: var(--weight-light);
    text-align: left;
  }

  /* Equal columns in a box only as wide as they need: each takes the wider answer's width. */
  .hold-question--inline .hold-question__answers {
    display: grid;
    grid-auto-columns: 1fr;
    grid-auto-flow: column;
    flex: none;
    width: auto;
  }

  .hold-question__answer:disabled {
    cursor: default;
    opacity: var(--waiting-opacity);
  }

  .hold-question__answer--held {
    color: var(--hold-question-colour);
    touch-action: none;
    -webkit-touch-callout: none;
    user-select: none;
  }

  .hold-question__answer--held::before {
    content: "";
    position: absolute;
    z-index: -1;
    inset: var(--critical-switch-inset);
    border-radius: var(--critical-switch-round);
    background: var(--hold-question-colour);
    clip-path: inset(0 100% 0 0 round var(--critical-switch-round));
  }

  .hold-question__answer--holding::before {
    animation: hold-question-fill var(--hold-question-hold) linear forwards;
  }

  @keyframes hold-question-fill {
    to {
      clip-path: inset(0 0 0 0 round var(--critical-switch-round));
    }
  }

  .hold-question__room {
    visibility: hidden;
  }

  .hold-question__word {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-image: linear-gradient(90deg, var(--color-background) 0 50%, var(--hold-question-colour) 50% 100%);
    background-size: 200% 100%;
    background-position: 100% 0;
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
  }

  .hold-question__answer--holding .hold-question__word {
    animation: hold-question-split var(--hold-question-hold) linear forwards;
  }

  @keyframes hold-question-split {
    to {
      background-position: 0 0;
    }
  }
</style>
