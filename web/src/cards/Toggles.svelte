<script lang="ts">
  import Icon from "../lib/Icon.svelte";
  import { toggle } from "../lib/api";
  import { ha } from "../lib/state.svelte";
  import type { Toggle } from "../lib/types";

  let { toggles }: { toggles: Toggle[] } = $props();

  const visible = $derived(toggles.filter((item) => !item.visible_when || ha.isOn(item.visible_when)));
</script>

<div class="toggles">
  {#each visible as item (item.entity_id)}
    {@const on = ha.isOn(item.entity_id)}
    <button type="button" class="toggle" onclick={() => toggle(item.entity_id)}>
      <Icon name={item.icon} color={on ? item.active_color : item.inactive_color} />
      <span>{item.label}</span>
    </button>
  {/each}
</div>

<style>
  .toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    padding: 0.4em 0.8em;
    border: 0;
    border-radius: 1em;
    background-color: var(--color-faint);
    color: var(--color-foreground);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
</style>
