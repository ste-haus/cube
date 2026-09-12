# Panels and profiles

One instance of cube serves every panel in the house. A **profile** is a panel's identity: which cube faces it has, which floorplan level it opens on, and which speaker its announcement overlay follows.

## Addressing a panel

```
/?profile=<key>  a named panel
/                falls back to CUBE_PROFILE, then to the profile called `default`
```

Point each tablet at its own URL and it keeps its own identity. Nothing is stored on the tablet, so a replacement device only needs the same address.

A key that is not defined gets `default` and a line in the log. Because `default` names no speaker, a mistyped address shows a plainly generic panel that raises no announcements, rather than one convincingly wearing another room's identity.

## The default profile

`default` is the template every other profile is built from, not a panel in its own right. It must define all six faces, and it must not name a `media_player` — a speaker there could never reach a panel, because speakers are not inherited.

```yaml
profiles:
  default:
    name: Default
    floorplan: downstairs
    faces:
      front:
        content: dashboard
      back:
        content: blank
        label: back
      left:
        content: blank
        label: left
      right:
        content: blank
        label: right
      up:
        content: blank
        label: up
      down:
        content: blank
        label: down
```

## Defining a panel

A panel states only what makes it different. Everything else comes from the profile it inherits, which is `default` unless `inherits` says otherwise.

```yaml
  # Everything from default, plus the speaker it listens for.
  kitchen:
    name: Kitchen
    media_player: media_player.kitchen_speaker

  # The other storey, and a face of its own on the front.
  bedroom:
    name: Bedroom
    floorplan: upstairs
    media_player: media_player.bedroom_speaker
    faces:
      front:
        content: custom
        page: nightstand
```

| Field | Meaning | Inherited |
|---|---|---|
| `name` | For your own reference; defaults to the key | No |
| `floorplan` | The level this panel opens on, and returns to | Yes |
| `media_player` | The speaker whose announcements raise the overlay | **No** |
| `inherits` | The profile to start from; `default` when absent | — |
| `faces` | What sits on each of the six faces, merged by face name | Yes |

`media_player` is the one field that never crosses an inheritance edge, and the reason is worth stating: a panel following the wrong room's speaker looks exactly like one that works, right up until an announcement lights up the wrong wall. A profile names its own speaker or has none.

Faces merge by name, and naming one replaces it outright. A profile that sets `front` keeps its parent's other five untouched; it does not blend `content` from one and `label` from another.

## Sharing a parent between panels

`inherits` chains as deep as you like, and the profile in the middle does not have to be a panel. Where several panels have something in common that is not true of the whole house, give that thing its own profile and inherit it:

```yaml
  # Nothing is pointed at this. It exists so the panels upstairs say once what being
  # upstairs means, rather than each repeating it.
  upstairs:
    name: Upstairs
    floorplan: upstairs

  bedroom:
    name: Bedroom
    inherits: upstairs
    media_player: media_player.bedroom_speaker

  study:
    name: Study
    inherits: upstairs
    media_player: media_player.study_speaker
```

A profile no panel addresses costs nothing. Because it names no `media_player`, it also stays out of the set of speakers the announcement relay will fetch for.

Cycles, a parent that does not exist, and a `floorplan` that was never declared are all refused when the config loads, naming what is wrong — so a mistake here is a process that will not start, rather than a panel that looks plausible on a wall.

## Faces

| `content` | Draws |
|---|---|
| `dashboard` | The dashboard: clock, notices, timeline, floorplan, forecast, camera, gauges |
| `camera-grid` | A grid of cameras, laid out as the config writes it |
| `camera-hero` | One camera at size, with the rest in a column beside it |
| `weather` | The conditions, the wind, and how it feels, today's range, the sun and moon against the horizon, the forecast, and a radar and cameras |
| `custom` | A page you supply yourself, served from the resources directory |
| `blank` | Nothing but its own label |

| Field | Meaning |
|---|---|
| `content` | Which renderer draws the face |
| `label` | The face's name, set up its left edge |
| `label_strip` | Whether to draw that strip at all; on unless you say otherwise |
| `page` | For `custom`: the directory under `faces/` in the resources directory holding its `index.html` |
| `options` | Handed to the renderer, which decides what it means |

The two camera faces are what `options` is for — see [Camera faces](cameras.md).

