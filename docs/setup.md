# Setup

## What you need

- A Home Assistant instance you can reach over the network.
- A long-lived access token from that instance.
- Somewhere to run a container, or a machine with Python 3.12 and Node 22.

## Getting a token

In Home Assistant, click your name at the bottom of the sidebar, open the **Security** tab, and scroll to **Long-lived access tokens**. Create one and copy it somewhere safe — Home Assistant will not show it again.

The token lives only on the machine running cube. The panels never receive it.

## First run

```bash
git clone https://github.com/ste-haus/cube.git
cd cube
make init
```

`make init` creates `.env` and `config.yaml` from their samples. It will not overwrite either if it already exists, because one holds a credential and the other describes your home.

Fill in `.env`:

```bash
CUBE_HA_URL=https://homeassistant.example.com
CUBE_HA_TOKEN=<the token you just made>
TZ=America/Los_Angeles
```

`TZ` matters more than it looks. The agenda's idea of "today" runs from local midnight, and a container with no timezone runs on UTC — which starts the day at the wrong hour and drops the evening.

Then edit `config.yaml` to name your own entities. [Configuration](configuration.md) covers what goes in it. Nothing in the file is required, so you can start by deleting the sections you do not want and getting a clock on the screen.

## Running it

With Docker, which builds one image containing both the proxy and the panel:

```bash
docker compose up -d
```

Or from source:

```bash
make install
make run
```

Either way the panel is at `http://localhost:4096`.

## Published images

Images are built for `linux/amd64` and `linux/arm64`. Every merge to `main` cuts the next version and publishes it, so `latest` tracks the default branch and a version tag pins a known build:

```bash
docker run -d \
  --name cube \
  -p 4096:4096 \
  -e CUBE_HA_URL=https://homeassistant.example.com \
  -e CUBE_HA_TOKEN=... \
  -e TZ=America/Los_Angeles \
  -v ./config.yaml:/app/config.yaml:ro \
  -v ./resources:/app/resources:ro \
  ghcr.io/ste-haus/cube:latest
```

Passing the token on the command line leaves it in your shell history and in `ps` output. `--env-file .env` keeps it out of both, which is what the compose file does.

The two mounts are your dashboard definition and your floorplan drawings. Both describe your home, so they are mounted rather than baked into the image.

## Putting it on a wall

Point a tablet's browser at `http://<host>:4096` in kiosk or fullscreen mode. The panel hides the cursor, never scrolls, and reconnects on its own when the network or Home Assistant goes away, so it can be left alone.

If the tablet should show a particular room's panel rather than the default, give it `http://<host>:4096/p/<profile>`. See [Panels and profiles](panels.md).

## Trying it without Home Assistant

`tools/stub_hass.py` stands in for Home Assistant. It reads whichever config you point it at, invents plausible values for every entity in it, and can generate schematic floorplans so there is something to look at:

Point `.env` at the stub first, or cube will go looking for the real thing:

```bash
CUBE_HA_URL=http://localhost:8123
CUBE_HA_TOKEN=anything
```

Then:

```bash
make resources CONFIG=config.yaml.dist   # schematic drawings, if you have none
make stub CONFIG=config.yaml.dist        # a fake Home Assistant on :8123
make run                                 # cube against it
```

The stub does not check the token, so any value will do.

Point the stub at your own `config.yaml` to check its wiring before you deploy it.
