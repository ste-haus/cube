<script lang="ts">
  import Blank from "./Blank.svelte";
  import CameraGrid from "./CameraGrid.svelte";
  import CameraHero from "./CameraHero.svelte";
  import CustomFace from "./CustomFace.svelte";
  import Dashboard from "./Dashboard.svelte";
  import { provideVisibility } from "../lib/cube.svelte";
  import type { CameraGridOptions, CameraHeroOptions, DashboardConfig, Face } from "../lib/types";

  /*
   * One side of the cube: which renderer draws it, and whether it is the side being looked at.
   *
   * The dispatch lives here rather than in the cube itself so that every face is a component
   * boundary, which is what lets the answer to "am I being looked at" be published once here
   * and read by any card, however deep, without being threaded through as a prop.
   *
   * A face turned away from stays built but is not painted, so what it drew is still there
   * when it comes back. `showing` is what the cards read, and it goes false the moment the
   * cube starts turning away — the face is still painted through the animation, but nothing on
   * it should still be doing work.
   */

  const DASHBOARD_CONTENT = "dashboard";
  const CUSTOM_CONTENT = "custom";
  const CAMERA_GRID_CONTENT = "camera-grid";
  const CAMERA_HERO_CONTENT = "camera-hero";

  let {
    face,
    name,
    showing,
    painted,
    animation,
    config,
  }: {
    face: Face;
    name: string;
    showing: boolean;
    painted: boolean;
    animation: string;
    config: DashboardConfig;
  } = $props();

  // A getter rather than the value, so a card reading it re-runs when the cube turns.
  provideVisibility({
    get showing() {
      return showing;
    },
  });

  /* Options are whatever the renderer named in `content` asks for, and the config load has
   * already refused a face whose options that renderer could not draw with. */
  const gridOptions = $derived(face.options as unknown as CameraGridOptions);
  const heroOptions = $derived(face.options as unknown as CameraHeroOptions);
</script>

<div class="cube-face {animation}" class:cube-face--unpainted={!painted}>
  {#if face.content === DASHBOARD_CONTENT}
    <Dashboard {config} />
  {:else if face.content === CUSTOM_CONTENT && face.page}
    <CustomFace page={face.page} label={face.label || name} />
  {:else if face.content === CAMERA_GRID_CONTENT}
    <CameraGrid options={gridOptions} />
  {:else if face.content === CAMERA_HERO_CONTENT}
    <CameraHero options={heroOptions} />
  {:else}
    <Blank label={face.label || name} />
  {/if}
</div>
