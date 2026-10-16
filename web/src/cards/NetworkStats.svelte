<script lang="ts">
  import StatRows from "./StatRows.svelte";
  import type { NetworkStats } from "../lib/types";

  /* A card of readings worth a glance, one to a row. */

  let { stats }: { stats: NetworkStats } = $props();
</script>

<section class="network-card">
  <h3 class="network-card__title">{stats.title}</h3>
  <StatRows rows={stats.rows} />
</section>
