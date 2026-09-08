# Floorplans

The floorplan is a drawing of your home that lights up as things happen in it. Lights fill their rooms, doors show whether they are open or locked, motion flickers where someone is walking.

It works because every element in the drawing is named after the entity it represents. Nothing else connects the two.

## Where drawings live

```
resources/
├── floorplans/
│   ├── downstairs.svg
│   └── upstairs.svg
├── floorplan.css        # optional
└── icons.json           # optional
```

The directory is mounted into the container and is not tracked by git, because a floorplan is a picture of somebody's house.

Each file is named by the `image` field of a level in `config.yaml`:

```yaml
floorplans:
  downstairs:
    image: downstairs      # resources/floorplans/downstairs.svg
```

## Preparing a drawing

Draw the plan in whatever you like — Inkscape, Illustrator, Figma — and export SVG. Then give every element that represents something in Home Assistant that entity's id as its DOM id:

```xml
<rect id="light.kitchen" x="20" y="333" width="203" height="188" />
<g id="binary_sensor.front_door"> … </g>
```

Everything else is left alone, so walls, furniture, labels, and shading can be drawn however you like.

Two attributes carry extra meaning where the stylesheet asks for it:

| Attribute | Values | Used for |
|---|---|---|
| `type` | `exterior`, `appliance`, `server`, `bin`, `printer` | Elements that behave differently from their neighbours |
| `orientation` | `horizontal`, `vertical`, `diagonal` | Which way an unlocked door should rattle |

## Groups

Listing an entity under a group in `config.yaml` decides how it is drawn:

| Group | Drawn as |
|---|---|
| `lights` | Filled while on, taking the light's brightness as opacity and its colour as fill |
| `doors` | Open, locked, unlocked, or shut, each distinct |
| `windows` | Highlighted while open |
| `motion` | Flares while movement is detected |
| `fans` | Spins while running |
| `sensors` | Marked while active |
| `bins` | Coloured by where the bin is: home, away, out, in |
| `vehicles` | Marked while a vehicle is present |

Group names are also the CSS class the panel sets, so a drawing and a stylesheet have to agree on them.

## What is tappable

Only `lights` and `fans`. Tapping one toggles it, provided its domain is in `toggleable_domains`. Everything else is a read-out and ignores taps.

## Styling

Two stylesheets ship with the panel and cover the general case: one holds the class contract above, the other the rules naming particular rooms and fixtures.

For anything specific to your home that should not need rebuilding the image, add `resources/floorplan.css`. It is served over the top of both. Scope every selector, since it lands in the page as an ordinary stylesheet:

```css
.floorplan__canvas #kitchen-counter * {
  stroke: #555555;
  fill: #555555;
}
```

## More than one level

List several floorplans and the panel shows dots beneath the drawing. Swiping left or right across it, or tapping a dot, slides between levels. It returns to the level named by the panel's profile after a minute.

A swipe across the floorplan changes level; a swipe anywhere else turns the cube.

## Starting without a drawing

`tools/stub_hass.py` can generate a schematic for each configured level — a labelled cell per entity rather than a plan of your home:

```bash
make resources CONFIG=config.yaml
```

It is not pretty, but it makes the wiring between entity, element, and class visible while you get the config right.

## When nothing lights up

Check that the element id in the SVG matches the entity id exactly, including the domain. An id the panel cannot find is skipped in silence — which is convenient when a drawing is ahead of the config, and confusing when it is a typo. [Troubleshooting](troubleshooting.md) has a way to list the mismatches.
