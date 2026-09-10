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
camera.front_door                 # the whole thing, when there is nothing to add

- entity_id: camera.back_yard     # when there is
  title: Back Yard
  refresh_seconds: 30
```

`title` labels the frame; leave it out and the frame carries no label at all. `refresh_seconds` is how often that one camera asks for a new still, and defaults to ten — worth raising for a camera pointed at something that does not move.

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

## What a face costs

A camera refreshes only while its face is the one being looked at. Turn the cube away and every camera on that face stops asking Home Assistant for anything, and the face keeps the frames it had rather than being torn down. Turn back and it is there immediately, and all of them refresh at once rather than waiting out their intervals, so what you end up looking at is current rather than as old as the panel has been turned away.

So a wall of twelve cameras costs what the face showing costs, not what all six faces would. What it does cost is per panel — two panels on the same camera face poll separately — so the sum worth estimating is cameras on the visible face, divided by their refresh interval, times the number of panels looking at it.

A face is built the first time the cube turns to it and kept from then on, and a face nothing has turned to is never built at all. What a kept face costs is the markup: it is not painted, its CSS animations do not run, and its cards hold no timers, so it sits inert until it is turned back to. The same is true of the dashboard face — its clock stops ticking and it stops fetching calendars while you are looking at the cameras.

## Reaching the cameras

A panel never holds a Home Assistant token; stills come through cube's own `/api/camera/<entity_id>/snapshot`, and that route serves the cameras `config.yaml` names and refuses everything else. Naming a camera on a face is what makes it reachable, exactly as the `camera:` block is for the dashboard's own. A camera on no face and in no `camera:` block is not reachable through cube at all.

Both are also subscribed to like any other configured entity, so they appear in `/api/state` alongside everything else.

## When a face will not load

Options are checked when the config loads, and a face whose options its renderer cannot draw with is a process that will not start, naming the face and the profile:

```
The left face of profile `hall` has options it cannot draw with: ...
```

The usual causes are `rows` on a `camera-hero`, a missing `hero`, and an empty `rows:` or an empty row inside it. A grid needs at least one row and every row needs at least one camera — an empty one would draw a band of nothing across the wall.

A frame that stays blank when the face itself is fine is a camera Home Assistant is not serving; [Troubleshooting](troubleshooting.md) is the place for that.
