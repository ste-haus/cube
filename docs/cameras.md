# Camera faces

The dashboard has room for one camera, in the right-hand rail under the forecast. A **camera face** is the other way round: a whole side of the cube given over to cameras and nothing else, so the panel is a dashboard on the front and a camera wall a swipe away.

There are two, and they differ only in how they arrange what you give them.

| `content` | Arrangement |
|---|---|
| `camera-grid` | A grid, laid out exactly as written: one row per inner list, read left to right |
| `camera-hero` | One camera at size, with the rest stacked in a column beside it |

Both are built into the panel. Nothing is mounted, and nothing is rebuilt.

## Naming a camera

A camera is either a bare entity id or the same block the [`camera:`](configuration.md#camera) section takes. Both forms can sit side by side in one face.

```yaml
camera.driveway                   # the whole thing, when there is nothing to add

- entity_id: camera.back_yard     # when there is
  title: Back Yard
  polling_interval: 30
```

| Field | Meaning |
|---|---|
| `entity_id` | The camera in Home Assistant. Always needed: it is where stills come from |
| `title` | Labels the frame; leave it out and the frame carries no label |
| `stream_type` | `polling`, the default, for stills; or `go2rtc` for live video — see [Live video](#live-video) |
| `polling_interval` | Seconds between stills for a polled camera; defaults to sixty |
| `rtsp` | For `go2rtc`: an RTSP URL for go2rtc to play |
| `stream` | For `go2rtc` without `rtsp`: a stream go2rtc already has, by name; defaults to the entity's object id |

A polled camera asks for its next still only once the last has arrived, so one slower to answer than its interval sets its own pace rather than queuing requests behind it. Sixty seconds suits what most still cameras are — a traffic image, a file something rewrites every so often — and a camera worth watching as it happens is worth streaming instead.

## camera-grid

One inner list per row, read left to right, which is what the config already looks like:

```yaml
faces:
  left:
    content: camera-grid
    options:
      rows:
        - [camera.front_door, camera.driveway]
        - [camera.back_yard, camera.garage]
```

```
┌─────────────────┬─────────────────┐
│    front_door   │     driveway    │
├─────────────────┼─────────────────┤
│    back_yard    │      garage     │
└─────────────────┴─────────────────┘
```

Any number of rows, any number of cameras in each. Rows share the height between them and tiles share their row's width, so rows of different lengths are fine — a lone camera on the last row takes the full width rather than sitting next to a hole:

```yaml
      rows:
        - [camera.front_door, camera.driveway]
        - [camera.back_yard]
```

```
┌─────────────────┬─────────────────┐
│    front_door   │     driveway    │
├─────────────────┴─────────────────┤
│             back_yard             │
└───────────────────────────────────┘
```

## camera-hero

`hero` gets the face; `side` stacks beside it, sharing the column's height:

```yaml
faces:
  right:
    content: camera-hero
    options:
      hero: camera.front_door
      side:
        - camera.driveway
        - camera.back_yard
```

```
┌────────────────────────┬──────────┐
│                        │ driveway │
│       front_door       ├──────────┤
│                        │back_yard │
└────────────────────────┴──────────┘
```

The column is the same share of the width however many cameras are in it, so the hero frame is the size it is on every panel drawing this face rather than a size that depends on how many cameras came with it. `side` may be left out entirely, and then the hero takes the whole face.

## Live video

A camera with `stream_type: go2rtc` plays live H.264 from [go2rtc](https://github.com/AlexxIT/go2rtc) instead of polling stills. The tablet decodes it in hardware, which costs it less than a JPEG a second decoded in software, and the picture moves.

```yaml
go2rtc:
  url: http://go2rtc.example:1984

profiles:
  default:
    faces:
      left:
        content: camera-hero
        options:
          hero:
            entity_id: camera.front_door
            stream_type: go2rtc
            rtsp: rtsp://frigate.example:8554/front_door
```

With `rtsp`, go2rtc plays that URL itself, so it needs no stream set up for the camera — a go2rtc run for the panels needs nothing configured but its API. Without it, go2rtc is asked for a stream it already has, named by `stream` or the entity's object id. A camera naming `rtsp` has to be `go2rtc`: the load refuses an `rtsp` on a polled camera rather than quietly ignoring it.

The panel plays the stream from go2rtc directly rather than through cube, which puts three requirements on go2rtc:

- **Reachable from the tablets**, not only from wherever cube runs, and without a login in front of it. Frigate's own address usually has one; go2rtc's API port does not.
- **Allowing the panel's origin.** go2rtc refuses cross-origin websockets by default, and every panel is cross-origin to it. Set `api: origin: "*"` in go2rtc's config — under `go2rtc:` in Frigate's, if it is Frigate's go2rtc.
- **Secure if the panel is.** A page served over https may not open a plain socket. An `https://` `url` is played over a secure one.

go2rtc takes an RTSP URL from a client as a source, but not a command: `exec:` and the like only come from its own config, so a go2rtc that takes URLs is not a way to run anything on it.

A stream is torn down — socket closed, decoder released — the moment its face is turned away, and brought back when the face returns, with a fresh still standing in until the first frame arrives. One that drops, stalls, or fails to start comes back on its own, no more often than every few seconds.

**Mind the bitrate.** A camera's main stream runs to several megabits a second, and a face of four is the sum of them, per panel looking at it. Where a camera offers a lower-resolution substream, the tiles beside the hero are the place for it: a quarter of a screen has no use for a 2560-pixel picture.

## What a face costs

A camera costs nothing while its face is turned away. A polled one stops asking Home Assistant for stills and keeps the one it had; a live one closes its stream. Turn back and a polled camera refreshes at once rather than waiting out its interval, and a live one reconnects, so what you end up looking at is current rather than as old as the panel has been turned away.

So a wall of twelve cameras costs what the face showing costs, not what all six faces would. What it does cost is per panel — two panels on the same face each poll, or each stream, for themselves — so the sum worth estimating is the cameras on the visible face, times the number of panels looking at it.

A face is built the first time the cube turns to it and kept from then on, and a face nothing has turned to is never built at all. What a kept face costs is the markup: it is not painted, its CSS animations do not run, and its cards hold no timers, so it sits inert until it is turned back to. The same is true of the dashboard face — its clock stops ticking and it stops fetching calendars while you are looking at the cameras.

## Reaching the cameras

A panel never holds a Home Assistant token; stills come through cube's own `/api/camera/<entity_id>/snapshot`, and that route serves the cameras `config.yaml` names and refuses everything else. Naming a camera on a face is what makes it reachable, exactly as the `camera:` block is for the dashboard's own. A camera on no face and in no `camera:` block is not reachable through cube at all.

Both are also subscribed to like any other configured entity, so they appear in `/api/state` alongside everything else.

Live video is the exception: it goes from go2rtc to the panel, and cube never sees it. cube still serves the still that stands in while a stream connects, which is why a live camera is named by its entity as well.

## When a face will not load

Options are checked when the config loads, and a face whose options its renderer cannot draw with is a process that will not start, naming the face and the profile:

```
The left face of profile `hall` has options it cannot draw with: ...
```

The usual causes are `rows` on a `camera-hero`, a missing `hero`, and an empty `rows:` or an empty row inside it. A grid needs at least one row and every row needs at least one camera — an empty one would draw a band of nothing across the wall.

A frame that stays blank when the face itself is fine is a camera Home Assistant is not serving; [Troubleshooting](troubleshooting.md) is the place for that.
