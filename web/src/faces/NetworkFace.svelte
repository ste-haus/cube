<script lang="ts">
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
  import type { DashboardConfig, NetworkFaceOptions } from "../lib/types";

  /*
   * The network at a glance. Across the top, the clock in the corner and the way out across from
   * it. Under them the map runs down the left, the internet at its top and the house below, as
   * narrow as its names allow. Beside it, the rack, the VIPs and the network's vitals on a line;
   * a card for each host; and how hard the automations are working, the containers and who is
   * streaming under those, all on the hosts' columns so their edges line up.
   */

  let { config, options }: { config: DashboardConfig; options: NetworkFaceOptions } = $props();

  const DEFAULT_CAUTION_COLOUR = "#ffb000";

  const offlineColour = $derived(config.mcw?.warning_color ?? DEFAULT_CRITICAL_COLOUR);
  const cautionColour = $derived(config.mcw?.caution_color ?? DEFAULT_CAUTION_COLOUR);
  const hostColumns = $derived(Math.max(options.hosts.length, 1));
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
            <NetworkRack rack={options.rack} {cautionColour} warningColour={offlineColour} />
          </div>
        {/if}
        {#if options.vips.length > 0}<NetworkVips vips={options.vips} />{/if}
        {#if options.stats}<NetworkStats stats={options.stats} />{/if}
      </div>
    {/if}

    {#if options.hosts.length > 0}
      <div class="network-face__hosts" style:--network-face-hosts={options.hosts.length}>
        {#each options.hosts as host, index (index)}
          <NetworkHost {host} {offlineColour} />
        {/each}
      </div>
    {/if}

    {#if options.bus || options.containers.length > 0 || options.media}
      <div class="network-face__grid" style:--network-face-hosts={hostColumns}>
        {#if options.bus}<NetworkStats stats={options.bus} />{/if}
        {#each options.containers as containers (containers.entity_id)}
          <div class="network-face__wide"><NetworkContainers {containers} /></div>
        {/each}
        {#if options.media}<MediaSessions media={options.media} />{/if}
      </div>
    {/if}
  </div>
</div>
