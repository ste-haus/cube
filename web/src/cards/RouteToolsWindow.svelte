<script lang="ts">
  import PanelWindow from "./PanelWindow.svelte";
  import ConfirmationWindow from "./ConfirmationWindow.svelte";
  import { regenerateBaseRoute } from "../lib/api";
  import type { Box } from "../lib/picture";
  import { routeCachedAt, routeSummary, type BaseRouteDetails } from "../lib/routes";
  import { ha } from "../lib/state.svelte";

  const ROUTES_ATTRIBUTE = "routes";
  const EMPTY_ROUTES: BaseRouteDetails[] = [];
  const TITLE = "Travel routes";
  const FAILURE_MESSAGE = "Could not regenerate base route";
  const SUCCESS_MESSAGE = "Base regenerated. New route will be used for the next poll.";
  const CONFIRM_TITLE = "Regenerate base route";
  const CONFIRM_LABEL = "Regenerate";

  let { entityId, from, onclose }: {
    entityId: string;
    from: Box;
    onclose: () => void;
  } = $props();
  const routes = $derived(ha.attribute<BaseRouteDetails[]>(entityId, ROUTES_ATTRIBUTE) ?? EMPTY_ROUTES);
  let busy = $state<string | null>(null);
  let messages = $state<Record<string, string>>({});
  let confirmation = $state<{ route: BaseRouteDetails; from: Box } | null>(null);

  $effect(() => {
    if (confirmation && !routes.some(route => route.trip === confirmation?.route.trip)) confirmation = null;
  });

  function ask(route: BaseRouteDetails, event: MouseEvent): void {
    if (busy !== null || confirmation !== null) return;
    confirmation = { route, from: (event.currentTarget as HTMLElement).getBoundingClientRect() };
  }

  async function regenerate(trip: string): Promise<void> {
    if (busy !== null) return;
    busy = trip;
    messages[trip] = "";
    try {
      await regenerateBaseRoute(entityId, trip);
      messages[trip] = SUCCESS_MESSAGE;
    } catch (error) {
      messages[trip] = error instanceof Error ? error.message : FAILURE_MESSAGE;
    } finally {
      busy = null;
    }
  }
</script>

{#snippet header()}
  <h2>{TITLE}</h2>
{/snippet}

<PanelWindow {from} label={TITLE} {header} {onclose} width="var(--incidents-window-width)" band="solid" interactive>
  <div class="route-tools">
    {#each routes as route (route.trip)}
      <section class="route-tools__route">
        <div class="route-tools__heading">
          <h3 style:color={route.color}>{route.name}</h3>
          <button
            type="button"
            disabled={busy !== null || confirmation !== null}
            aria-label={busy === route.trip ? `Regenerating base for ${route.name}` : `Regenerate base for ${route.name}`}
            title={`Regenerate base for ${route.name}`}
            aria-busy={busy === route.trip}
            onclick={(event) => ask(route, event)}
          >
            <svg
              class="route-tools__refresh-icon"
              class:route-tools__refreshing={busy === route.trip}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M20 11a8 8 0 1 0-2.34 6.66M20 4v7h-7" />
            </svg>
          </button>
        </div>
        <p class="route-tools__summary">{routeSummary(route)}</p>
        <p>Cached {routeCachedAt(route.cached_at)}</p>
        {#if messages[route.trip]}
          <p class="route-tools__result" role="status">{messages[route.trip]}</p>
        {/if}
      </section>
    {:else}
      <p>No routes are currently displayed.</p>
    {/each}
  </div>
</PanelWindow>

{#if confirmation}
  <ConfirmationWindow
    from={confirmation.from}
    title={CONFIRM_TITLE}
    color={confirmation.route.color}
    question={`Regenerate the base route for ${confirmation.route.name}?`}
    confirmLabel={CONFIRM_LABEL}
    onconfirm={() => { if (confirmation) void regenerate(confirmation.route.trip); }}
    onclose={() => (confirmation = null)}
  />
{/if}

<style>
  .route-tools {
    --route-tools-gap: 1em;
    --route-tools-detail-gap: 0.3em;
    --route-tools-button-block-padding: 0.65em;
    --route-tools-button-padding: var(--route-tools-button-block-padding) 1em;
    --route-tools-button-height: 2.8em;
    --route-tools-rule-width: 1px;
    --route-tools-icon-size: 1.5em;
    --route-tools-refresh-period: 1s;
    display: grid;
    gap: var(--route-tools-gap);
    padding: var(--travel-window-padding);
    max-height: var(--incidents-window-height);
    overflow-y: auto;
    color: var(--color-foreground);
    font-size: var(--travel-detail-size);
  }
  .route-tools__heading {
    display: contents;
  }

  h2, h3, p {
    margin: 0;
    font-weight: inherit;
  }

  h2 {
    font-size: var(--camera-window-title-size);
    font-weight: var(--weight-medium);
    text-transform: uppercase;
  }

  h3 {
    grid-column: 1;
    font-size: var(--travel-window-event-size);
    line-height: 1.2;
  }

  p {
    grid-column: 1 / -1;
    color: var(--color-muted);
  }

  .route-tools__summary {
    grid-column: 1;
  }

  .route-tools__route {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--route-tools-detail-gap) var(--route-tools-gap);
  }

  .route-tools__route + .route-tools__route {
    border-top: var(--route-tools-rule-width) solid var(--color-dim);
    padding-top: var(--route-tools-gap);
  }

  button {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: start;
    font: inherit;
    color: var(--color-foreground);
    background: transparent;
    border: none;
    padding: var(--route-tools-button-padding);
    margin-block-start: calc(-1 * var(--route-tools-button-block-padding));
    min-height: var(--route-tools-button-height);
    min-width: var(--route-tools-button-height);
    cursor: pointer;
  }

  button:disabled {
    color: var(--color-dim);
    cursor: wait;
  }

  .route-tools__result {
    color: var(--color-foreground);
  }

  .route-tools__refresh-icon {
    display: block;
    width: var(--route-tools-icon-size);
    height: var(--route-tools-icon-size);
  }
  .route-tools__refreshing { animation: route-tools-refresh var(--route-tools-refresh-period) linear infinite; }
  @keyframes route-tools-refresh { to { transform: rotate(1turn); } }

</style>
