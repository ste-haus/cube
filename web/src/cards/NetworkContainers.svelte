<script lang="ts">
  import { ha } from "../lib/state.svelte";
  import { PULSE_MS } from "../lib/travel";
  import type { Container, NetworkContainers } from "../lib/types";

  /*
   * A host's containers, in columns: a mark for each one's state, its name, and for how long.
   * The mark is the state, so its words are left to the console. The marks are the console
   * banner's own, so the wall and the console agree.
   * Running is primary, as an up stop on the map is; a one-shot that finished and one that was
   * stopped rest in grey, since both were meant; one in trouble is secondary and pulses until it
   * recovers.
   */

  const CONTAINERS_ATTRIBUTE = "containers";

  const MARKS: Record<string, string> = {
    ok: "√",
    completed: "♦",
    stopped: "■",
    warning: "▲",
    error: "●",
  };
  const UNKNOWN_MARK = "?";
  const MILLISECONDS = "ms";

  let { containers }: { containers: NetworkContainers } = $props();

  const listed = $derived(ha.attribute<Container[]>(containers.entity_id, CONTAINERS_ATTRIBUTE) ?? []);
</script>

<section class="network-containers" style:--network-containers-pulse="{PULSE_MS}{MILLISECONDS}">
  <h3 class="network-containers__title card-title">{containers.name}</h3>
  <ul class="network-containers__list">
    {#each listed as container (container.name)}
      <li class="network-containers__container network-containers__container--{container.state}">
        <span class="network-containers__mark">{MARKS[container.state] ?? UNKNOWN_MARK}</span>
        <span class="network-containers__name">{container.name}</span>
        <span class="network-containers__uptime">{container.uptime}</span>
      </li>
    {/each}
  </ul>
</section>

<style>
  .network-containers {
    padding: var(--network-host-padding);
    border: 1px solid var(--color-faint);
    border-radius: var(--network-host-radius);
  }

  .network-containers__title {
    margin: 0 0 0.5em;
    color: var(--color-foreground);
    font-size: var(--network-card-title-size);
    font-weight: var(--weight-thin);
  }

  /* Alphabetical down each column, then across. */
  .network-containers__list {
    columns: var(--network-containers-columns);
    column-gap: calc(2 * var(--panel-gap));
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--network-host-small-size);
  }

  .network-containers__container {
    display: grid;
    grid-template-columns: 1.2em minmax(0, 1fr) auto;
    column-gap: 0.5em;
    align-items: baseline;
    margin-bottom: 0.25em;
    break-inside: avoid;
    color: var(--color-muted);
  }

  .network-containers__mark {
    text-align: center;
  }

  .network-containers__name {
    overflow: hidden;
    color: var(--color-foreground);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .network-containers__uptime {
    min-width: 4.5em;
    color: var(--color-dim);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .network-containers__container--ok .network-containers__mark {
    color: var(--color-primary);
  }

  .network-containers__container--completed .network-containers__mark {
    color: var(--color-muted);
  }

  .network-containers__container--stopped {
    color: var(--color-dim);
  }

  .network-containers__container--stopped .network-containers__name {
    color: var(--color-dim);
  }

  .network-containers__container--warning,
  .network-containers__container--error {
    animation: network-containers-pulse var(--network-containers-pulse) ease-in-out infinite;
  }

  .network-containers__container--warning .network-containers__mark,
  .network-containers__container--error .network-containers__mark,
  .network-containers__container--warning .network-containers__name,
  .network-containers__container--error .network-containers__name {
    color: var(--color-secondary);
  }

  /* Down nearly to nothing and back, with a glow of its own colour at the top of each beat. */
  @keyframes network-containers-pulse {
    0%,
    100% {
      text-shadow: 0 0 var(--travel-pulse-glow) var(--color-secondary);
    }

    50% {
      opacity: var(--travel-pulse-opacity);
      text-shadow: none;
    }
  }
</style>
