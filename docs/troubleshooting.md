# Troubleshooting

Most of what goes wrong is a name that does not match, and the panel is deliberately quiet about those — a missing entity is skipped rather than drawn as an error, which keeps a half-finished config legible. The endpoints below are how you find them.

## The panel is blank

Check cube can reach Home Assistant:

```bash
curl -s localhost:4096/api/state | head -c 200
```

`"connected": false` means the connection is not up. The log says why:

```bash
docker compose logs --tail 20
```

An authentication failure means the token is wrong or has been revoked. A refused connection means `CUBE_HA_URL` is wrong or unreachable from wherever cube is running — which is not always where you are.

## It reconnects every few seconds

Something between cube and Home Assistant is closing a connection it thinks has gone idle — usually a reverse proxy. Lower the heartbeat below whatever that timeout is:

```bash
CUBE_HEARTBEAT_INTERVAL_SECONDS=3
```

The log shows each reconnection, so you can tell whether it has stopped.

## An entity is missing

Ask what Home Assistant actually returned:

```bash
curl -s localhost:4096/api/state \
  | python3 -c 'import json,sys; print(sorted(json.load(sys.stdin)["states"]))'
```

Anything in your config but absent here does not exist under that name. Renamed entities are the usual cause, and they fail silently in Home Assistant's own dashboards too, so one can be dead for a long time without anyone noticing.

## Part of the floorplan never lights up

Compare the ids in the drawing against the ids in the config:

```bash
python3 - <<'EOF'
import json, re, urllib.request
from pathlib import Path

svg = Path("resources/floorplans/downstairs.svg").read_text()
drawn = set(re.findall(r'id="([a-z_]+\.[a-z0-9_]+)"', svg))

config = json.load(urllib.request.urlopen("http://localhost:4096/api/config"))
listed = {e for g in config["floorplans"]["downstairs"]["groups"].values() for e in g}

print("in config, not in the drawing:", sorted(listed - drawn))
print("in the drawing, not in config:", sorted(drawn - listed))
EOF
```

The first list is entries doing nothing. The second is parts of your house you have drawn but not wired up.

## A notice never appears

A notice needs a `message` attribute on its entity; without one there is nothing to draw. Conditional notices — the default — also need the entity to be `on`:

```bash
curl -s localhost:4096/api/state \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["states"]["sensor.notice_example"])'
```

## The agenda is wrong

If events from yesterday evening appear, or this evening's are missing, the timezone is not set. Check what the container thinks the time is:

```bash
docker compose exec cube python -c \
  "from datetime import datetime; print(datetime.now().astimezone())"
```

If that is UTC rather than your own clock, set `TZ` in `.env` and restart.

If a particular event is missing, check it is not being filtered:

```bash
curl -s localhost:4096/api/agenda | python3 -m json.tool
```

Both `hidden_prefixes` and a calendar's `blocklist` drop events before they reach the panel.

## A tap does nothing

Only lights and fans on the floorplan, and configured toggles, are switchable. Everything else is read-only. If one of those is not responding, the log says so:

```bash
docker compose logs | grep "Rejected toggle"
```

That means the entity is not in a group the panel treats as a control, or its domain is not in `toggleable_domains`.

## The camera is blank

Confirm Home Assistant will produce a still for it:

```bash
curl -s -o /tmp/frame -w '%{http_code} %{content_type}\n' \
  localhost:4096/api/camera/camera.example/snapshot
```

A 404 means the entity is not the one named in your config — the panel serves only that one. A 502 means Home Assistant would not produce a frame, which is worth checking in Home Assistant itself.

## Everything looks too big or too small

The panel scales with the width of the screen, so it holds its proportions on any display. If it is wrong everywhere rather than in one place, the single adjustment is the root font size in `web/src/styles/app.css`:

```css
html {
  font-size: 0.8vw;   /* 1rem at a 2000px-wide panel */
}
```

## Every panel shows the same thing

Each panel names itself in its own URL, as `?profile=<key>`. A panel given no key, or a key that is not defined, gets `default` — so if they all look alike, they are all falling back to it.

The log names the key it could not resolve. Check that it matches a profile in `config.yaml`, remembering that the panel's URL is set once on the device and does not change when the config does.

`default` is a template rather than a panel and names no speaker, so a panel that has fallen back to it is also silent during announcements. That is the quickest way to tell the two apart from across the room: a panel on its own profile lights up for its own speaker, and one that has fallen through never does.

## A panel reacts to the wrong room's announcements

A profile's `media_player` is never inherited, so this is not something a parent can have leaked into it. Check the `media_player` on that panel's own profile.

If a panel raises no overlay at all, the opposite has happened: its profile names no speaker, either because it was left out or because the panel has fallen back to `default`.

## cube will not start

A config that cannot be resolved is refused at load rather than served, and the error names what is wrong. The causes are:

| Message mentions | Meaning |
|---|---|
| no `default` profile | Every panel inherits from it, so it has to exist |
| must define all six faces | `default` is the template; the faces it leaves out have nowhere to come from |
| is the root and cannot inherit | `default` has no parent |
| never inherited | `default` names a `media_player`, which could never reach a panel |
| inherits `...`, which is not defined | An `inherits` naming a profile that is not there |
| inherits itself | A cycle, whether direct or round a longer chain |
| opens on floorplan `...` | A profile's `floorplan` names a level not declared in `floorplans:` |
| names no `page` | A `custom` face without the page it is meant to draw |

## A custom face is blank

It fell back to a labelled blank because its page was not on disk when the process started. The log names the exact path it looked for, which is `faces/<page>/index.html` under the resources directory.

Two things catch people out: the directory is checked at startup, so a face added to a running container needs a restart; and the resources directory has to actually be mounted, which is what `CUBE_RESOURCES_PATH` and the compose mount are for.

## Checking a config before deploying it

The stub reads your real config and invents values for everything in it, so you can see the layout without touching Home Assistant:

```bash
make stub CONFIG=config.yaml
make run
```

Anything misspelled shows up as a gap in exactly the place it will be missing on the wall.
