# resources

Installation-specific floorplan assets. Everything here except this file is gitignored, because a floorplan is a drawing of somebody's home.

```
resources/
├── floorplans/
│   ├── <image>.svg     # one per floorplan level, named by `floorplans.<level>.image` in config.yaml
│   └── ...
├── faces/
│   └── <page>/
│       └── index.html  # optional, a face of your own, named by a profile's `faces.<face>.page`
├── floorplan.css       # optional, served over the bundled stylesheets
└── icons.json          # optional, this installation's own icon set
```

Mount the directory into the container read-only, or point `CUBE_RESOURCES_PATH` at it:

```bash
docker run -v ./resources:/app/resources:ro ...
```

## The drawings

Each SVG must give every element it draws the entity id of whatever that element represents, as the element's DOM id. The panel finds elements that way and keeps a class on each one in step with its entity; nothing else connects the drawing to Home Assistant. Elements the panel does not know about are left alone, so structure, furniture, and labels can be drawn freely.

Two attributes carry extra meaning where the stylesheet asks for it: `type` (`exterior`, `appliance`, `server`, `bin`, `printer`) and `orientation` (`horizontal`, `vertical`, `diagonal`, used to animate an unlocked door).

## The icon set

Anywhere config or an entity names an icon, `mdi:` names come from the bundled webfont. Any other name is looked up in `icons.json`, which maps the full name to a bare SVG path drawn on a 24-unit grid:

```json
{
  "custom:wind": "m1.29 13.48c0 .22.08.4.25.56…"
}
```

Home Assistant setups often carry a custom iconset for what no standard set covers. It belongs here rather than in the image because it is the installation's own, and may hold marks that have no business in something published.

## Your own faces

A face whose `content` is `custom` is a page from here rather than one compiled into the bundle, so a panel can carry something no published image should. `page: bedroom` is served from `faces/bedroom/index.html`, along with whatever sits beside it in that directory.

Faces here are additive: the built-in `dashboard` and `blank` still exist, and a page that is not on disk when the process starts falls back to a labelled blank with a line in the log, rather than putting a white rectangle on a wall.

[Custom faces](../docs/custom-faces.md) covers what the page can do and what it can reach.

## The overrides

Two stylesheets already ship with the panel: `floorplan.css`, the generic class contract, and `floorplan-rooms.css`, the rules naming particular rooms and fixtures in the drawing. Editing those and rebuilding is the normal way to restyle a floorplan.

A `floorplan.css` here is served over the top of both, for anything that should not need a rebuild — a change to try out, or a detail that does not belong in a published image. Scope every selector with `.floorplan__canvas`, since the file is served into the page as an ordinary stylesheet:

```css
.floorplan__canvas #kitchen-counter * {
  stroke: #555555;
  fill: #555555;
}
```
