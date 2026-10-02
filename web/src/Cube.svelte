<script lang="ts">
  import { untrack } from "svelte";
  import { Cube, FACES, FADE_MS, swipeable, type Direction, type FaceName } from "./lib/cube.svelte";
  import { ha } from "./lib/state.svelte";
  import CubeFace from "./faces/CubeFace.svelte";
  import MasterCaution from "./cards/MasterCaution.svelte";
  import type { DashboardConfig } from "./lib/types";

  const BLANK_CONTENT = "blank";

  // The unfolded cube, laid out the way the face map reads: the equator on the middle row
  // with the poles above and below it.
  const MAP_LAYOUT: (FaceName | null)[] = [
    null, "up", null, null,
    "left", "front", "right", "back",
    null, "down", null, null,
  ];

  let { config }: { config: DashboardConfig } = $props();

  // The config is fetched once and never replaced, so the cube is built for its home face once.
  const cube = new Cube(untrack(() => config.profile.default_face));

  $effect(() => {
    cube.follow(ha.state(config.profile.face_entity));
  });

  function faceFor(name: FaceName) {
    return (
      config.profile.faces[name] ??
      { content: BLANK_CONTENT, label: name, label_strip: true, page: null, options: {} }
    );
  }

  function onSwipe(direction: Direction) {
    cube.rotate(direction);
  }
</script>

<div class="cube" style:--face-fade="{FADE_MS}ms" use:swipeable={{ onSwipe, keyboard: true }}>
  {#each FACES as name (name)}
    {#if cube.isBuilt(name)}
      <CubeFace
        face={faceFor(name)}
        {name}
        {config}
        showing={cube.current === name}
        painted={cube.isVisible(name)}
        animation={cube.animationClass(name)}
      />
    {/if}
  {/each}
</div>

{#if config.mcw}
  <MasterCaution mcw={config.mcw} labels={config.labels} />
{/if}

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
