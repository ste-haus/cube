<script lang="ts">
  import { Cube, FACES, swipeable, type Direction, type FaceName } from "./lib/cube.svelte";
  import Blank from "./faces/Blank.svelte";
  import CustomFace from "./faces/CustomFace.svelte";
  import Dashboard from "./faces/Dashboard.svelte";
  import type { DashboardConfig } from "./lib/types";

  const DASHBOARD_CONTENT = "dashboard";
  const CUSTOM_CONTENT = "custom";

  // The unfolded cube, laid out the way the face map reads: the equator on the middle row
  // with the poles above and below it.
  const MAP_LAYOUT: (FaceName | null)[] = [
    null, "up", null, null,
    "left", "front", "right", "back",
    null, "down", null, null,
  ];

  let { config }: { config: DashboardConfig } = $props();

  const cube = new Cube();

  function faceFor(name: FaceName) {
    return config.profile.faces[name] ?? { content: "blank", label: name };
  }

  function onSwipe(direction: Direction) {
    cube.rotate(direction);
  }
</script>

<div class="cube" use:swipeable={{ onSwipe, keyboard: true }}>
  {#each FACES as name (name)}
    {#if cube.isVisible(name)}
      {@const face = faceFor(name)}
      <div class="cube-face {cube.animationClass(name)}">
        {#if face.content === DASHBOARD_CONTENT}
          <Dashboard {config} />
        {:else if face.content === CUSTOM_CONTENT && face.page}
          <CustomFace page={face.page} label={face.label || name} />
        {:else}
          <Blank label={face.label || name} />
        {/if}
      </div>
    {/if}
  {/each}
</div>

<nav class="face-map" aria-label="Cube faces">
  {#each MAP_LAYOUT as name, index (index)}
    {#if name}
      <button
        type="button"
        class="face-map__cell"
        class:face-map__cell--active={cube.current === name}
        aria-label={name}
        onclick={() => cube.show(name)}
      ></button>
    {:else}
      <span></span>
    {/if}
  {/each}
</nav>
