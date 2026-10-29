<script module lang="ts">
  // Shared by every opening of the window, so closing and reopening it mid-request can't start
  // a second one
  const pending = $state<{ trip: string | null }>({ trip: null });
</script>

<script lang="ts">
  import { fade } from "svelte/transition";
  import HoldQuestion from "./HoldQuestion.svelte";
  import PanelWindow from "./PanelWindow.svelte";
  import { regenerateBaseRoute } from "../lib/api";
  import { fill, wantsLightType } from "../lib/incidents";
  import type { Box } from "../lib/picture";
  import { routeCachedAt, routeQuestion, routeSummary, type BaseRouteDetails } from "../lib/routes";
  import { ha } from "../lib/state.svelte";
  import type { DistanceUnit, Labels } from "../lib/types";
  import { strikeOut, writeIn } from "../lib/wipe";

  /*
   * The routes on the travel map, each with what its base was built from and a way to rebuild it.
   *
   * A route's refresh icon asks first, in place: the row's details are struck out and the question
   * written in where they were, its answer held for `CONFIRM_HOLD_MS`. While it asks, the band and
   * brackets take the route's colour and the other rows dim, as a critical switch's window does
   * while it asks. Either answer writes the details back.
   *
   * What a rebuild comes to stands in the cached line's place for `RESULT_MS`, then fades back to
   * it. It is the open window's alone: one opened afterwards shows the cached line.
   */

  const ROUTES_ATTRIBUTE = "routes";
  const EMPTY_ROUTES: BaseRouteDetails[] = [];
  const CONFIRM_HOLD_MS = 1000;
  const MINUTE_MS = 60_000;
  const RESULT_MS = 10_000;
  // As long as --colour-fade, so the line changes at the pace the window's colours do
  const RESULT_FADE_MS = 400;

  let { entityId, unit, labels, from, onclose }: {
    entityId: string;
    unit: DistanceUnit;
    labels: Labels;
    from: Box;
    onclose: () => void;
  } = $props();
  const routes = $derived(ha.attribute<BaseRouteDetails[]>(entityId, ROUTES_ATTRIBUTE) ?? EMPTY_ROUTES);
  const busy = $derived(pending.trip);
  let messages = $state<Record<string, string>>({});
  const messageTimers: Record<string, number> = {};

  $effect(() => () => Object.values(messageTimers).forEach((timer) => window.clearTimeout(timer)));

  function show(trip: string, message: string): void {
    window.clearTimeout(messageTimers[trip]);
    messages[trip] = message;
    messageTimers[trip] = window.setTimeout(() => delete messages[trip], RESULT_MS);
  }
  /* Ages are told by the day and times to the minute, so the window's clock moves on by the minute. */
  let now = $state(new Date());

  $effect(() => {
    const tick = window.setInterval(() => (now = new Date()), MINUTE_MS);

    return () => window.clearInterval(tick);
  });

  let asking = $state<string | null>(null);
  const askingRoute = $derived(routes.find((route) => route.trip === asking) ?? null);

  // A route gone from the map takes its question with it
  $effect(() => {
    if (asking !== null && askingRoute === null) asking = null;
  });

  function ask(route: BaseRouteDetails): void {
    if (busy !== null || asking !== null) return;
    asking = route.trip;
  }

  function confirm(trip: string): void {
    if (asking !== trip) return;
    asking = null;
    void regenerate(trip);
  }

  async function regenerate(trip: string): Promise<void> {
    if (pending.trip !== null) return;
    pending.trip = trip;
    window.clearTimeout(messageTimers[trip]);
    delete messages[trip];
    try {
      await regenerateBaseRoute(entityId, trip);
      show(trip, labels.route_tools_regenerated);
    } catch (error) {
      show(trip, (error instanceof Error && error.message) || labels.route_tools_failed);
    } finally {
      pending.trip = null;
    }
  }
</script>