The `weather` face draws from the `weather` block, and a config that puts one on a panel without that block is refused when it loads. Its card for the sky and the temperature now is the dashboard's own, so the two faces never disagree about the present. The high and low the dashboard sets beside it are left out here, where the temperature range gives the day's. See [weather](configuration.md#weather) for the settings only this face reads.

The face lays out like the dashboard, without boxes or headings, in two columns each as wide as the dashboard's middle one, centred on the face. The right column starts as far down as the dashboard's own, so the sky now sits at the same height on either face, and spaces its rows wider, so the forecast at its foot is shorter for it. The sky now sits in the middle of its row with the wind to its left and how the weather feels to its right, each centred in the space beside it; under them are today's temperature range and the daylight bar one over the other with their ends lined up; then the sun's path, drawn from half a day before now to half a day after so the sun and moon stay in its middle while the day and night move past, with the part of the day already gone in the same faint wash as the chance of rain; and the forecast in whatever height is left. The dashboard's forecast in words is left out, since the chart says as much. The range reads over its bar and the daylight under its own, so the pair sit close. The daylight bar carries the sunrise and sunset times, so the path leaves them out rather than showing them twice. The left column is the radar, with the pictures in a row beneath it, dimmed a little so they sit behind it.

The wind is a compass without its letters, the cross running out past the circle and short marks across it at the points between, with an arrow across it pointing the way the wind is blowing and the speed at the arrow's point, in the weather entity's own unit, which it leaves unsaid. Home Assistant gives the bearing the wind comes from, degrees or a compass point, so the arrow points the other way. A calm draws no arrow and gives its speed at the centre. A gust at or over the `weather` block's `wind_gust_threshold` (15 unless you say otherwise, in the entity's own unit), and stronger than the steady wind, is given past the arrow's tail; a lighter one says nothing the wind itself does not.

How the weather feels is the temperature it feels like, from the weather entity's `apparent_temperature`, in the middle of a ring that fills with its `humidity` from the top round clockwise, shading from a dark grey when the air is dry to the same muted blue as the chance of rain when it is saturated. The feels-like figure is greyed while it is within two degrees of the temperature itself, when it says little the temperature does not. An entity that gives neither leaves the card out.

The forecast opens on the hours from now to twelve hours on: a smooth line of the temperature, in the primary colour when the span ends no cooler than it starts and the secondary when it ends cooler, counted in the whole degrees it shows, and given in figures now, at the far end, and at any high or low between that the ends do not show, with the other hours as dots; the sky now, at the far end, and at each hour it changes between; and the chance of rain as a shaded, edged curve behind it all, along the chart's foot for a dry hour among wet ones, its full height for certain, and not drawn at all when every hour is dry. When any of the hours, now among them, is forecast to snow, it is drawn as snow instead: a white edge over a light grey wash. The figure and the sky now are the current temperature and the current sky, day or night as the sun really is, so they agree with the rest of the face. Both curves pass through every hour's value without overshooting it, so a peak tops out at the hour's own figure and a dry stretch stays flat. The temperature is drawn over at least ten degrees Fahrenheit, or five and a half Celsius, so a degree or two either way looks like a degree or two rather than filling the chart. It is headed only by "Now" and the time it runs to, on a 24-hour clock, in grey. A sideways swipe across it slides to the week, whose highs and lows are the same smooth curves, with no lines between the days, and whose chance of rain or snow is drawn behind them as the hours' is. It slides back to the hours a minute after it was last swiped, the way the floorplan goes back to its own storey, and an upward or downward swipe on it still turns the cube. The daylight bar runs sunrise to sunset while the sun is up and sunset to sunrise after dark, so its marker always travels left to right, and the reading under the marker is how long is left — whole hours, then minutes for the last one.

Its one option is `tiles`, and where each lands follows from what it is. A radar goes at the top of the left column, over two thirds of it. Cameras and frames go in a row across the third beneath, in the order written, sharing its width. A `title` captions any of them; leave it out for a picture with no caption. With no radar the pictures take the whole column, and with no pictures the radar does.

```yaml
up:
  content: weather
  label: Weather
  options:
    tiles:
      - radar:
      - camera.satellite
      - entity_id: camera.smoke_forecast
        polling_interval: 600
      - url: https://frames.example/wind.html
        title: Wind
```

A **radar** is the last couple of hours of rain from RainViewer, looped over a dark vector map of OpenStreetMap and centred on `weather.zone_entity_id`, which it will not load without. It never pans or zooms. `radar:` on its own takes the defaults:

