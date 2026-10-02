# Motion and styling guide

How the panel moves and what its marks mean. The README's [Design](../README.md#design) section is the why; this is the working vocabulary that follows from it, for anyone adding a card, an overlay, or an animation.

The one idea underneath all of it: **a mark or a motion means the same thing everywhere it appears.** The panel is read at a glance from across a room, so the vocabulary is small and nothing is spent on decoration. Before adding a new effect, find the existing one that already says what you mean.

## Colour

- **Grey is the resting state.** `--color-foreground`, `--color-muted`, `--color-dim` and `--color-faint` carry almost everything. Colour is kept for things that have changed or want attention.
- **The tier colours belong to MCW alone.** Master warning red and master caution amber (`mcw.warning_color`, `mcw.caution_color`) never appear outside the master caution card. A red or amber frame anywhere else would read as an alert.
- **A frame is dimmer than what it frames.** Brackets and bands sit a step or more below the content they surround: the transcript's corners are `--color-dim` against `--color-foreground` text, and the camera window's are `--color-muted`.
- **A level is primary, and thin.** The room light's arc and handle are drawn in the primary colour, as the fuel gauges' arcs are, over a `--color-dim` track; the bulb inside takes the light's own colour, as bright as the light is. A bar keeps its grey fill and gives only the fill's leading edge to the primary colour. The one exception is a light's bar set to `fill: light`, as the colour window's brightness bar is by default: its fill is the light's own colour, as strong as the light is bright (from `--slider-colour-dim-floor` of `--slider-colour-strength` at its dimmest to all of it at full), following the edge while it is dragged, because the colour is what that bar is about. Its edge stays primary. A level is a line, never a block of colour: a primary fill the size of a bar shouts.
- **A lit chip is primary.** A chip's icon and its label take the primary colour while its entity is on, and rest in grey; `active_color` overrides the primary.
- **An armed alarm is primary.** The guest face's bell is the one mark on it in colour while armed, because it decides whether someone is woken. Its time and wheels stay grey.
- **Tokens live in `src/styles/app.css`.** A new colour, size or duration that more than one rule uses becomes a custom property there, not a literal in a component.

## Rhythm

Every repeating animation on the panel is one of these. Pick by meaning, not by look.

| Rhythm | Timing | Means | Used by |
|---|---|---|---|
| Flash | 1 s, `steps(1, end)` | A warning is lit | Master warning, and its list's brackets |
| Breathe (alert) | 3 s, `ease-in-out`, brightness | A caution is lit | Master caution, and its list's brackets |
| Breathe (settled) | 3 s, `ease-in-out`, opacity to 0.35 | Done and still showing | Transcript brackets once the line has finished |
| Breathe (waiting) | `--waiting-breathe` (1.2 s), `ease-in-out`, opacity to `--waiting-opacity` (0.4) | Asked Home Assistant, waiting on the answer | Floorplan reticle; the alarm's bell and its time once sent; the room light's bulb once tapped |
| Glow | `--glow-breathe` (1.4 s), `ease-in-out`, a halo in the control's own colour swelling and fading | Being set: a change on its way to Home Assistant | The room light's handle and a bar's primary edge, from the start of a drag until it settles |
| Glint | a sweep across | Live: in flight, or an alert's band | Toggle chip and slider bar while pending (continuous); MCW list header (every 5 s) |

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

A bar is `SliderBar` in `src/cards/SliderBar.svelte`, wherever it appears: the guest face's column of them and the colour window's brightness bar are the same component.

A new window is built on `PanelWindow` in `src/cards/PanelWindow.svelte`, which holds the choreography, so every window opens and closes alike; the camera window and the room light's colour window are built on it, and the master caution list predates it. The caller gives it the origin, the band's words, and the body.

Its band is one of two. `quiet` is a dark strip with light type, for a closer look at something: the camera window. `solid` is drawn the way a lit master's list is, a band with dark type at the heading's size, grey (`--color-muted`) unless the window's control has a colour of its own to show, when the band is that colour (`tint`), with light type over a dark one: the colour window's band is the light's colour, following the marker as it is dragged. Neither glints; a glint on a band is an alert's.

A window whose whole job is one choice closes itself once it is made, with `close()`, the same fold back into its origin as a tap on the glass: the colour window, on letting go of the ring, tapping its middle, or setting its brightness bar.

