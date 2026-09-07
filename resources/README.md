# resources

Installation-specific floorplan assets. Everything here except this file is gitignored, because a floorplan is a drawing of somebody's home.

```
resources/
├── floorplans/
│   ├── <image>.svg     # one per floorplan level, named by `floorplans.<level>.image` in config.yaml
│   └── ...
└── floorplan.css       # optional, served over the bundled stylesheets
```

Mount the directory into the container read-only, or point `CUBE_RESOURCES_PATH` at it:

```bash
docker run -v ./resources:/app/resources:ro ...
```

## The drawings

Each SVG must give every element it draws the entity id of whatever that element represents, as the element's DOM id. The panel finds elements that way and keeps a class on each one in step with its entity; nothing else connects the drawing to Home Assistant. Elements the panel does not know about are left alone, so structure, furniture, and labels can be drawn freely.

Two attributes carry extra meaning where the stylesheet asks for it: `type` (`exterior`, `appliance`, `server`, `bin`, `printer`) and `orientation` (`horizontal`, `vertical`, `diagonal`, used to animate an unlocked door).

## The overrides

Two stylesheets already ship with the panel: `floorplan.css`, the generic class contract, and `floorplan-rooms.css`, the rules naming particular rooms and fixtures in the drawing. Editing those and rebuilding is the normal way to restyle a floorplan.

A `floorplan.css` here is served over the top of both, for anything that should not need a rebuild — a change to try out, or a detail that does not belong in a published image. Scope every selector with `.floorplan__canvas`, since the file is served into the page as an ordinary stylesheet:

```css
.floorplan__canvas #kitchen-counter * {
  stroke: #555555;
  fill: #555555;
}
```
