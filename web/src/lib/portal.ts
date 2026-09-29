/**
 * Moves an element out to the end of the page, for as long as it exists.
 *
 * The cube's faces are laid out in 3D, and anything under a perspective is positioned against
 * it rather than against the screen, however it is written. A window meant to cover the whole
 * panel has to leave the cube to do it. Used as a Svelte action, so it goes with its element.
 */
export function portal(node: HTMLElement) {
  document.body.append(node);

  return {
    destroy() {
      node.remove();
    },
  };
}
