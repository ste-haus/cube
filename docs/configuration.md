# Configuration

Two files describe an installation, and neither is tracked by git:

| File | Holds |
|---|---|
| `.env` | how to reach Home Assistant, and where things live |
| `config.yaml` | what the panel shows |

`config.yaml.dist` is the same file with placeholder entities, and is the quickest reference for the shape of any section.

## Environment

Only the first two are required.

| Variable | Default | Meaning |
|---|---|---|
| `CUBE_HA_URL` | — | Base URL of Home Assistant, e.g. `https://ha.example.com` |
| `CUBE_HA_TOKEN` | — | A long-lived access token |
| `TZ` | `Etc/UTC` | The panel's timezone. The agenda's days start at local midnight |
| `CUBE_PROFILE` | `default` | Which profile `/` serves |
| `CUBE_PORT` | `4096` | Port to listen on |
| `CUBE_HOST` | `0.0.0.0` | Address to bind |
| `CUBE_LOG_LEVEL` | `info` | `debug` if you want to watch the connection |
| `CUBE_DASHBOARD_PATH` | `config.yaml` | Where the dashboard definition is |
| `CUBE_RESOURCES_PATH` | `resources` | Where floorplans and icons are |
| `CUBE_FRONTEND_PATH` | the built bundle | Where the compiled panel is; the image sets its own |
| `CUBE_MAX_PANELS` | `16` | How many panels may stream at once |
| `CUBE_HEARTBEAT_INTERVAL_SECONDS` | `5` | How often to prove the connection is alive |

Rarely touched, but here for completeness:

| Variable | Default | Meaning |
|---|---|---|
| `CUBE_RECONNECT_MIN_SECONDS` | `1` | First wait after losing Home Assistant |
| `CUBE_RECONNECT_MAX_SECONDS` | `60` | Longest wait between attempts |
| `CUBE_RECONNECT_BACKOFF_FACTOR` | `2` | How fast that wait grows |
| `CUBE_REQUEST_TIMEOUT_SECONDS` | `15` | How long to wait for Home Assistant to answer |
| `CUBE_ASSET_CACHE_SECONDS` | `300` | How long a panel may cache a floorplan |
| `CUBE_CAMERA_CACHE_SECONDS` | `5` | How long a panel may cache a camera still |

The heartbeat is worth knowing about. Many setups put a reverse proxy in front of Home Assistant, and some of those close a websocket they think has gone quiet — sometimes after only a few seconds. cube sends a small keep-alive to stop that happening. If your panel is reconnecting every few seconds, this is the number to lower.

## The dashboard

Every section below is optional. Leave one out and the panel does not draw it.

### theme

The palette, applied everywhere.

```yaml
theme:
  background: "#111111"
  foreground: "#e1e1e1"   # normal text
  muted: "#999999"        # labels and secondary readings
  dim: "#666666"          # the clock column in the agenda
  faint: "#333333"        # rules, tracks, inactive dots
  spent: "#4a4a4a"        # an event the day has already been past
  accent: "#11fcf7"
```

One trap: keep your calendar colours clear of `spent`. A calendar coloured a mid-grey will look finished when it is not.

### clock

```yaml
clock:
  date_format: "%A, %B %o, %Y"
  time_format: "%H:%M"
```

Format strings follow the usual `strftime` notation, with one addition: `%o` is the day of the month with its ordinal suffix, so `7th` rather than `07`.

`easter_egg_times` and `easter_egg_text` swap the clock for a phrase at listed times, for anyone who has ever lost an afternoon to a status page. Each entry is matched against the rendered time exactly, so it has to be written the way `time_format` produces it:

```yaml
clock:
  time_format: "%H:%M"
  easter_egg_times: ["13:37"]
  easter_egg_text: leet o'clock
```

Leave them out to disable.

### indicators

The row of readings across the top.

```yaml
indicators:
  - icon: mdi:water-outline
    entity_id: sensor.rain_chance
    precision: 0
    suffix: "%"

  - icon: mdi:weather-windy
    entity_id: weather.home
    attribute: wind_speed
    bearing:
      entity_id: weather.home
      attribute: wind_bearing
    scale:
      default_color: "#999999"
      bands:
        - { at: 36, color: "#ff0000" }
        - { at: 24, color: "#fc8803" }
        - { at: 12, color: "#11fcf7" }
```

| Field | Meaning |
|---|---|
| `entity_id` | Where the reading comes from |
| `attribute` | Read this attribute instead of the state |
| `icon` | The glyph. See [Icons](icons.md) |
| `icon_attribute` | Take the glyph from an attribute, for readings whose icon changes |
| `precision` | Round to this many decimals |
| `suffix` | Appended to the value, e.g. `%` |
| `bearing` | A second reading rendered as a compass point beside the value |
| `scale` | Colours the reading by how large it is |

