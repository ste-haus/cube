# Motion and styling guide

How the panel moves and what its marks mean. The README's [Design](../README.md#design) section is the why; this is the working vocabulary that follows from it, for anyone adding a card, an overlay, or an animation.

The one idea underneath all of it: **a mark or a motion means the same thing everywhere it appears.** The panel is read at a glance from across a room, so the vocabulary is small and nothing is spent on decoration. Before adding a new effect, find the existing one that already says what you mean.

## Colour

- **Grey is the resting state.** `--color-foreground`, `--color-muted`, `--color-dim` and `--color-faint` carry almost everything. Colour is kept for things that have changed or want attention.
- **The tier colours belong to MCW alone, but for a critical traffic incident's red.** Master warning red and master caution amber (`mcw.warning_color`, `mcw.caution_color`) never appear outside the master caution card, except that a critical traffic incident on the departure face is drawn in the master warning's red. A red or amber frame anywhere else would read as an alert. MCW is for the house; an incident is about the road, which the panel's own two colours cannot rank above major, and red is the one colour that says a route has to change. Caution amber stays MCW's alone.
- **A frame is dimmer than what it frames.** Brackets and bands sit a step or more below the content they surround: the transcript's corners are `--color-dim` against `--color-foreground` text, and the camera window's are `--color-muted`.
- **A level is primary, and thin.** The room light's arc and handle are drawn in the primary colour, as the fuel gauges' arcs are, over a `--color-dim` track; the bulb inside takes the light's own colour, as bright as the light is. A bar keeps its grey fill and gives only the fill's leading edge to the primary colour. The one exception is a light's bar set to `fill: light`, as the colour window's brightness bar is by default: its fill is the light's own colour, as strong as the light is bright (from `--slider-colour-dim-floor` of `--slider-colour-strength` at its dimmest to all of it at full), following the edge while it is dragged, because the colour is what that bar is about. Its edge stays primary. A level is a line, never a block of colour: a primary fill the size of a bar shouts.
- **A lit chip is primary.** A chip's icon and its label take the primary colour while its entity is on, and rest in grey; `active_color` overrides the primary.
- **A trip that is due is primary, then secondary.** On the departure face, a trip's countdown and its leave-by time turn the primary colour once leaving is soon and the secondary once it is imminent or gone, the order the fuel gauges' bands run in as a tank empties: breathing while soon, pulsing while imminent; its window's band is solid in the same colour for as long as it is, with the leave-by time in the window drawn in it too and keeping the beat, and quiet otherwise; the window's brackets take the colour and keep the card's beat, phased by the page's clock (`beatPhase` in `src/lib/travel.ts`), as a master's list keeps time with its master. A trip whose person is away from home stays grey throughout, since they are not here to be hurried, and once its time has come its departed icon is muted grey, not the foreground's white: gone is not something to act on. In its window, a route that has got slower says so with a trending-up arrow in the primary colour, the secondary while the trip is imminent, keeping the trip's beat while it is due and still otherwise; one that has got quicker keeps its arrow grey. The rest of the column stays grey.
- **A commute running slow borrows the trip's tiers.** A route that is always there has no time to leave, so on the card its minutes take the same two tiers from how far over its usual time it is: primary and breathing past `slower_percent`, secondary and pulsing past `much_slower_percent`, or with no usual time, past the `traffic_` thresholds over its free flow. It is the same scale read from a different gauge, so it reuses the trip's classes and beat rather than adding a third look. Only the card takes it; the window, its band and its brackets stay as a commute's always have.
- **A traffic incident is primary, then secondary, then red.** On the departure face, the incident band over the map is solid in the worst incident's colour: primary for minor and secondary for major, the order the fuel gauges' bands run in, and the master warning's red for critical (`severityColour` in `src/lib/incidents.ts`). Its type is dark unless the colour is too dark for it (`wantsLightType`, where black and white type would have the same contrast), since `mcw.warning_color` can be set to anything. Its window's band and brackets take the same colour, and each incident's icon, its criticality, and its closed mark take its own. The band is still: it is there for as long as the incidents are, so a beat on it would be a beat that never ends. In the window, a line too long for it travels back and forth to show the rest, as the agenda's running title does, rather than being cut off, since what HERE says of an incident is worth reading whole; a line that fits stays still.
- **Somebody at the door is secondary, pulsing.** A popup is raised because somebody is at the door, which is no danger but is something to act on now, the same urgency as a trip that is imminent, so it takes that trip's look rather than a tier colour: its band solid in the secondary colour with dark type, its brackets in the same colour on the pulse, phased by `beatPhase`, from opening to closing. Its band glints once as it lands, and counts up from when the popup's sensor came on (`+0:42`, `waitingLabel` in `src/lib/popups.ts`) in place of the time of day, since how long they have been waiting is what matters. Every popup is one; there is no quiet popup.
- **An armed alarm is primary.** The guest face's bell is the one mark on it in colour while armed, because it decides whether someone is woken. Its time and wheels stay grey.
- **Tokens live in `src/styles/app.css`.** A new colour, size or duration that more than one rule uses becomes a custom property there, not a literal in a component.

