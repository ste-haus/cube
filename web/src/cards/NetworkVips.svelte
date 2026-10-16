<script lang="ts">
  import { ha } from "../lib/state.svelte";
  import type { NetworkVip } from "../lib/types";

  /*
   * The virtual addresses and which host holds each. A held one rests in grey under its holder's
   * name; one nobody holds, or two hosts claim, is in the secondary colour, since either way the
   * address is not answering as it should.
   */

  const OFFLINE = "offline";
  const SPLIT_BRAIN = "split brain";
  const UNKNOWN = "—";

  let { vips }: { vips: NetworkVip[] } = $props();

  function holder(vip: NetworkVip): string | null {
    return ha.reading({ entity_id: vip.entity_id, attribute: vip.attribute });
  }

  function troubled(value: string | null): boolean {
    return value === OFFLINE || (value?.startsWith(SPLIT_BRAIN) ?? false);
  }
</script>

<section class="network-vips">
  <h3 class="network-vips__title">VIPs</h3>
  <dl class="network-vips__list">
    {#each vips as vip (vip.name)}
      {@const value = holder(vip)}
      <dt>{vip.name}</dt>
      <dd class:network-vips__holder--troubled={troubled(value)}>{value ?? UNKNOWN}</dd>
    {/each}
  </dl>
</section>

<style>
  /* The rows share the card's height, so it never ends in an empty block under them. */
  .network-vips {
    display: flex;
    flex-direction: column;
    padding: var(--network-host-padding);
    border: 1px solid var(--color-faint);
    border-radius: var(--network-host-radius);
  }

  .network-vips__title {
    margin: 0 0 0.5em;
    color: var(--color-foreground);
    font-size: var(--network-card-title-size);
    font-weight: var(--weight-thin);
  }

  .network-vips__list {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: auto minmax(0, 1fr);
    grid-auto-rows: 1fr;
    align-items: center;
    gap: 0 1.2em;
    margin: 0;
    font-size: var(--network-host-detail-size);
  }

  .network-vips__list dt {
    color: var(--color-muted);
  }

  .network-vips__list dd {
    margin: 0;
    overflow: hidden;
    color: var(--color-foreground);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .network-vips__list dd.network-vips__holder--troubled {
    color: var(--color-secondary);
  }
</style>