A mark dragged over something the finger hides, like the colour ring, throws a wide glow of its own colour while it is held, breathing at the glow's pace, so what is under the finger still shows round it.

A window of things to look at closes at a tap anywhere. A window of things to press (`interactive`) closes only at a tap on the glass around it.

### Rows wipe left to right, both ways

A row that comes or goes wipes across left to right, arriving and leaving alike, like a readout being written and then struck through. An arriving row opens its room first and then wipes in; a leaving one wipes out and then closes its room, so the rows below slide instead of jumping. Use `wipeIn` and `wipeOut` from `src/lib/wipe.ts`; the notices list is the example.

The one exception is something that comes out of a control and goes back into it, as a window does. It is written in away from the control and erased back towards it, with `wipeFromStart`, rather than struck through left to right, because where it goes is part of what it means. The alarm is the example: arming slides the bell from the middle to the left to make room, then writes the time in left to right away from it; disarming erases the time right to left into the bell, then slides the bell back. The steps run one after the other, the slide taking the share of `WIPE_MS` a row's room takes, and the order comes from a delay set with the state, so arming slides first and disarming wipes first. The room is held by an invisible copy of what comes and goes, so the card never changes size and the control has a fixed place to slide to.

### Nothing moves until Home Assistant says so

The panel asks and Home Assistant decides. A control never shows its new state optimistically; it shows that it was *heard*, and the real state arrives over the stream.

