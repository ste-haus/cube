<script lang="ts">
  import type { Component } from "svelte";
  import type { Box } from "../lib/picture";
  import type { DashboardConfig, NoticeWindow } from "../lib/types";
  import IncidentsNoticeWindow from "./IncidentsNoticeWindow.svelte";

  /*
   * The window a tapped notice opens, picked by the kind its config names. Every kind takes the
   * same props and reads what it needs of the rest of the config itself, so a new kind is its
   * component and one line here.
   */

  interface WindowProps {
    window: NoticeWindow;
    config: DashboardConfig;
    from: Box;
    onlanding: () => void;
    onclose: () => void;
  }

  const WINDOWS: Record<NoticeWindow["type"], Component<WindowProps>> = {
    incidents: IncidentsNoticeWindow as Component<WindowProps>,
  };

  let props: WindowProps = $props();

  const Window = $derived(WINDOWS[props.window.type]);
</script>

<Window {...props} />
