<script lang="ts">
  const MDI_PREFIX = "mdi:";

  let { name, color }: { name: string | null | undefined; color?: string | null } = $props();

  // Icon names arrive from config in Home Assistant's `mdi:name` notation.
  const className = $derived(
    name?.startsWith(MDI_PREFIX) ? `mdi mdi-${name.slice(MDI_PREFIX.length)}` : (name ?? ""),
  );
</script>

{#if name}
  <i class={className} style:color aria-hidden="true"></i>
{/if}
