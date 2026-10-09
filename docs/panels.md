# Panels and profiles

One instance of cube serves every panel in the house. A **profile** is a panel's identity: which cube faces it has, which face and floorplan level it opens on, and which speaker its announcement overlay follows.

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
| `default_face` | The cube face this panel opens on, and returns to; `front` when absent | Yes |
| `face_entity` | An entity whose state names the face this panel should be on right now; empty or unrecognised falls back to `default_face`. `default` follows nothing, whatever the parent follows | Yes |
| `popups` | Whether the [popups](configuration.md#popups) come up on this panel; `true` when no profile in the chain says | Yes |
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
| `guest` | For a guest room: the clock, how to join the network, the room's light and blinds, the weather, today's range and the forecast, and an alarm clock |
| `departure` | For the way out: the clock, a traffic map, how long the trips under way will take and when to leave for them, and the fuel gauges |
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

### The guest face

A guest room's front: what a guest needs, and none of the household's notices, calendars, or floorplan. It is laid out on the dashboard's grid, so the header, the clock, and the weather sit exactly where they do on the dashboard, and a guest moving between rooms finds them in the same place.

- **Left:** the clock, then the network, centred in the column: its name and password written out, and under them a code a phone's camera scans to join. The alarm clock is under the code. The code is drawn by a page you name in `qr_url`, framed and asked for at the size it is shown at. Both come from the entities, so changing the password in Home Assistant changes every panel with the next state update.
- **Middle:** the room. Its light, large, then a bar for each cover or further light, filled in grey as far as it is open or bright, with the fill's leading edge in the primary colour, then chips for anything that only switches.
- **Right:** the weather now and the forecast in words, as on the dashboard, then today's temperature range and the forecast.

The announcement and its overlay work as on the dashboard.

```yaml
gb:
  faces:
    front:
      content: guest
      label_strip: false
      options:
        wifi:
          ssid_entity_id: sensor.guest_wifi_ssid
          password_entity_id: input_text.guest_wifi_password
          hidden: true
          qr_url: https://qr.example/?data={data}&size={size}
        light:
          entity_id: light.guest_bedroom
        sliders:
          - entity_id: cover.guest_blinds
            label: Blinds
            icon: mdi:blinds-horizontal
        toggles:
          - entity_id: switch.guest_fan
            label: Window fan
            icon: mdi:fan
        alarm:
          enabled_entity_id: input_boolean.guest_alarm
          time_entity_id: input_datetime.guest_alarm
          minute_step: 15
```

Every option is optional, and a card with nothing to draw is left out.

| Option | Holds |
|---|---|
| `wifi` | `ssid_entity_id` and `password_entity_id`, whose states are the name and password; `security`, one of `WPA` (the default), `WEP`, or `nopass`; `hidden`, for a network that does not broadcast its name, which the code has to say for a phone to find it; and `qr_url`, the page that draws the code, with `{data}` where the network goes and `{size}` where the side of the code goes, in pixels. With no `qr_url` the name and password are shown alone |
| `light` | The room's light: `entity_id`; the `icon` and `off_icon` the bulb is drawn with, `mdi:lightbulb` and `mdi:lightbulb-off` unless you say otherwise; and `fill`, what the brightness bar in its colour window is filled with, `light`, following the light's colour and brightness, unless you say `neutral`. It must be a light |
| `sliders` | Covers and further lights, as bars, each with a `label` and an `icon`, optionally `fill: light`, which fills a light's bar with the light's own colour rather than grey, as strong as the light is bright, and optionally a `toggle_position`: where a tap opens it to, and shuts it from, in place of toggling it. Slatted blinds, shut both all the way down and all the way up and level at half way, want `50`. Anything but a light or a cover is refused when the config loads |
| `toggles` | Chips, written as in the [`toggles`](configuration.md#toggles) section |
| `alarm` | `enabled_entity_id`, a switch or `input_boolean` that arms it; `time_entity_id`, an `input_datetime` holding the time; and `minute_step`, how far one press moves the minutes, 15 unless you say otherwise |

The room's light is a bulb inside an arc, open at the bottom like a dimmer's dial. A tap on the bulb switches the light. A press on the arc sets the brightness to that point, and a drag round it follows the finger; the arc runs from nothing at its lower left, clockwise, to full at its lower right. A drag that starts on the bulb rather than the arc turns the cube, as it would anywhere else. The bulb takes the light's own colour while it is on, the warm on-amber for a light that reports none, and is as bright as the light is.

Holding the bulb, on a light that can be coloured, swells it for a moment and then opens a window out of it with a colour wheel: every hue round a ring, red at the top, and the light's default colour in the middle, the warm white of Home Assistant's `full` light profile unless [`light.default_xy`](configuration.md#light) says otherwise. The band across the window's top is the colour showing. Drag the marker round the ring, and while it is held it throws a wide, breathing glow of its colour so the colour shows round the finger; let go and the light takes that hue, at full saturation, and the window closes. Tap the middle and the light takes its default, and the window closes. Under the wheel is a brightness bar, the same as the face's own bars, filled with the light's colour, as strong as the light is bright, unless the light's `fill` says `neutral`; drag it or tap it and the light takes that, and the window closes. A tap on the glass around the wheel closes it without changing anything. On a light with no colour, only brightness or colour temperature, a hold does nothing. The window's heading is the light's name in Home Assistant, or its entity id when it has none. The wheel's label is `labels.light_colour`, and the bar's `labels.light_brightness`.

A light follows a drag on its bar, its dial, or its colour ring as the finger moves, a few times a second, and takes the place the finger lets go last; a cover is only sent where it is let go, since a motor told a stream of positions stops and starts at each. A tap anywhere on a bar switches it, or, with a `toggle_position`, shuts it if it is open at all and opens it to that position if it is shut; a drag along it sets it, to the percent. A bar or the dial moved by anything but the finger on it, a tap or a change made somewhere else, slides to its new place rather than jumping. A drag that starts out more up or down than along is left to turn the cube, and one that starts out along belongs to the bar, so dragging across a bar never turns the face away. While the finger is down a white mark shows where it will land; once it is let go, the mark stays with a glint across the bar until Home Assistant says where the light or cover went. The fill's primary edge breathes from the start of a drag and settles a couple of seconds after it is let go. The fill only ever shows what Home Assistant reports.

The alarm's bell arms and disarms it. Disarmed, the bell is all there is, grey, since a time that will not go off is not worth reading. Armed, the bell turns the primary colour and the time is to its right, with a wheel above and below the hours and the minutes. Arming slides the bell from the middle over to the left and writes the time in beside it; disarming erases the time back into the bell and slides the bell back to the middle. The minutes go round the hour without carrying into it, the way a clock's setting wheels do. Pressing moves the time on the panel at once, and it is sent to Home Assistant a moment after the last press, so a run of presses is one change rather than a round trip each. Once sent, the time breathes until Home Assistant has it. Going off is Home Assistant's business: the face only sets the switch and the time, so an automation watching them does the rest.

Everything a guest face draws is added to the allowlists, so there is nothing to list twice. See [what the panel may switch](configuration.md#what-the-panel-may-switch).

### The departure face

What to look at on the way out. The clock, the header's indicators, and the weather now with today's high and low sit exactly where they do on the dashboard, so turning between the two moves none of them. Under them, a traffic map headed from the left and, beside it, the trips under way headed from the right with the [`fuel`](configuration.md#fuel) gauges straight under them and the forecast, headed `labels.forecast`, under those, as one block against the top and centred across the face, stopping short of the face map's dots at the foot of the panel. The forecast and the weather need the [`weather`](configuration.md#weather) block, and are left out without it.

```yaml
faces:
  back:
    content: departure
    label: Departure
    label_strip: false
    options:
      map:
        - entity_id: camera.travel
          title: Travel
          visible_when: binary_sensor.travel_routes_live
        - entity_id: camera.traffic
          title: Traffic
      travel_times:
        - entity_id: sensor.travel_time_alice
          name: Alice
          departure_entity_id: sensor.travel_departure_time_alice
        - entity_id: sensor.travel_time_home_to_work
          name: Home to work
          short_name: Work
      incidents_entity_id: sensor.traffic_incidents
```

| Option | Holds |
|---|---|
| `map` | A camera, written as on a [camera face](cameras.md); a bare entity id will do. Or a list of them, each but the last naming `visible_when`, an entity: the face shows the first whose entity is `on`, and the last, which names none, otherwise |
| `travel_times` | At least one route: `entity_id`, a sensor reading the trip's minutes, or anything below nought while nobody is keeping the route up to date; `name`; optionally `short_name`, what the card calls it when `name` is too long for it, while its window and `send_event` still say `name`; and, for a route tied to a particular trip, `departure_entity_id`, a sensor holding when to leave as a Unix timestamp, or anything else while that cannot be known, and optionally `person_entity_id`, who takes it. A person may only be named alongside a departure sensor; and, for a route with no departure sensor, optionally `usual_entity_id`, a sensor reading how many minutes the route usually takes around this time of day, anything else while that cannot be known |
| `send_event` | An event a route's window fires to send the route to its person's phone, carrying `route`, `name`, `person`, `destination` (the destination entity's state), `label` (the place as the window shows it), and `maps`. The face may fire it without listing it under `events`. Unset, nothing sends |
| `maps` | Which maps a route sent to a phone should open in, `apple` unless you say `google`; it rides along with `send_event` for Home Assistant to build the link from |
| `leave_now_icon` | What a trip shows in place of its countdown once its time to leave has come, `mdi:run-fast` unless you say otherwise; any icon a chip takes |
| `departed_icon` | What a trip shows instead, in grey, once its time to leave has come and its person is not home, `mdi:account-arrow-right-outline` unless you say otherwise |
| `imminent_minutes`, `soon_minutes` | How close a trip's time to leave is when it is imminent, and when it is soon: 5 and 15 unless you say otherwise. A time already gone is imminent |
| `slower_percent`, `much_slower_percent` | How far over its usual time, in percent, a route that is always there has to be before it is slower, and much slower: 10 and 20 unless you say otherwise. Only a route with a usual time to read is judged by these |
| `incidents_entity_id` | A sensor whose `incidents` attribute lists traffic incidents, to raise a banner over the map for while there are any; see below. Unset, there is no banner |
| `traffic_slower_minutes`, `traffic_slower_percent`, `traffic_much_slower_minutes`, `traffic_much_slower_percent` | What traffic has to add over a route's free-flow minutes, both in minutes and in percent, before a route that is always there is slower, and much slower, when it has no usual time to read: more than 8 minutes and 40%, and more than 15 minutes and 75%, unless you say otherwise. Needing both keeps a few minutes on a short route, and a small share of a long one, from counting. A route without `free_flow_entity_id` is never judged by these |

Only the routes reading nought or more are shown, two side by side: the trips first, then the routes that are always there, each in the order written. With more than two, a chevron at the right says so, and a sideways swipe across them, or a tap on the chevron, slides the pair one route along, round from the last to the first in either direction; it goes back to the first pair a minute after it was last swiped, and an upward or downward swipe still turns the cube. A route that is always there to be read, like a commute, names no departure sensor and shows its name and how many minutes it takes. A trip, one naming a departure sensor that has a time, shows its name, a countdown in whole minutes to when it is time to leave, below nought as a launch counts ("−11" is eleven minutes to go, and the last part-minute is "−1"), then `leave_now_icon` once that time has come, which `labels.leave_now` names to a screen reader, and "Leave by" and that time on a 24-hour clock; while its departure sensor has no time it shows its travel minutes like a commute. Once leaving is soon, the countdown and the time breathe slowly in the primary colour, and once it is imminent or gone they pulse, faster and deeper, in the secondary. A route with no departure sensor takes the same colours from its usual time instead: once its minutes are more than `slower_percent` over what `usual_entity_id` reads, they breathe in the primary colour, and once they are more than `much_slower_percent` over, they pulse in the secondary. While it has no usual time to read (none named, or its sensor unknown), it goes by what traffic adds over `free_flow_entity_id` instead, past the `traffic_` thresholds; a usual time that says the route is as quick as ever is believed even when traffic adds a good deal, since the usual time already counts the traffic usual at that hour. With neither to go by it never changes colour. A trip never takes its colour from a usual time, even while its departure sensor has no time. Nor does a trip whose person is somewhere other than `home` ever change colour: they have left already or are leaving from somewhere else (a person Home Assistant cannot place is taken to be home, so a tracker that drops out never silences a late trip), so it keeps its countdown and stays grey, and once its time has come it shows `departed_icon` in grey, which `labels.departed` names to a screen reader, rather than `leave_now_icon`. A route that is unknown or unavailable counts as no trip. With none under way the card says `labels.travel_idle` in grey. The card's heading is `labels.travel`, the unit after the minutes `labels.minutes`, and the departure's label `labels.leave_by`.

Tapping a route opens a window out of its card with more about it; a press that moves on into a swipe opens nothing. A trip leads with the event it is for: its title, when it starts (or `labels.travel_all_day`), and where. Under that, how long it takes, what traffic adds to it, and an arrow for which way the minutes went the last time they changed, `mdi:trending-up` in the primary colour (the secondary while the trip is imminent), breathing or pulsing with the trip while it is soon or imminent, or `mdi:trending-down` in grey, read from Home Assistant's history of the route's own sensor and only across a run where it was kept up to date; how far it is; where it goes, only for a route with no event, since an event already says; and last, for a trip, when to leave, with how long ago its time was asked for in brackets after it ("23:13 (checked 4 minutes ago)"); a route with no time to leave gives that a line of its own. The band names the route and, for a trip, counts down to the second after `labels.travel_countdown` (`T−11:42`, or `T−1:05:09` an hour or more out) until the time comes, then shows `labels.leave_now`, or once its person has left, where they are: the zone they are in, or `labels.travel_away`; while the trip is soon or imminent the band is solid in the primary or secondary colour, the time to leave is drawn in it and keeps the trip's breath or pulse, and the window's brackets take it too and keep the card's breath or pulse in step with it, as a master's list keeps time with its master.

When the face has a `send_event`, a trip names a person, and the event's location is where the trip is going, holding the event sends the trip to their phone; a route that is always there is not sent, since its person already knows the way, and nor is a trip whose event is somewhere else, since the phone would be sent somewhere the window does not say. A phone with a pin (`mdi:cellphone-marker`) at its right says it can be sent. The hold is the floorplan's: corners close in on the event over the hold, and letting go or sliding off before they meet sends nothing. Once they meet they breathe while the send is on its way, and the phone fades across to a tick (`mdi:cellphone-check`) once Home Assistant has it, or a crossed-out phone (`mdi:cellphone-remove`) if it was refused. The window then closes only at a tap on the glass around it. What reaches the phone is Home Assistant's to decide, from the event. Any window closes itself a minute after it was last touched, and the carousel keeps its place behind it while it is open, starting its own minute again once it closes. Each is read from an optional entity on the route and left out when the route names none, or its entity has nothing to say:

| Route option | Shows |
|---|---|
| `free_flow_entity_id` | The route's minutes with no traffic, so the window can say what traffic adds |
| `distance_entity_id` | How far it is, in the entity's own `unit_of_measurement` |
| `destination_entity_id`, `destination_attribute` | Where it goes: the entity's state, or the attribute named. A route that is always there and names none takes it from its own entity's name when that is `<from>_to_<to>`: `sensor.travel_time_home_to_lab` goes to "Lab" |
| `calendar_entity_id` | The calendar whose event the trip is for: its `message`, `start_time`, and `location`. `start_time` carries no timezone, so it is read in the panel's own, which has to be Home Assistant's |
| `person_entity_id` | Who takes the route, on any route: where they are while not home, and for a trip, whose phone it is sent to. On a trip, being anywhere but home also keeps it from being drawn as due |
| `checked_entity_id` | When the route's time was last asked for: an `input_datetime`, a timestamp sensor, or a local date and time. A stamp at the epoch reads as never, and is left out |

A tap anywhere closes it. The window's words are `labels.travel_drive`, `travel_in_traffic`, `travel_distance`, `travel_destination`, `travel_checked`, `travel_checked_note`, `travel_away`, `travel_send` (what a screen reader calls the event that sends), `travel_sent` (what it calls the tick), and `travel_send_failed` (what it calls the crossed-out phone).

While `incidents_entity_id` lists any incidents, a band slides down between the map's heading and the map, and slides back up once the list is empty. It reads what the incidents are, a colon, and the roads they are on, worst first and each once, up to three of them; any more roads are counted after them as `labels.incidents_other` or `labels.incidents_others`, with `{count}` replaced: "Active incidents: I-135, K-96, US-54, and 2 others". A lone incident is called by its `type`, its camelCase split into words, "Disabled vehicle: K-96", or `labels.incidents_type_unknown` without one; any more are `labels.incidents`. An incident's road is its `road`, or failing that its `location`, its `summary`, or `labels.incidents_unnamed`. The band takes the worst incident's colour: the primary colour for `minor`, the secondary for `major`, and for `critical` the master warning's red (`mcw.warning_color`, its default even without an `mcw` block); a criticality it does not know counts as minor. Its type is dark, or light over a colour too dark for dark type to read on. Tapping it opens a window out of it, its band and brackets in the same colour and its band naming them as the banner does and giving how many there are, listing every incident worst first: an icon for its `type` in its own criticality's colour, its road and `direction`, its `criticality`, its `description` (or `summary`), its `location`, and `labels.incidents_closed` if `road_closed`, then when it is expected to clear. One spanning a day or less is counted down, to the minute in hours (`labels.incidents_hours`) and minutes (`labels.minutes`), with its times after: "Clears in ~1 hr 15 min (11:22 to 12:37)" (`labels.incidents_clears_in` and `labels.incidents_range`). One spanning more is ongoing, and told by the day it clears, `labels.incidents_today`, its weekday within the week, or its date further off, and the day it began, or its time if that was today: "Clears Friday (ongoing since Oct 1)" (`labels.incidents_clears_on` and `labels.incidents_ongoing`). One yet to start says when, in a countdown within a day and by its day further off (`labels.incidents_starts_in`, `labels.incidents_starts_on`); one past its end that it should have cleared (`labels.incidents_cleared_at`, or `labels.incidents_cleared_on` for an ongoing one that ended on an earlier day); one with no start gives its end after `labels.incidents_until`; and one with no end only when it began, after `labels.incidents_since`. The times move on by the minute while the window is open. Every field is optional. The description wraps; any other line too long for the window, the road among them, travels back and forth to show the rest. The window closes at a tap anywhere, a minute after it was last touched, or as soon as the last incident clears. The shape is what the HERE Traffic incidents in Home Assistant hold, each one a record like:

```yaml
incidents:
  - id: "1234567890"
    type: accident          # accident, construction, congestion, roadClosure, laneRestriction, …
    criticality: major      # minor, major, or critical
    road: I-135
    direction: NB
    summary: Crash on I-135
    description: Crash on I-135 at the 21st St exit. Right lane blocked.
    location: I-135 near 21st St
    road_closed: false
    start_time: "2026-10-05T15:40:00Z"
    end_time: "2026-10-05T17:00:00Z"
```

With more than one map, a map swapped in replaces the one before it, title and all, the moment its `visible_when` turns `on`, and the face goes back to the last when it turns off. The camera swapped out stops fetching, as one on a face turned away does, and the one swapped in fetches at once.

Everything a departure face reads is added to the allowlist, and it switches nothing.

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

The panel opens on its profile's `default_face`, `front` unless the profile says otherwise, and returns to it after two minutes untouched, so a panel left mid-rotation rights itself.

A profile's `face_entity` lets Home Assistant move the panel. While the entity's state is a face name (`front`, `back`, `left`, `right`, `up` or `down`), that face is home in place of `default_face`: the panel fades to it as soon as the state changes, whatever it was showing, and returns to it after two minutes untouched. Any other state, empty, `unknown` or a name the cube does not have, gives home back to `default_face`, and the panel fades there. A change that arrives mid-rotation waits for the rotation to finish. The panel opens on `default_face` and moves once the first state arrives from Home Assistant, a moment later.

A child that should not follow its parent's entity names `default` instead, and keeps to its own `default_face`. Its own children inherit that, and may name an entity again.

```yaml
profiles:
  default:
    face_entity: input_select.panel_face
  gb:
    face_entity: default
```

A face is built the first time you turn to it and kept from then on, so coming back to one finds it as you left it — the camera still showing its last frame, the floorplan not fetched again. A face you have never turned to is never built. Keeping one costs the markup and nothing else: it is not painted, its animations do not run, and its cards release their timers, so only the face being looked at is doing any work.

Rotation animates two faces at once — the outgoing one pivoting away, the incoming one pivoting in. It is done this way rather than as a single spinning box because a real box needs a depth of half its width to turn one way and half its height to turn the other, and a screen is rarely square.

The graph tracks which face is showing but not how the cube is rolled. Each great circle — front, right, back, left, and front, up, back, down — is a clean loop you can go round in either direction. Stepping between the two circles lands on a real face without remembering the way round.

## Serving several rooms

Add a profile per panel and give each its own address. They share one connection to Home Assistant, so the tenth panel costs no more upstream traffic than the first.

Panels that show a camera, an agenda, or a forecast do each ask for those separately, so if you run many of them and notice Home Assistant working harder than you expected, that is where to look first.
