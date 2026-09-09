<script lang="ts">
  import { faceUrl } from "../lib/api";

  /*
   * A face an installation supplies itself, served from the mounted resources directory rather
   * than compiled into the bundle. It is its own document on this origin, so it reaches Home
   * Assistant the way the visualizer does — through the panel's own API — rather than through
   * the state store the built-in faces share.
   */

  let { page, label }: { page: string; label: string } = $props();
</script>

<iframe class="custom-face" src={faceUrl(page)} title={label}></iframe>
