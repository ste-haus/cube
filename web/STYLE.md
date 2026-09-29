# Motion and styling guide

How the panel moves and what its marks mean. The README's [Design](../README.md#design) section is the why; this is the working vocabulary that follows from it, for anyone adding a card, an overlay, or an animation.

The one idea underneath all of it: **a mark or a motion means the same thing everywhere it appears.** The panel is read at a glance from across a room, so the vocabulary is small and nothing is spent on decoration. Before adding a new effect, find the existing one that already says what you mean.

## Colour

- **Grey is the resting state.** `--color-foreground`, `--color-muted`, `--color-dim` and `--color-faint` carry almost everything. Colour is kept for things that have changed or want attention.
- **The tier colours belong to MCW alone.** Master warning red and master caution amber (`mcw.warning_color`, `mcw.caution_color`) never appear outside the master caution card. A red or amber frame anywhere else would read as an alert.
- **A frame is dimmer than what it frames.** Brackets and bands sit a step or more below the content they surround: the transcript's corners are `--color-dim` against `--color-foreground` text, and the camera window's are `--color-muted`.
- **Tokens live in `src/styles/app.css`.** A new colour, size or duration that more than one rule uses becomes a custom property there, not a literal in a component.

## Rhythm

Every repeating animation on the panel is one of these. Pick by meaning, not by look.

| Rhythm | Timing | Means | Used by |
|---|---|---|---|
| Flash | 1 s, `steps(1, end)` | A warning is lit | Master warning, and its list's brackets |
| Breathe (alert) | 3 s, `ease-in-out`, brightness | A caution is lit | Master caution, and its list's brackets |
| Breathe (settled) | 3 s, `ease-in-out`, opacity to 0.35 | Done and still showing | Transcript brackets once the line has finished |
| Breathe (waiting) | 1.2 s, `ease-in-out`, opacity to 0.4 | Asked Home Assistant, waiting on the answer | Floorplan reticle |
| Glint | a sweep across | Live: in flight, or an alert's band | Toggle chip while pending (continuous); MCW list header (every 5 s) |

Flash is reserved for warnings. Nothing but an alert blinks hard.

A glint never goes on something that is always on screen; it is for a state that ends.

## Brackets

Four corner marks, drawn from the global classes in `src/styles/brackets.css` (`.bracket` and `.bracket--top-left` and so on), tuned per use with `--bracket-size`, `--bracket-weight`, `--bracket-inset` and `--bracket-color`. The component adds its own class alongside them for its animation.

Brackets mean **this, specifically, is being attended to**: an alert list opened, a control locked on to, a camera lifted off the wall, an announcement being said. They are not a border style.

- Do not put brackets or a coloured band on panel titles, cards, or anything permanent. Spread that wide, they stop meaning anything.
- The MCW list still draws its own brackets rather than the shared classes; it predates them.

## Motion grammar

### Windows open out of what was tapped

A window over the panel comes out of the thing that asked for it and goes back into it. The master caution list and the camera window share one choreography:

1. The brackets fly from the origin (the master's centre, or the tile's own corners) to the corners of the window's header band, as the glass fades in.
2. The band wipes in left to right between them while the body drops down under it, as one `clip-path` polygon so both move together.
3. Closing runs it backwards: the body folds up into the band, a short hold, then the brackets fly home as the band wipes out and the glass fades.

The beats are `FLY 300 ms`, `WIPE 200 ms`, `EXPAND 240 ms`, `HOLD 150 ms`, with `cubic-bezier(0.65, 0, 0.35, 1)` for the flight both ways, so going home takes as long as coming out. A new window uses the same beats.

Windows are clipped rather than resized, so nothing inside reflows while they open.

A camera window is grey with no glint: a closer look, not an alert.

### Rows wipe left to right, both ways

A row that comes or goes wipes across left to right, arriving and leaving alike, like a readout being written and then struck through. An arriving row opens its room first and then wipes in; a leaving one wipes out and then closes its room, so the rows below slide instead of jumping. Use `wipeIn` and `wipeOut` from `src/lib/wipe.ts`; the notices list is the example.

### Nothing moves until Home Assistant says so

The panel asks and Home Assistant decides. A control never shows its new state optimistically; it shows that it was *heard*, and the real state arrives over the stream.

- Send toggles through `pending.send()` in `src/lib/pending.svelte.ts`, and show `pending.isPending(entityId)` while it waits. The floorplan locks a reticle on; a chip carries a glint.
- A second tap on a control that is still waiting is ignored, so a slow round trip cannot turn into a double toggle.
- The wait ends at the next word from the stream about that entity, or after 10 s, or at once if the proxy refuses the request.

### Deliberate actions are held, not tapped

Anything that should not go off from a brush of the hand is held: the fill runs left to right for the hold's duration, and letting go or sliding off before it is full does nothing. Clearing a master works this way, and so does a toggle chip with `hold_seconds`.

### Leaving is quick

Something that goes away fades in about 250 ms rather than cutting out, and never lingers. The transcript is the example.

### Still unless something is happening

A face that is turned away does not animate and does not fetch. A settled face is still. Every repeating animation above is tied to a state that ends: a lit master, a pending toggle, a line that has been said.

## Mechanics

- **Timings belong to the script, and reach the stylesheet as custom properties** (`style:--camera-fly="{FLY_MS}ms"`), so JavaScript timers and CSS animations cannot drift apart.
- **An overlay that covers the panel must leave the cube.** The faces sit under a CSS perspective, so `position: fixed` inside one is positioned against the cube, not the screen. Mount it with the `portal` action from `src/lib/portal.ts`, or outside the cube as `MasterCaution` is. Stack it under the masters (`z-index` below 6): a warning stays on top of whatever is being looked at.
- **Glass dismissals ignore the tap that opened them.** A touchscreen sends the opening tap a click of its own, which lands on the glass. Arm on `pointerdown` over the glass and only close on a click that was armed.
- **A tap is not a swipe.** Anything tappable inside the cube checks how far the pointer moved between press and release (the camera uses 10 px) so a drag that turns the cube does not also open something.
- **Measure what you animate from.** A picture shown with `object-fit: contain` is smaller than its element; `containedBox` in `src/lib/picture.ts` finds the picture itself.
- **No magic values.** Durations, distances and strengths are named constants or custom properties, like everything else in this repo.

## Checking it

Unit tests cover the logic (`pending`, `picture`), not the motion. To see an animation in the real app, run the demo stub and proxy from `tools/demo/run.sh` and drive headless Chrome over the DevTools protocol: tap with `Input.dispatchMouseEvent`, capture with `Page.captureScreenshot`, and hold `/api/toggle` with `Fetch.enable` to see the waiting state, since the stub answers instantly.
