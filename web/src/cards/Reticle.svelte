<script lang="ts">
  /*
   * Four corners locked on to something that was pressed, filling whatever holds them.
   *
   * They close in from outside and breathe while what was asked of Home Assistant is on its way,
   * close in for the whole of a hold instead while the press is being held, and spring back out
   * once it is answered or let go of. The holder places them; this draws them.
   */

  const MILLISECONDS = "ms";
  const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];

  let {
    holding = false,
    releasing = false,
    holdMs,
    releaseMs,
  }: {
    /** Being held: the corners close in over `holdMs` rather than snapping on and breathing. */
    holding?: boolean;
    /** Answered or let go of: the corners spring back out over `releaseMs`. */
    releasing?: boolean;
    holdMs: number;
    releaseMs: number;
  } = $props();
</script>

<div
  class="reticle"
  class:reticle--holding={holding}
  class:reticle--releasing={releasing}
  style:--reticle-hold="{holdMs}{MILLISECONDS}"
  style:--reticle-release="{releaseMs}{MILLISECONDS}"
  aria-hidden="true"
>
  {#each CORNERS as corner (corner)}
    <span class="bracket bracket--{corner} reticle__bracket reticle__bracket--{corner}"></span>
  {/each}
</div>

<style>
  .reticle {
    --bracket-size: 0.8rem;
    --bracket-weight: 2px;
    --bracket-color: var(--color-foreground);
    --reticle-lock: 180ms;
    --reticle-breathe: var(--waiting-breathe);
    --reticle-reach: 14px;

    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .reticle__bracket {
    animation:
      reticle-lock var(--reticle-lock) cubic-bezier(0.2, 0.8, 0.3, 1) both,
      reticle-breathe var(--reticle-breathe) ease-in-out var(--reticle-lock) infinite;
  }

  /* Held: the corners close in for as long as the hold takes, so it is plain that holding on is
   * what does it. */
  .reticle--holding .reticle__bracket {
    animation: reticle-lock var(--reticle-hold) linear both;
  }

  .reticle--releasing .reticle__bracket {
    animation: reticle-release var(--reticle-release) ease-in forwards;
  }

  .reticle__bracket--top-left {
    --reticle-out: translate(calc(-1 * var(--reticle-reach)), calc(-1 * var(--reticle-reach)));
  }

  .reticle__bracket--top-right {
    --reticle-out: translate(var(--reticle-reach), calc(-1 * var(--reticle-reach)));
  }

  .reticle__bracket--bottom-left {
    --reticle-out: translate(calc(-1 * var(--reticle-reach)), var(--reticle-reach));
  }

  .reticle__bracket--bottom-right {
    --reticle-out: translate(var(--reticle-reach), var(--reticle-reach));
  }

  @keyframes reticle-lock {
    from {
      opacity: 0;
      transform: var(--reticle-out);
    }
  }

  @keyframes reticle-breathe {
    50% {
      opacity: var(--waiting-opacity);
    }
  }

  @keyframes reticle-release {
    to {
      opacity: 0;
      transform: var(--reticle-out);
    }
  }
</style>
