<script lang="ts">
  import Icon from "../lib/Icon.svelte";
  import { STATE_ON, ha } from "../lib/state.svelte";
  import type { Notice } from "../lib/types";

  let { notices, title }: { notices: Notice[]; title: string } = $props();

  // Twenty-odd separately configured notices, each carrying its own text and icon. They are
  // one list rather than one card apiece, which is what the config buys.
  const visible = $derived(
    notices
      .map((notice) => ({
        notice,
        message: ha.attribute<string>(notice.entity_id, notice.message_attribute),
        icon: ha.attribute<string>(notice.entity_id, notice.icon_attribute),
      }))
      .filter(({ notice, message }) => {
        if (!message) {
          return false;
        }

        return notice.conditional ? ha.state(notice.entity_id) === STATE_ON : true;
      }),
  );
</script>

<section class="notices">
  <h2 class="panel-title">{title}</h2>
  <ul class="notices__list">
    {#each visible as { notice, message, icon } (notice.entity_id)}
      <li class="notices__item" class:notices__item--pulsing={notice.pulsing}>
        <Icon name={icon} />
        <span>{message}</span>
      </li>
    {/each}
  </ul>
</section>

<style>
  .notices__list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .notices__item {
    display: flex;
    align-items: center;
    gap: 0.4em;
    padding: 0.1em 0;
    font-size: var(--notice-size);
  }

  .notices__item--pulsing {
    animation: pulse 3s linear infinite;
  }
</style>
