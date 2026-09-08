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

## Checking a config before deploying it

The stub reads your real config and invents values for everything in it, so you can see the layout without touching Home Assistant:

```bash
make stub CONFIG=config.yaml
make run
```

Anything misspelled shows up as a gap in exactly the place it will be missing on the wall.
