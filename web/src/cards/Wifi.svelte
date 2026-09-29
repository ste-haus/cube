<script lang="ts">
  import Frame from "./Frame.svelte";
  import { ha } from "../lib/state.svelte";
  import type { Labels, Wifi } from "../lib/types";
  import { codeUrl, OPEN_NETWORK, wifiPayload } from "../lib/wifi";

  /*
   * How to get a phone on the network: its name and password, to read out or type, and a code
   * that does both for a camera.
   *
   * The code is drawn by the page `qr_url` names, framed, and asked for at the size it is shown
   * at so it is sharp. Both the network and the code come from the entities, so a password
   * changed in Home Assistant is on every panel with the next state update.
   */

  let { wifi, labels }: { wifi: Wifi; labels: Labels } = $props();

  let width = $state(0);

  const ssid = $derived(ha.state(wifi.ssid_entity_id));
  const password = $derived(ha.state(wifi.password_entity_id));
  const open = $derived(wifi.security === OPEN_NETWORK);

  const url = $derived.by(() => {
    if (!wifi.qr_url || ssid === null || (!open && password === null) || width <= 0) {
      return null;
    }

    const payload = wifiPayload({ ssid, password: password ?? "", security: wifi.security, hidden: wifi.hidden });

    return codeUrl(wifi.qr_url, payload, width);
  });
</script>

{#if ssid !== null}
  <section class="wifi">
    <h2 class="panel-title">{labels.wifi}</h2>

    <dl class="wifi__details">
      <dt>{labels.wifi_network}</dt>
      <dd>{ssid}</dd>
      {#if password !== null && !open}
        <dt>{labels.wifi_password}</dt>
        <dd>{password}</dd>
      {/if}
    </dl>

    {#if wifi.qr_url}
      <div class="wifi__code" bind:clientWidth={width}>
        {#if url}
          <Frame frame={{ url, title: labels.wifi, interactive: false }} />
        {/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .wifi {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 0;
  }

  .wifi .panel-title {
    align-self: stretch;
  }

  /* The labels right against their values, and the pair centred in the column. */
  .wifi__details {
    display: grid;
    grid-template-columns: auto auto;
    column-gap: 0.4em;
    row-gap: 0.5em;
    /* As far from the code below as from the heading's rule above. */
    margin: 0 0 var(--title-gap) 0;
    font-size: var(--wifi-detail-size);
  }

  .wifi__details dt {
    color: var(--color-muted);
    text-align: right;
  }

  .wifi__details dd {
    margin: 0;
    color: var(--color-foreground);
    text-align: left;
    overflow-wrap: anywhere;
  }

  /* Square, as large as the column allows up to its size, and dimmed so it does not light up the
   * room. */
  .wifi__code {
    width: min(100%, var(--wifi-code-size));
    aspect-ratio: 1;
    opacity: var(--wifi-code-opacity);
  }
</style>
