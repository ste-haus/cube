# Demo recording

`assets/demo.gif`, the animation at the top of the project README, is recorded from a real panel: the proxy and frontend from this repo, driven by headless Chrome, against a stub Home Assistant that serves a fictional house. Nothing in it comes from a real installation.

## Regenerating the GIF

From the repository root:

```bash
tools/demo/run.sh still    # one screenshot per face the recording visits
tools/demo/run.sh record   # writes assets/demo.gif
```

Look at the stills first; they are quicker than a recording and show every face the GIF will. The script prints where it put them.

It needs `uv` with the project installed (`make install`), `node`, `ffmpeg`, and Chrome. Chrome is expected at the macOS path; set `CHROME` to point elsewhere. `web/dist` is built first if it is missing, but an existing build is used as it is, so run `make web` after changing the frontend.

Scratch output (the generated floorplan, logs, the Chrome profile, the captured frames) goes to `$TMPDIR/cube-demo`, or to `DEMO_WORK` if set. The stub, the proxy, and Chrome listen on ports 8124, 4097, and 9333, and are stopped when the script exits.

## What happens

1. The page clock is moved to 14:20 America/Chicago, so the agenda is partway through a day. The stub is given the same offset, so the forecast and the calendar agree with the clock on the panel.
2. `floorplan.py` draws the house into the scratch resources directory.
3. `demo_stub.py` starts: `tools/stub_hass.py` with every random value replaced by a fixed one, the calendars and cameras answered from this directory, and one light flipped every few seconds so the floorplan is visibly live.
4. The proxy starts against the stub with `demo.yaml` as its dashboard. Every `uv run` uses `--no-env-file`, so a real `.env` and the Home Assistant it names never reach the recording.
5. `record.mjs` drives Chrome over the DevTools protocol: it draws a cursor into the page, drags the cube from the dashboard to the weather face, on to the cameras, and back, and captures a screencast. `ffmpeg` turns the frames into the GIF.

## What to change where

| To change | Edit |
|---|---|
| Which faces exist and what is on them, indicators, notices, calendar names, gauges | `demo.yaml` |
| Entity states, notice text, calendar events, the weather summary, which lights flip | `demo_stub.py` |
| The house | `floorplan.py` |
| The traffic map and the two cameras | `traffic.svg`, `cam-front.svg`, `cam-yard.svg` |
| The route across the cube, and how long each face is held | `record.mjs` |
| The time of day shown, output size, frame rate | `run.sh` |

Every entity id must appear in `demo.yaml`, since the proxy only asks the stub for what the config names. The floorplan's element ids must match the entities in its `floorplans` groups, the same contract as a real drawing; see [docs/floorplans.md](../../docs/floorplans.md).

## Known quirks

- **The radar is live.** RainViewer's current frames are drawn over Potwin, Kansas, so the weather face shows whatever the weather is there when you record.
- **The basemap can go missing.** The map style is fetched fresh and is currently refused with a 301, so `run.sh` seeds its cache from `./cache` when a source run has left one. With neither, the radar draws over black.
- **The loop has a seam.** Lights flip during the recording, so the end does not match the start exactly.
- **The camera timestamps are drawn into the SVGs**, as 2026-09-29 14:20. Update them if the date on the dashboard matters.