- Send toggles through `pending.send()` in `src/lib/pending.svelte.ts`, and show `pending.isPending(entityId)` while it waits. The floorplan locks a reticle on; a chip carries a glint.
- A second tap on a control that is still waiting is ignored, so a slow round trip cannot turn into a double toggle.
- The wait ends at the next word from the stream about that entity, or after 10 s, or at once if the proxy refuses the request.
- Values go the same way, through `pending.set()`. A value is set by dragging the mark that shows it, the dial's handle or a bar's primary edge, and the arc or fill comes with it: the handle and its level are one mark, so they move together under the finger and stay where they were let go until Home Assistant answers. This is the one place something moves before Home Assistant has said so, and it is only ever what the finger is holding. The held mark grows (`--held-grow`, and a bar's edge stands out of the bar by `--slider-held-stretch`), so it is plain it has been taken hold of. From the start of a drag it glows, and it settles `SETTLE_MS` (1.5 s) after it is let go, or at the answer if that is later, at the end of a glow on `animationiteration`, so it fades out rather than snapping off. Anything else that moves a level, a tap or a change Home Assistant reports from somewhere else, slides it there over `LEVEL_SLIDE_MS` (450 ms) rather than jumping, with `SlidingLevel` in `src/lib/level.svelte.ts`, which follows the finger at once and takes its first level at once, so nothing slides onto the screen. `Breath` in `src/lib/breath.svelte.ts` keeps the glow's time; make one in the component's script, not in its markup, since state made while the markup is being drawn is not state the markup follows.
- A light's level or hue is sent while it is dragged, so the light follows the finger, through `LiveSend` in `src/lib/live.ts`. It is paced, not sent at every move: the first change goes at once, then only the latest, once the last request has come back, `LIVE_INTERVAL_MS` (250 ms) has passed, and the value has moved at least `LIVE_BRIGHTNESS_STEP` (2%) or `LIVE_HUE_STEP_DEGREES` (3°); a light and the bridge or mesh behind it take a handful of commands a second, and a flood plays out long after the finger stops. Letting go sends where it landed. A streamed value goes through `pending.stream()`, which counts the entity as answered only once it matches the value, so the late answer to an earlier send does not pull the mark back. A cover is never streamed: a motor told a stream of places stops and starts at each.
- A value edited in steps, like the alarm's wheels, is a draft: it shows at once, is sent once the presses stop (1.5 s), and breathes until the answer, then gives way to Home Assistant's value whether or not it matches. Sending each press would make the next press land on the last answer rather than on what is showing.

### Deliberate actions are held, not tapped

Anything that should not go off from a brush of the hand is held: the fill runs left to right for the hold's duration, and letting go or sliding off before it is full does nothing. Clearing a master works this way, and so does a toggle chip with `hold_seconds`.

A hold that opens something rather than switching it swells what is held for the hold's length instead: the room light's bulb grows over 0.6 s, and letting go before then is an ordinary tap. Held long enough, it opens its window, and letting go afterwards does nothing. Where there is nothing to open, a light that cannot be coloured, the hold does nothing at all and does not swell, so it never promises what it cannot do.

Something too big to swell, like a floorplan light that fills its room, has the reticle close in on it over the hold instead, the lock-on stretched to the hold's length, and its window flies out of the reticle's corners. The hold's length is `COLOUR_HOLD_MS` in `src/lib/hue.ts`, shared by both.

### Icons ease between their colours

An icon that lights up when its thing is on eases between grey and its colour over `--colour-fade` (400 ms) rather than snapping, so the switch reads as a change: a toggle chip's icon, the alarm's bell as it slides.

### How the cube changes face

How a face change looks says who asked for it. A swipe rotates, in the swipe's direction, because the finger is moving the cube. A tap on the face map cuts straight to the face, because the answer to a direct request is the face itself. A change nobody at the panel asked for, the idle return home or Home Assistant naming a new face through `face_entity`, fades: the outgoing face fades out over `FADE_MS` (250 ms) on top of the incoming one, which is already in place underneath. `FADE_MS` lives in `src/lib/cube.svelte.ts` and reaches the stylesheet as `--face-fade`. A fade that is due while the cube is mid-rotation waits for the rotation to end rather than being dropped.

### Leaving is quick

Something that goes away fades in about 250 ms rather than cutting out, and never lingers. The transcript is the example.

### Still unless something is happening

A face that is turned away does not animate and does not fetch. A settled face is still. Every repeating animation above is tied to a state that ends: a lit master, a pending toggle, a line that has been said.

## Mechanics

- **Timings belong to the script, and reach the stylesheet as custom properties** (`style:--camera-fly="{FLY_MS}ms"`), so JavaScript timers and CSS animations cannot drift apart.
- **An overlay that covers the panel must leave the cube.** The faces sit under a CSS perspective, so `position: fixed` inside one is positioned against the cube, not the screen. Mount it with the `portal` action from `src/lib/portal.ts`, or outside the cube as `MasterCaution` is. Stack it under the masters (`z-index` below 6): a warning stays on top of whatever is being looked at.
- **Glass dismissals ignore the tap that opened them.** A touchscreen sends the opening tap a click of its own, which lands on the glass. Arm on `pointerdown` over the glass and only close on a click that was armed.
- **A gesture that keeps the cube still listens natively.** Svelte delegates `onpointerup` and friends to the document, so by the time a handler in markup runs, the cube's own listener has already read the gesture as a swipe, and `stopPropagation` there is too late. A control that claims a drag (a slider, the forecast) binds its listeners on the element with an action, as `swipeable` and `Sliders` do.
- **A dial belongs to its ring.** The room's light claims a press on its arc, in any direction, and leaves a press on the bulb inside it to be a tap or the cube's swipe. A large control in the middle of a face would otherwise be a large patch of face that cannot be turned from.
- **Nothing read-only sits over a control.** An overlay that only shows something, like the announcement's full-width band, takes `pointer-events: none`, so a control under it (the alarm, at the foot of the guest face) still takes its taps.
- **A drag decides its axis once.** A slider waits for 10 px of movement, then takes the drag if it went more along than up or down, captures the pointer, and stops the release reaching the cube. A drag that started vertical is the cube's even if it later turns sideways.
- **A tap is not a swipe.** Anything tappable inside the cube checks how far the pointer moved between press and release (the camera uses 10 px) so a drag that turns the cube does not also open something.
- **Measure what you animate from.** A picture shown with `object-fit: contain` is smaller than its element; `containedBox` in `src/lib/picture.ts` finds the picture itself.
- **No magic values.** Durations, distances and strengths are named constants or custom properties, like everything else in this repo.

## Checking it

Unit tests cover the logic (`pending`, `picture`), not the motion. To see an animation in the real app, run the demo stub and proxy from `tools/demo/run.sh` and drive headless Chrome over the DevTools protocol: tap with `Input.dispatchMouseEvent`, capture with `Page.captureScreenshot`, and hold `/api/toggle` with `Fetch.enable` to see the waiting state, since the stub answers instantly.
