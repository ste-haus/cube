# cube

A Home Assistant wall panel that runs outside Home Assistant.

Home Assistant's own dashboards are excellent, and a wall panel is a slightly awkward fit for
them: it renders one fixed layout forever, and every panel that opens one holds its own
websocket subscribed to the whole event bus. cube serves the same panel from a small proxy
instead — one upstream connection for the whole house, an entity allowlist, and a frontend
that is plain HTML and CSS rather than a stack of custom cards.

The panel presents itself as a cube. The dashboard is the front face; swiping, arrow keys, or
the face map in the corner rotate to the other five.

## How it works

```
Home Assistant ──websocket (one, allowlisted)──> cube proxy ──websocket──> panels
                └─REST (calendars, cameras, floorplan assets)─┘
```

The proxy holds the Home Assistant token, subscribes once via `subscribe_entities`, and fans
compressed state diffs out to however many panels are connected. Panels never authenticate to
Home Assistant and cannot reach anything the dashboard config does not name.

That arrangement is also the point. Home Assistant serializes every state change once per
subscriber, so N panels subscribed directly cost N copies of every event; collapsing them to
one connection makes that cost independent of how many panels are on the wall.

## Configuration

Nothing about any particular home is compiled in. Two files describe an installation:

| File | Holds | Tracked |
|---|---|---|
| `.env` | Home Assistant URL and token, bind address | no |
| `config/cube.yaml` | entities, labels, colors, thresholds, floorplans, profiles | no |

Start from the samples:

```bash
cp .env.dist .env
cp config/cube.dist.yaml config/cube.yaml
```

`config/cube.dist.yaml` is the whole schema with placeholder entities, and is the reference
for what can be configured.

### Profiles

A profile is a panel's identity — which cube faces it gets, which floorplan level it opens
on, which media player its announcement overlay follows. One instance serves them all:
`/p/<profile>` picks one, and `/` falls back to `CUBE_PROFILE`.

### Floorplans

The floorplan is an SVG served by Home Assistant from `www/`, in which every drawn element
carries an entity id as its DOM id, alongside a stylesheet that paints from class names. cube
proxies both and keeps one class per element in step with its entity — so the drawing stays
where it is drawn and deployed, and never has to be copied here.

The classes it sets are the contract with that stylesheet:

| Group | Classes |
|---|---|
| `lights`, `windows`, `fans`, `motion`, `sensors`, `vehicles` | `<group> active` / `<group> inactive` |
| `doors` | `door open` / `door locked` / `door unlocked` / `door inactive <state>` |
| `bins` | `sensor <state>` for `home`, `away`, `out`, `in`; otherwise `sensor inactive` |

Lights additionally take their `brightness` as opacity and their `rgb_color` as fill.

Only `lights` and `fans` are tappable, and a toggle is refused unless the entity appears in
one of those groups *and* its domain is listed in `toggleable_domains`.

## Running

```bash
make install
make run          # builds the frontend, then serves on :4096
```

Or with Docker:

```bash
docker compose up --build
```

## Developing without Home Assistant

`tools/stub_hass.py` is a stand-in that speaks the same websocket and REST surfaces. It reads
whichever dashboard config you point it at, invents plausible states for every entity in it,
and generates a schematic floorplan with one labelled cell per entity — so the wiring between
entity, SVG element, and stylesheet class is visible without a real drawing.

```bash
make stub CONFIG=config/cube.dist.yaml    # a fake Home Assistant on :8123
make run                                  # cube against it
```

Point it at your own `config/cube.yaml` to check that config's wiring before deploying.

## Tests

```bash
make test
```

The Python suite covers the config schema, the allowlist and toggle guard, the API surface,
and the websocket protocol end to end against a stub Home Assistant. The frontend suite covers
the rotation graph.

## Prior art

This replaces a Lovelace dashboard, which in turn replaced a hand-written panel from 2018.
The cube rotation is carried over from that original.