| Field | Default | Meaning |
|---|---|---|
| `zoom` | `7` | How close the map is. RainViewer's free radar goes no closer than 7, and a config asking for more is refused |
| `rings` | `[25, 50, 100]` | Distances from home to draw a ring at |
| `ring_unit` | `mi` | `mi` or `km` |
| `frame_seconds` | `0.2` | How long each frame shows |
| `pause_seconds` | `0.5` | How long the newest frame holds before the loop starts over |

The map is drawn in the panel by MapLibre, from OpenStreetMap's vector tiles and the "eclipse" style VersaTiles serves, so it needs no key; the rain goes in under its place names so they read through it. Its highways are greyed, since the style's orange reads like rain, and home is a white dot at the centre. The rain, and the map's style, icons, and lettering, come through cube, which fetches each once for every panel and keeps it on disk (see [the cache](configuration.md#the-cache)); only the map's vector tiles come straight from VersaTiles. A panel asks for any of it only while the face is being looked at. The rain is RainViewer's "Universal Blue": the faint tan under the blue is its weakest band, echoes too slight to be measurable rain, which is often birds, insects, or the ground near a radar rather than weather.

MapLibre needs WebGL2. A panel without it, or whose browser takes the drawing context back, gets the rain, rings, and home on plain dark ground instead of a map.

Credits sit in a footer along the radar's foot that fades up when a pointer is over it; on a touchscreen, a tap does the same.

Otherwise a tile is a camera, written exactly as on a camera face, or a **frame**: another page, drawn edge to edge with no border, title, or scrollbars. `url` must be http or https. The frame itself draws nothing but the page; its `title` names it to anything reading the panel, and on the weather face it is the caption over the frame.

A frame is loaded only while its face is being looked at and unloaded when the cube turns away, so a page that animates for as long as it is open costs nothing on a face nobody is looking at; coming back reloads it. It takes no touches unless it has `interactive: true`, so a swipe across it turns the cube rather than panning whatever the page is showing. The page has to allow being framed by the panel's origin, which is the page's decision rather than cube's.

### The label strip

Every face but the dashboard carries its name up its left edge, set small and uppercase, reading upward against a hairline rule. It is how a panel says which of the six you are looking at, on faces that have nothing else to say so. A face with no `label` of its own falls back to its position — `back`, `left`, `up`.

```yaml
faces:
  # The dashboard lays out to the full width, so it gives the strip back.
  front:
    content: dashboard
    label_strip: false

  right:
    content: camera-grid
    label: Traffic Cameras
```

The strip takes its width off the face rather than sitting over it, so nothing is ever drawn underneath it — worth knowing for a `custom` face, whose page gets the remaining width. The dots in the corner step aside for it, so the two never overlap.

Turning the strip off on a `blank` face puts the name across the middle of it instead, which is where it used to live.

`custom` is a page you supply yourself — see [Custom faces](custom-faces.md). It is additive: the built-in faces stay where they are, and nothing is rebuilt to add one. A `page` that is not on disk when the process starts falls back to a labelled blank, with a line in the log saying where it looked.

Which cards a face renders is fixed. `options` lets you configure the cards a face already has; it does not add or remove them. A face whose options its renderer cannot draw with is refused when the config loads, naming the face and the profile.

## The cube

Swipe, or press an arrow key, to turn it. The map of dots in the corner shows which face is showing and jumps straight to any of them.

The panel returns to the front face after two minutes untouched, so a panel left mid-rotation rights itself.

A face is built the first time you turn to it and kept from then on, so coming back to one finds it as you left it — the camera still showing its last frame, the floorplan not fetched again. A face you have never turned to is never built. Keeping one costs the markup and nothing else: it is not painted, its animations do not run, and its cards release their timers, so only the face being looked at is doing any work.

Rotation animates two faces at once — the outgoing one pivoting away, the incoming one pivoting in. It is done this way rather than as a single spinning box because a real box needs a depth of half its width to turn one way and half its height to turn the other, and a screen is rarely square.

The graph tracks which face is showing but not how the cube is rolled. Each great circle — front, right, back, left, and front, up, back, down — is a clean loop you can go round in either direction. Stepping between the two circles lands on a real face without remembering the way round.

## Serving several rooms

Add a profile per panel and give each its own address. They share one connection to Home Assistant, so the tenth panel costs no more upstream traffic than the first.

Panels that show a camera, an agenda, or a forecast do each ask for those separately, so if you run many of them and notice Home Assistant working harder than you expected, that is where to look first.