A **threshold scale** colours a number. Bands are matched highest-first, and anything below every band takes `default_color`.

### status_indicators

Readings that appear only when something is off its normal state, and take their colour from the state itself.

```yaml
status_indicators:
  - icon: mdi:alert-outline
    entity_id: sensor.path_condition
    nominal_state: Safe
    state_colors:
      Caution: "#11fcf7"
      Unsafe: "#fc8803"
      Dangerous: "#ff0000"
    pulsing_states: [Unsafe, Dangerous]
```

Nothing is drawn while the entity reads `Safe`. Anything in `pulsing_states` blinks.

### notices

A list of short lines. Each reads its text and glyph from the entity's own attributes, so adding one is a config line rather than a template.

```yaml
notices:
  - entity_id: sensor.notice_holiday
  - entity_id: sensor.notice_bin_day
    pulsing: true
  - entity_id: sensor.notice_commute
    conditional: false
```

| Field | Default | Meaning |
|---|---|---|
| `conditional` | `true` | Show only while the entity is `on` |
| `pulsing` | `false` | Blink, for something time-sensitive |
| `message_attribute` | `message` | Attribute holding the text |
| `icon_attribute` | `icon` | Attribute holding the glyph |
| `icon` | — | A fixed glyph, which wins over the attribute |
| `nominal_state` | — | Makes it state-driven instead of on/off |

Setting `nominal_state` switches the row to the same behaviour as a status indicator: shown whenever the entity is off that state, coloured by `state_colors`, blinking for anything in `pulsing_states`.

The entity supplying a notice needs a `message` attribute. A notice with no message is not drawn, which is the usual reason one is missing.

### agenda

Today, as a two-sided timeline: one person's calendars down the left, the other's down the right, the time of day between them.

```yaml
agenda:
  empty_text: Nothing today.
  days: 1
  hidden_prefixes: [canceled, cancelled]
  side_labels:
    left: Alex
    right: Sam
  calendars:
    - entity_id: calendar.alex
      name: Alex
      color: "#00bfff"
      side: left
    - entity_id: calendar.sam_work
      name: Sam Work
      color: "#bd00bd"
      side: right
    - entity_id: calendar.chores
      name: Chores
      color: "#b0b0b0"
      side: extra
      icon: mdi:broom
      blocklist: "bins|recycling"
```

| Field | Meaning |
|---|---|
| `side` | `left`, `right`, or `extra` |
| `color` | The colour its events wear while they are still to come |
| `icon` | Glyph for an `extra` calendar's events |
| `blocklist` | Regular expression; matching titles are dropped |
| `hidden_prefixes` | Titles opening with any of these never appear at all |

**`extra` calendars leave the timeline.** They belong to the household rather than to either person, so their events appear at the end of the notices list under the calendar's icon, without a time. A chore is closer to a notice than to an appointment.

An event that has finished drops its calendar's colour and turns the `spent` grey, wherever it appears. An event under way shows a progress meter in place of its start time, and its title scrolls rather than being cut off.

Both spellings of *cancelled* are worth listing in `hidden_prefixes`, since a calendar uses whichever its author does.

When the day is long enough that the list outgrows its column, it scrolls. Four fields tune that, and none of them matter until it happens:

| Field | Default | Meaning |
|---|---|---|
| `scroll_threshold_items` | `19` | How many items before scrolling starts |
| `scroll_percent_per_item` | `10` | How far it travels per item past the threshold |
| `scroll_seconds_per_item` | `0.75` | How long a full cycle takes, per item |
| `base_scroll_seconds` | `20` | Cycle length while the list still fits |

The count comes from `item_count_entities`, so a column shared with the notices can account for both.

### floorplans

```yaml
floorplans:
  downstairs:
    image: downstairs
    groups:
      lights: [light.kitchen, light.hall]
      doors: [binary_sensor.front_door]
      motion: [binary_sensor.hall_motion]
```

`image` names an SVG in `resources/floorplans/`. The group an entity is listed under decides how it is drawn. [Floorplans](floorplans.md) covers this properly, including how to prepare a drawing.

### weather

```yaml
weather:
  entity_id: weather.home
  sun_entity_id: sun.sun
  high:
    entity_id: sensor.temperature_high
    hours_attribute: hours_until
  low:
    entity_id: sensor.temperature_low
    hours_attribute: hours_until
  summary_entity_id: sensor.forecast_summary
```

