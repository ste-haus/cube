<script lang="ts">
  import { dismissedAfterClose, popupToShow, stillDismissed } from "../lib/popups";
  import type { Box } from "../lib/picture";
  import { ha } from "../lib/state.svelte";
  import type { Popup } from "../lib/types";
  import CameraWindow from "./CameraWindow.svelte";

  /*
   * Cameras that come up over the panel while their sensors are on, whichever face is showing.
   *
   * Mounted beside the cube rather than on a face, as the masters are, so a popup is the same on
   * every side and the cube can turn under it. Nothing was tapped to ask for one, so its window
   * comes out of the middle of the screen and folds back into it. A sensor going off folds it
   * away; a tap on the glass around it puts it away until the sensor has gone off and come on
   * again. One is up at a time, the first the config lists, since each covers the panel.
   */

  let { popups }: { popups: Popup[] } = $props();

  const HALF = 2;

  const isOn = (entityId: string) => ha.isOn(entityId);

  let dismissed = $state<ReadonlySet<string>>(new Set());
  let shown = $state<{ popup: Popup; from: Box } | null>(null);
  let cameraWindow = $state<ReturnType<typeof CameraWindow> | null>(null);
  // Whether the window showing is being folded away because it is no longer wanted, rather than
  // having been put away by a tap on the glass.
  let foldingAway = false;

  const wanted = $derived(popupToShow(popups, isOn, dismissed));

  $effect(() => {
    const kept = stillDismissed(dismissed, isOn);

    if (kept.size !== dismissed.size) {
      dismissed = kept;
    }
  });

  // A popup that is no longer wanted folds away first; whatever is wanted next opens once it has.
  $effect(() => {
    if (shown === null) {
      if (wanted !== null) {
        shown = { popup: wanted, from: middle() };
      }

      return;
    }

    if (wanted?.entity_id !== shown.popup.entity_id) {
      foldingAway = true;
      cameraWindow?.close();
    }
  });

  /** A point in the middle of the screen, where the brackets fly out from and back to. */
  function middle(): Box {
    return { left: window.innerWidth / HALF, top: window.innerHeight / HALF, width: 0, height: 0 };
  }

  function closed() {
    if (shown !== null) {
      dismissed = dismissedAfterClose(dismissed, shown.popup, foldingAway, isOn);
    }

    foldingAway = false;
    shown = null;
  }
</script>

{#if shown}
  <CameraWindow
    bind:this={cameraWindow}
    camera={shown.popup.camera}
    from={shown.from}
    ratio={shown.popup.ratio}
    sticky
    onclose={closed}
  />
{/if}