## Rhythm

Every repeating animation on the panel is one of these. Pick by meaning, not by look.

| Rhythm | Timing | Means | Used by |
|---|---|---|---|
| Flash | 1 s, `steps(1, end)` | A warning is lit | Master warning, and its list's brackets |
| Breathe (alert) | 3 s, `ease-in-out`, brightness (a trip fades its opacity to `--travel-breathe-opacity` instead, so a pared icon's outline is not darkened into a rim) | A caution is lit, or a trip is soon | Master caution, and its list's brackets; a departure face trip that is soon |
| Pulse | 0.9 s, `ease-in-out`, opacity down to `--travel-pulse-opacity` (0.3) with a glow of its own colour at the top | Time is up, or nearly | A departure face trip that is imminent or late; a popup's brackets |
| Breathe (settled) | 3 s, `ease-in-out`, opacity to 0.35 | Done and still showing | Transcript brackets once the line has finished |
| Breathe (waiting) | `--waiting-breathe` (1.2 s), `ease-in-out`, opacity to `--waiting-opacity` (0.4) | Asked Home Assistant, waiting on the answer | The reticle, on the floorplan and round a trip's event being sent; the alarm's bell and its time once sent; the room light's bulb once tapped |
| Glow | `--glow-breathe` (1.4 s), `ease-in-out`, a halo in the control's own colour swelling and fading | Being set: a change on its way to Home Assistant | The room light's handle and a bar's primary edge, from the start of a drag until it settles |
| Glint | a sweep across | Live: in flight, or an alert's band | Toggle chip and slider bar while pending (continuous); MCW list header (every 5 s); a popup's band (once, as it lands) |

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

A new window is built on `PanelWindow` in `src/cards/PanelWindow.svelte`, which holds the choreography, so every window opens and closes alike; the camera window, the room light's colour window, and the departure face's route window are built on it, and the master caution list predates it. The caller gives it the origin, the band's words, and the body.

Its band is one of two. `quiet` is a dark strip with light type, for a closer look at something: the camera window. `solid` is drawn the way a lit master's list is, a band with dark type at the heading's size, grey (`--color-muted`) unless the window's control has a colour of its own to show, when the band is that colour (`tint`), with light type over a dark one: the colour window's band is the light's colour, following the marker as it is dragged. Neither glints; a glint on a band is an alert's. A window raised by an alert, a popup, glints once as its band lands (`glint`), and not again, since it stays up for as long as the alert does.

A band's words that come from Home Assistant, like the colour window's light name, can run to any length, so the window takes a fixed `width` from its body and the heading ends in an ellipsis rather than wrapping or widening the window.

A window whose whole job is one choice closes itself once it is made, with `close()`, the same fold back into its origin as a tap on the glass: the colour window, on letting go of the ring, tapping its middle, or setting its brightness bar.

A mark dragged over something the finger hides, like the colour ring, throws a wide glow of its own colour while it is held, breathing at the glow's pace, so what is under the finger still shows round it.

A window of things to look at closes at a tap anywhere. A window of things to press (`interactive`) closes only at a tap on the glass around it.

A window nobody at the panel asked for, a popup raised by a sensor, has nothing to come out of, so it comes out of the middle of the screen and folds back into it. It sits beside the cube, as the masters do, rather than on a face, so it is the same on every side, and it is drawn as an alert, secondary and pulsing (see Colour). Since the tap that meets it was likely meant for the face under it, it closes only at a tap on the glass around it, as an `interactive` window does, and its sensor going off folds it away the same way. `Popups` in `src/cards/Popups.svelte` is the example.

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

A notice that names a `window` opens it with an ordinary tap rather than a hold: a notice is a line of text, and the tap's slop keeps a swipe across the list from opening anything. The row hides while its window is open, as the camera tile does. Which window it opens is `NoticeWindow` in `src/cards/NoticeWindow.svelte`, keyed by the config's `type`, so a new kind is its component and one line there.

A route on the departure face's travel card opens its window the same way, the reticle closing in on the card and the window flying out of it, since a card half the rail wide is too big to swell. Sending a trip to a phone is held the same way too, the reticle closing in on the trip's event over `COLOUR_HOLD_MS`; when the corners meet it sends, and they breathe until Home Assistant answers. The reticle is `Reticle` in `src/cards/Reticle.svelte`, wherever it appears: the holder places it, and it draws the corners, the lock-on, the hold, the breath, and the release.

### Icons ease between their colours

An icon that lights up when its thing is on eases between grey and its colour over `--colour-fade` (400 ms) rather than snapping, so the switch reads as a change: a toggle chip's icon, the alarm's bell as it slides. An icon that turns into another fades across into it, both drawn in the one place, rather than swapping: the route window's phone becomes a ticked phone, or a crossed-out one, over `--travel-send-fade` (250 ms).

### How the cube changes face

How a face change looks says who asked for it. A swipe rotates, in the swipe's direction, because the finger is moving the cube. A tap on the face map cuts straight to the face, because the answer to a direct request is the face itself. A change nobody at the panel asked for, the idle return home or Home Assistant naming a new face through `face_entity`, fades: the outgoing face fades out over `FADE_MS` (250 ms) on top of the incoming one, which is already in place underneath. `FADE_MS` lives in `src/lib/cube.svelte.ts` and reaches the stylesheet as `--face-fade`. A fade that is due while the cube is mid-rotation waits for the rotation to end rather than being dropped.

### A banner drops from under its heading

A band that comes and goes over a card, like the departure face's incident band, slides down out from under the card's heading as its room opens, and back up into it as the room closes, so what is below moves aside rather than being drawn over. It slides over 420 ms, easing in and out, and keeps the words it last had while it leaves rather than emptying first. It is not a row: a row wipes across, and a banner is a sheet pulled down over the top of something. A tap on it opens its window out of it, as any window comes out of what was tapped, and it hides while the window is open so the brackets read as lifting it off the card. A banner sits over a picture that opens a window of its own, so its tap stops there.

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
- **An icon set beside thin figures is pared to their weight.** Material icons are filled shapes, far heavier than Roboto Thin at the same size, and have no weight to turn down. An outline in the background's colour (`-webkit-text-stroke`) eats evenly into every edge instead: the departure face's trip icons use `--travel-icon-pare` (0.05em). It only works over the panel's own background, so it is not for an icon drawn over a picture or a coloured band, and an animation on a pared icon fades its opacity rather than dimming it with `brightness`, which would darken the outline into a visible rim.
- **A card holding more than it shows says so with a chevron.** The departure face's travel card shows two routes and loops through the rest by sideways swipe, one card a swipe; a dim (`--color-dim`) `mdi:chevron-right` at its right edge is the only sign there are more, and since a chevron looks pressable it is: a tap steps on as a swipe left does, unless the finger moved more than a tap's slop, when it was the swipe's. It slides at the floorplan's pace (`--floorplan-slide-duration`) and lapses back to the start after `PANE_RESET_MS`, as every card with panes does.
- **A window's brackets can keep a beat.** `PanelWindow` takes a `bracketColor` and a `beat` (a period, a phase, and how low it fades) for a window about something lit, so the brackets carry its colour and rhythm from opening to closing. Phase it with `beatPhase`, as whatever it came out of was, and the two stay in step.
- **Measure what you animate from.** A picture shown with `object-fit: contain` is smaller than its element; `containedBox` in `src/lib/picture.ts` finds the picture itself.
- **No magic values.** Durations, distances and strengths are named constants or custom properties, like everything else in this repo.

## Checking it

Unit tests cover the logic (`pending`, `picture`), not the motion. To see an animation in the real app, run the demo stub and proxy from `tools/demo/run.sh` and drive headless Chrome over the DevTools protocol: tap with `Input.dispatchMouseEvent`, capture with `Page.captureScreenshot`, and hold `/api/toggle` with `Fetch.enable` to see the waiting state, since the stub answers instantly.
