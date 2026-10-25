<script lang="ts">
  import CriticalSwitchCard from "../cards/CriticalSwitchCard.svelte";
  import MediaSessions from "../cards/MediaSessions.svelte";
  import NetworkContainers from "../cards/NetworkContainers.svelte";
  import NetworkHost from "../cards/NetworkHost.svelte";
  import NetworkMap from "../cards/NetworkMap.svelte";
  import NetworkRack from "../cards/NetworkRack.svelte";
  import NetworkStats from "../cards/NetworkStats.svelte";
  import NetworkVips from "../cards/NetworkVips.svelte";
  import NetworkWan from "../cards/NetworkWan.svelte";
  import PreciseClock from "../cards/PreciseClock.svelte";
  import { DEFAULT_CRITICAL_COLOUR } from "../lib/incidents";
  import { ha } from "../lib/state.svelte";
  import type { DashboardConfig, MediaSession, NetworkFaceOptions } from "../lib/types";

  /*
   * The network at a glance. Across the top, the clock in the corner and the way out across from
   * it. Under them the map runs down the left, the internet at its top and the house below, as
   * narrow as its names allow. Beside it, the rack, the VIPs and the network's vitals on a line;
   * a card for each host; and how hard the automations are working, the containers and who is
   * streaming under those, all on the hosts' columns so their edges line up. A card wider than one
   * column spans as many as it says, and the rest wrap onto the line below.
   *
   * Any card but the map can have a critical switch held behind it.
   */

  let { config, options }: { config: DashboardConfig; options: NetworkFaceOptions } = $props();

  const DEFAULT_CAUTION_COLOUR = "#ffb000";
  const SESSIONS_ATTRIBUTE = "sessions";

  const offlineColour = $derived(config.mcw?.warning_color ?? DEFAULT_CRITICAL_COLOUR);
  const cautionColour = $derived(config.mcw?.caution_color ?? DEFAULT_CAUTION_COLOUR);
  const hostColumns = $derived(Math.max(options.hosts.length, 1));

  const mediaShown = $derived.by(() => {
    if (!options.media) {
      return false;
    }

    const sessions = ha.attribute<MediaSession[]>(options.media.entity_id, SESSIONS_ATTRIBUTE) ?? [];

    return !options.media.hide_idle || sessions.length > 0;
  });
</script>

<div class="network-face" class:network-face--unmapped={!options.map}>
  <div class="network-face__top">
    <PreciseClock clock={options.clock} labels={config.labels} />

    {#if options.wan}
      <NetworkWan wan={options.wan} {offlineColour} />
    {/if}
  </div>

  {#if options.map}
    <div class="network-face__map">
      <NetworkMap map={options.map} />
    </div>
  {/if}

  <div class="network-face__main">
    {#if options.rack || options.vips.length > 0 || options.stats}
      <div class="network-face__grid" style:--network-face-hosts={hostColumns}>
        {#if options.rack}
          <div class="network-face__wide">
            <CriticalSwitchCard critical={options.rack.switch} labels={config.labels} advisoryColour={config.colors.secondary}>
              <NetworkRack rack={options.rack} {cautionColour} warningColour={offlineColour} />
            </CriticalSwitchCard>
          </div>
        {/if}
        {#if options.vips.length > 0}<NetworkVips vips={options.vips} />{/if}
        {#if options.stats}
          <CriticalSwitchCard critical={options.stats.switch} labels={config.labels} advisoryColour={config.colors.secondary}>
            <NetworkStats stats={options.stats} />
          </CriticalSwitchCard>
        {/if}
      </div>
    {/if}

    {#if options.hosts.length > 0}
      <div class="network-face__hosts" style:--network-face-hosts={options.hosts.length}>
        {#each options.hosts as host, index (index)}
          <CriticalSwitchCard critical={host.switch} labels={config.labels} advisoryColour={config.colors.secondary}>
            <NetworkHost {host} {offlineColour} />
          </CriticalSwitchCard>
        {/each}
      </div>
    {/if}

    {#if options.bus || options.containers.length > 0 || mediaShown}
      <div class="network-face__grid" style:--network-face-hosts={hostColumns}>
        {#if options.bus}
          <CriticalSwitchCard critical={options.bus.switch} labels={config.labels} advisoryColour={config.colors.secondary}>
            <NetworkStats stats={options.bus} />
          </CriticalSwitchCard>
        {/if}
        {#each options.containers as containers (containers.entity_id)}
          <div class="network-face__wide" style:--network-face-wide-columns={containers.columns}>
            <CriticalSwitchCard critical={containers.switch} labels={config.labels} advisoryColour={config.colors.secondary}>
              <NetworkContainers {containers} />
            </CriticalSwitchCard>
          </div>
        {/each}
        {#if options.media && mediaShown}
          <div class="network-face__wide" style:--network-face-wide-columns={options.media.columns}>
            <CriticalSwitchCard critical={options.media.switch} labels={config.labels} advisoryColour={config.colors.secondary}>
              <MediaSessions media={options.media} />
            </CriticalSwitchCard>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
