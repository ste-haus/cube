<script lang="ts">
  /*
   * A face with nothing on it, which still has to look deliberate rather than like a panel
   * that has died. The strip up the left edge does that on its own, so the name is set across
   * the middle only when there is no strip to carry it.
   */

  let { label, named }: { label: string; named: boolean } = $props();
</script>

<div class="blank-face">{named ? label : ""}</div>
