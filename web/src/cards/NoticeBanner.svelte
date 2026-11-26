<script lang="ts">
  import { bannerOf, PART_SEPARATOR, type Banner } from "../lib/banner";
  import { drop } from "../lib/drop";
  import Icon from "../lib/Icon.svelte";
  import { ha } from "../lib/state.svelte";

  /*
   * A band of information over the map while its sensor is on, saying what the sensor's `message`
   * and `detail` say on one line. It is information, not an alert, so it is outlined in its
   * `color` rather than filled; its icon and its message take the colour too, and its detail stays
   * in the panel's own type. It slides down out from under
   * the map's heading as the incident band does, under that band when both are up, and takes no
   * taps: the map under it still enlarges.
   */

  let { entityId, criticalColour }: { entityId: string; criticalColour: string } = $props();

  const banner = $derived(bannerOf(ha.isOn(entityId), (name) => ha.attribute(entityId, name), criticalColour));

  /* What the band last said, kept while it slides away so it leaves with its words on it. */
  let last = $state<Banner | null>(null);

  $effect(() => {
    if (banner) {
      last = banner;
    }
  });

  const shown = $derived(banner ?? last);
</script>

{#if banner && shown}
  <div class="notice-banner" transition:drop>
    <div class="notice-banner__drop">
      <div class="notice-banner__band" style:--notice-colour={shown.colour}>
        <span class="notice-banner__icon"><Icon name={shown.icon} /></span>
        <span class="notice-banner__text">
          {#if shown.message}<span class="notice-banner__message">{shown.message}</span>{/if}{#if shown.message && shown.detail}{PART_SEPARATOR}{/if}{shown.detail}
        </span>
      </div>
    </div>
  </div>
{/if}

<style>
  .notice-banner {
    pointer-events: none;
  }

  .notice-banner__drop {
    padding-bottom: var(--incident-banner-gap);
    transform: translateY(var(--banner-drop, 0));
  }

  .notice-banner__band {
    display: flex;
    align-items: center;
    gap: 0.6em;
    padding: var(--notice-banner-padding);
    border: var(--notice-banner-border) solid var(--notice-colour);
    background: transparent;
    color: var(--color-foreground);
    font-size: var(--incident-banner-size);
    font-weight: var(--weight-medium);
    letter-spacing: 0.04em;
    transition: border-color var(--colour-fade) ease;
  }

  .notice-banner__icon {
    flex: 0 0 auto;
    color: var(--notice-colour);
    transition: color var(--colour-fade) ease;
  }

  .notice-banner__message {
    color: var(--notice-colour);
    transition: color var(--colour-fade) ease;
  }

  .notice-banner__text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
