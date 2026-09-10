# Custom faces

The cube has six faces, and the ones that ship with it are `dashboard` and `blank`. A **custom face** is a third option: a page you write, served from your resources directory, given a whole face to itself.

It exists for the things that belong on your wall but have no business in a published image — a page for one room, a readout only you care about, something you want to try without rebuilding anything.

## Where it lives

```
resources/
└── faces/
    └── <page>/
        └── index.html
```

`<page>` is a plain directory name: letters, digits, and `. _ -`, starting with a letter or digit. Anything else is refused when the config loads, because a page name that can contain a slash is a page name that can climb out of the directory.

Everything beside `index.html` in that directory is served too, so a face can bring its own stylesheet, script, font, or image.

## Pointing a face at it

```yaml
profiles:
  bedroom:
    name: Bedroom
    media_player: media_player.bedroom_speaker
    faces:
      front:
        content: custom
        page: nightstand
```

That serves `resources/faces/nightstand/index.html` on the front face of the `bedroom` panel. Every other face is inherited as usual — see [Panels and profiles](panels.md).

Because faces are inherited, a custom face named once on a parent profile appears on every panel that inherits it, which is the cheap way to put the same page on several walls.

## What the page gets

It is an ordinary document, served from the panel's own origin, filling the face with no chrome of its own. There is no framework to adopt and nothing to import; a single file of HTML is a valid face.

The one thing outside the page is the strip naming the face up its left edge, which takes its own width rather than sitting over the page — so the width the page gets is the face less that strip. Set `label_strip: false` on the face to have the whole width, and see [Panels and profiles](panels.md).

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  body {
    margin: 0;
    height: 100vh;
    display: grid;
    place-items: center;
    background: #111111;
    color: #e1e1e1;
    font: 300 3rem Roboto, system-ui, sans-serif;
  }
</style>
<p id="reading">—</p>

<script>
  const ENTITY = "sensor.bedroom_temperature";

  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${scheme}//${location.host}/api/stream`);
  const reading = document.getElementById("reading");

  socket.addEventListener("message", (event) => {
    const { states } = JSON.parse(event.data);
    const entity = states?.[ENTITY];

    if (entity) {
      reading.textContent = `${entity.state}°`;
    }
  });
</script>
```

## Talking to Home Assistant

A custom face does not share the state store the built-in faces read from. It talks to the panel's own API instead, exactly as the announcement overlay does. No token is involved — the panel never holds one — and nothing outside the config is reachable.

| Endpoint | Gives you |
|---|---|
| `GET /api/config` | The whole dashboard definition, including `theme` and the panel's resolved profile |
| `GET /api/state` | Every entity the config names, and whether Home Assistant is connected |
| `WS /api/stream` | An `init` message with that same snapshot, then `update` messages as states change |
| `POST /api/toggle` | `{"entity_id": "..."}`, for an entity the config allows and whose domain is toggleable |
| `GET /api/icons` | Your own icon set, as a map of name to SVG path |
| `GET /api/floorplan/<level>` | A floorplan drawing |
| `GET /api/agenda` | The calendar events the agenda is built from |

Both `/api/state` and `/api/stream` give each entity as `{state, attributes, last_changed, last_updated}`, keyed by entity id, so an attribute is `states["light.lamp"].attributes.brightness`. An entity Home Assistant has not reported yet is `null` rather than missing.

`/api/stream` counts against `CUBE_MAX_PANELS` like any other panel connection, so a face that opens one is a panel's worth of budget.

Only entities the config names are visible, so a custom face that wants a sensor needs that sensor to appear somewhere in `config.yaml` — as an indicator, a notice, a floorplan group, whatever fits. An entity nothing references is never subscribed to and will not be in the stream.

## Matching the panel's theme

The panel applies its palette as CSS custom properties on its own document, and a custom face is a separate document, so it does not inherit them. Either hard-code the colours, or read `theme` from `/api/config` and set them yourself:

```js
const { theme } = await fetch("/api/config").then((response) => response.json());

for (const [name, value] of Object.entries(theme)) {
  document.documentElement.style.setProperty(`--color-${name}`, value);
}
```

The keys are `background`, `foreground`, `muted`, `dim`, `faint`, `spent`, and `accent`.

## Getting a change onto a wall

Local `.js` and `.css` a face names are stamped with the same cache-busting nonce as every other document the panel loads, and that nonce is drawn once per process. So a wall panel picks up a changed face on the next restart, without anyone touching the tablet.

Replacing the file alone is not enough: whether a page exists is checked when cube starts, so a face added to a running container needs a restart before it appears at all.

## When it does not show up

A `page` with nothing behind it falls back to a labelled blank rather than an empty white rectangle, and the log names the exact path it looked for. The usual causes are a misspelled `page`, an `index.html` that is not directly inside `faces/<page>/`, and a resources directory that is not actually mounted.

## What a custom face is not

It is not a custom card. The cards a built-in face draws are fixed, and there is no way to add one to the dashboard face or to compose a face out of parts. A custom face is all-or-nothing: you take the whole face and draw it yourself.
