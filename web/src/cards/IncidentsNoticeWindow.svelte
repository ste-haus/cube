<script lang="ts">
  import {
    DEFAULT_CRITICAL_COLOUR,
    incidentsOf,
    severityColour,
    wantsLightType,
    worstSeverity,
    type Incident,
  } from "../lib/incidents";
  import type { Box } from "../lib/picture";
  import { ha } from "../lib/state.svelte";
  import type { DashboardConfig, IncidentsNoticeWindow } from "../lib/types";
  import IncidentsWindow from "./IncidentsWindow.svelte";

  /*
   * The incidents window, opened out of a notice rather than the departure face's band, and
   * coloured by the worst incident as the band is.
   */

  const INCIDENTS_ATTRIBUTE = "incidents";

  let {
    window,
    config,
    from,
    onlanding,
    onclose,
  }: {
    window: IncidentsNoticeWindow;
    config: DashboardConfig;
    from: Box;
    onlanding: () => void;
    onclose: () => void;
  } = $props();

  const incidents = $derived(incidentsOf(ha.attribute(window.entity_id, INCIDENTS_ATTRIBUTE)));

  /* What it last listed, kept while it folds away once the last incident has cleared. */
  let last = $state<Incident[]>([]);

  $effect(() => {
    if (incidents.length > 0) {
      last = incidents;
    }
  });

  const shown = $derived(incidents.length > 0 ? incidents : last);
  const criticalColour = $derived(config.mcw?.warning_color ?? DEFAULT_CRITICAL_COLOUR);
  const colour = $derived(severityColour(worstSeverity(shown), criticalColour));
</script>

<IncidentsWindow
  incidents={shown}
  live={incidents.length > 0}
  {colour}
  lightType={wantsLightType(colour)}
  {criticalColour}
  labels={config.labels}
  {from}
  {onlanding}
  {onclose}
/>
