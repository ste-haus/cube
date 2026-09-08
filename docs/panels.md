# Panels and profiles

One instance of cube serves every panel in the house. A **profile** is a panel's identity: which cube faces it has, which floorplan level it opens on, and which speaker its announcement overlay follows.

## Addressing a panel

```
/p/<profile>    a named panel
/               falls back to CUBE_PROFILE, then to the profile called `default`
```

Point each tablet at its own URL and it keeps its own identity. Nothing is stored on the tablet, so a replacement device only needs the same address.

## Defining one

```yaml
profiles:
  default:
    name: Living Room
    floorplan: downstairs
    media_player: media_player.living_room
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

  bedroom:
    name: Bedroom
    floorplan: upstairs
    media_player: media_player.bedroom
    faces:
      front:
        content: dashboard
```

| Field | Meaning |
|---|---|
| `name` | For your own reference |
| `floorplan` | The level this panel opens on, and returns to |
| `media_player` | The speaker whose announcements raise the overlay |
| `faces` | What sits on each of the six faces |

A face is either `dashboard` or `blank`. A blank face shows its `label` faintly, so a rotation is visibly a rotation rather than the screen going dark.

## The cube

Swipe, or press an arrow key, to turn it. The map of dots in the corner shows which face is showing and jumps straight to any of them.

The panel returns to the front face after two minutes untouched, so a panel left mid-rotation rights itself.

Rotation animates two faces at once — the outgoing one pivoting away, the incoming one pivoting in. It is done this way rather than as a single spinning box because a real box needs a depth of half its width to turn one way and half its height to turn the other, and a screen is rarely square.

The graph tracks which face is showing but not how the cube is rolled. Each great circle — front, right, back, left, and front, up, back, down — is a clean loop you can go round in either direction. Stepping between the two circles lands on a real face without remembering the way round.

## Serving several rooms

Add a profile per panel and give each its own address. They share one connection to Home Assistant, so the tenth panel costs no more upstream traffic than the first.

Panels that show a camera or an agenda do each ask for those separately, so if you run many of them and notice Home Assistant working harder than you expected, that is where to look first.
