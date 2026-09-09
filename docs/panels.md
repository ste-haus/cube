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

A face is `dashboard`, `blank`, or `custom`.

| Field | Meaning |
|---|---|
| `content` | Which renderer draws the face |
| `label` | Shown faintly on a `blank` face, so a rotation is visibly a rotation rather than the screen going dark |
| `page` | For `custom`: the directory under `faces/` in the resources directory holding its `index.html` |
| `options` | Handed to the renderer as-is |

`custom` is a page you supply yourself — see [the resources README](../resources/README.md). It is additive: the built-in faces stay where they are, and nothing is rebuilt to add one. A `page` that is not on disk when the process starts falls back to a labelled blank, with a line in the log saying where it looked.

Which cards a face renders is fixed. `options` lets you configure the cards a face already has; it does not add or remove them. Nothing reads it yet, so it is the shape of the seam rather than a feature to reach for today.

## The cube

Swipe, or press an arrow key, to turn it. The map of dots in the corner shows which face is showing and jumps straight to any of them.

The panel returns to the front face after two minutes untouched, so a panel left mid-rotation rights itself.

Rotation animates two faces at once — the outgoing one pivoting away, the incoming one pivoting in. It is done this way rather than as a single spinning box because a real box needs a depth of half its width to turn one way and half its height to turn the other, and a screen is rarely square.

The graph tracks which face is showing but not how the cube is rolled. Each great circle — front, right, back, left, and front, up, back, down — is a clean loop you can go round in either direction. Stepping between the two circles lands on a real face without remembering the way round.

## Serving several rooms

Add a profile per panel and give each its own address. They share one connection to Home Assistant, so the tenth panel costs no more upstream traffic than the first.

Panels that show a camera or an agenda do each ask for those separately, so if you run many of them and notice Home Assistant working harder than you expected, that is where to look first.