{#snippet header()}
  <h2>{labels.route_tools_title}</h2>
{/snippet}

<PanelWindow
  {from}
  label={labels.route_tools_title}
  {header}
  {onclose}
  width="var(--incidents-window-width)"
  band="solid"
  tint={askingRoute?.color ?? null}
  bracketColor={askingRoute?.color ?? null}
  lightType={askingRoute !== null && wantsLightType(askingRoute.color)}
  interactive
>
  <div class="route-tools">
    {#each routes as route (route.trip)}
      <section class="route-tools__route" class:route-tools__route--dimmed={asking !== null && asking !== route.trip}>
        <div class="route-tools__heading">
          <h3 style:color={route.color}>{route.name}</h3>
          <button
            type="button"
            class:route-tools__refresh--hidden={asking === route.trip}
            disabled={busy !== null || asking !== null}
            aria-label={fill(busy === route.trip ? labels.route_tools_regenerating : labels.route_tools_regenerate_route, { name: route.name })}
            title={fill(labels.route_tools_regenerate_route, { name: route.name })}
            aria-busy={busy === route.trip}
            onclick={() => ask(route)}
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
        <div class="route-tools__body">
          <!-- The details' room is always held, so the row keeps its height while it asks -->
          <div class="route-tools__view route-tools__view--room" aria-hidden="true">
            <p>{routeSummary(route, unit, labels)}</p>
            <p>{routeCachedAt(route.cached_at, now, labels)}</p>
          </div>
          {#if asking === route.trip}
            <div class="route-tools__view" in:writeIn out:strikeOut>
              <HoldQuestion
                question={routeQuestion(route.cached_at, now, labels)}
                cancelLabel={labels.route_tools_cancel}
                confirmLabel={labels.route_tools_regenerate}
                colour={route.color}
                holdMs={CONFIRM_HOLD_MS}
                layout="inline"
                oncancel={() => (asking = null)}
                onconfirm={() => confirm(route.trip)}
              />
            </div>
          {:else}
            <div class="route-tools__view" in:writeIn out:strikeOut>
              <p>{routeSummary(route, unit, labels)}</p>
              <!-- The result and the cached line share one cell, so one fades over the other -->
              <div class="route-tools__status">
                {#if messages[route.trip]}
                  <p class="route-tools__result" role="status" transition:fade={{ duration: RESULT_FADE_MS }}>
                    {messages[route.trip]}
                  </p>
                {:else}
                  <p transition:fade={{ duration: RESULT_FADE_MS }}>{routeCachedAt(route.cached_at, now, labels)}</p>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </section>
    {:else}
      <p>{labels.route_tools_empty}</p>
    {/each}
  </div>
</PanelWindow>

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
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: var(--route-tools-gap);
  }

  /* The details and the question share one cell, so one wipes out over the other in place. */
  .route-tools__body {
    display: grid;
  }

  .route-tools__view {
    display: grid;
    gap: var(--route-tools-detail-gap);
    grid-area: 1 / 1;
    align-content: center;
  }

  .route-tools__view--room {
    visibility: hidden;
  }

  .route-tools__status {
    display: grid;
  }

  .route-tools__status > p {
    grid-area: 1 / 1;
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
    min-width: 0;
    font-size: var(--travel-window-event-size);
    line-height: 1.2;
  }

  p {
    color: var(--color-muted);
  }

  .route-tools__route {
    display: grid;
    gap: var(--route-tools-detail-gap);
    transition: opacity var(--colour-fade);
  }

  .route-tools__route--dimmed {
    opacity: var(--waiting-opacity);
  }

  .route-tools__route + .route-tools__route {
    border-top: var(--route-tools-rule-width) solid var(--color-dim);
    padding-top: var(--route-tools-gap);
  }

  .route-tools__heading button {
    flex: none;
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

  /* Hidden, not removed, so the heading keeps its height while its row asks. */
  .route-tools__refresh--hidden {
    visibility: hidden;
  }

  .route-tools__heading button:disabled {
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