`sun_entity_id` decides whether a partly-cloudy sky gets a sun or a moon. `hours_attribute` names an attribute holding how far off the high or low is; when it reads zero, the panel drops the label rather than saying "0h".

`summary_max_length`, `summary_min_scale`, and `summary_max_scale` shrink a wordy forecast so it still fits its panel. The scales multiply the panel's own size, so `1.0` means "as configured".

### camera

```yaml
camera:
  entity_id: camera.street
  title: Traffic
  polling_interval: 60
```

The panel polls stills rather than holding a stream open, which is easier on Home Assistant and avoids showing a half-transferred frame. It polls only while the face the camera is on is the one being looked at, and refreshes the moment the cube turns back to it. `polling_interval` defaults to sixty seconds, and each still is asked for only once the last has arrived, so a slow camera cannot pile requests up behind itself.

A camera can play live video from go2rtc instead, with `stream_type: go2rtc` — see [Camera faces](cameras.md#live-video). This block is the one camera the dashboard itself draws; a whole face can be given over to cameras, and [Camera faces](cameras.md) take the same block per tile.

### go2rtc

```yaml
go2rtc:
  url: http://go2rtc.example:1984
```

Where cameras with `stream_type: go2rtc` get their video. Needed only if one does, and the load refuses a go2rtc camera without it. The panel connects to it directly, so it has to be reachable from the tablets and allow their origin — see [Live video](cameras.md#live-video).

### fuel

A row of arc gauges. Despite the name, anything reading nought to a hundred works.

```yaml
fuel:
  unit: "%"
  scale:
    default_color: "#e1e1e1"
    bands:
      - { at: 33, color: "#bd00bd" }
      - { at: 15, color: "#11fcf7" }
  gauges:
    - entity_id: sensor.car_fuel
      name: Car fuel level
```

### toggles

Chips that switch something.

```yaml
toggles:
  - entity_id: group.seasonal_lights
    label: Seasonal lights
    icon: mdi:pine-tree
    visible_when: input_boolean.seasonal
```

| Field | Default | Meaning |
|---|---|---|
| `label` | — | Text on the chip |
| `icon` | — | Its glyph |
| `active_color` | `amber` | Icon colour while the entity is `on` |
| `inactive_color` | `white` | Icon colour while it is off |
| `visible_when` | — | Hide the chip unless this entity is `on` |

`visible_when` lets a seasonal control disappear out of season.

### transcript

A line along the bottom that types itself out, for whatever was last spoken aloud.

```yaml
transcript:
  entity_id: input_text.last_announcement
  syllables_per_second: 4
```

`syllables_per_second` is the pace, not the duration: a long announcement and a short one are read at the same speed rather than taking the same time. The default is about the rate of a voice reading aloud. Syllables rather than characters, so a long word takes longer than a short one without taking longer in proportion to how it is spelled; punctuation adds a pause on top where there is any, but nothing depends on there being. It affects only the animation, not what is shown.

Nearly every announcement fits on one line. One that does not wraps once it reaches two thirds of the panel's width, to at most three lines, and anything past that ends in an ellipsis — a line long enough to need a fourth is long enough that a wall is the wrong place to read it. However many lines it runs to, it grows upward over the panel rather than shortening it.

### visualizer

A full-screen overlay while a media player is playing something matching.

```yaml
visualizer:
  content_marker: chime_tts
```

The overlay follows the media player named by the panel's profile, so each room reacts to its own speaker. Having the block at all is what turns it on; the page it draws with ships with the panel, so there is nothing to point it at.

Match `content_marker` against a path segment rather than a hostname. A player holds onto the address it was handed, so anything still queued when an instance is renamed carries the old host, and a marker that names one is right until exactly the moment it matters.

The audio is relayed through the panel rather than read from Home Assistant directly. The overlay analyses the sound it is drawing, and a browser will not hand a cross-origin recording to an analyser without a header Home Assistant does not send; serving both from here sidesteps that, and the signed media address stays on this side. The relay only ever fetches what a configured speaker is playing at that moment, so it cannot be pointed at anything else.

### labels

Section headings, in case yours should not read "Notices" and "Today".

```yaml
labels:
  notices: Notices
  agenda: Today
```

### What the panel may switch

```yaml
toggleable_domains: [light, switch, group, input_boolean]
```

A tap is refused unless the entity is one the panel actually draws as a control — a light or a fan on the floorplan, or a configured toggle — **and** its domain is in this list. Everything else is read-only no matter what is sent.

## Applying changes

`config.yaml` is read when cube starts, so restart it after editing:

```bash
docker compose restart
```

Running from source, stop `make run` and start it again.

Floorplan drawings and icons are read per request and need no restart.
