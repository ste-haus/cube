#!/usr/bin/env bash
# Records assets/demo.gif, the README's drag-to-rotate demo, against a stub Home Assistant.
#
#   tools/demo/run.sh still    # a screenshot of each face the recording visits, to check first
#   tools/demo/run.sh record   # the GIF itself
#
# Everything the panel shows is fictional: demo.yaml names only example entities, demo_stub.py
# answers for them, and `--no-env-file` keeps a real .env and its Home Assistant out of it. The
# page's clock is moved to the afternoon in Kansas, so the agenda is partway through a day.
#
# Needs uv, node, ffmpeg and Chrome (set CHROME if it is not at the macOS path). Scratch output
# goes to DEMO_WORK, a temporary directory unless set.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MODE="${1:-still}"
WORK="${DEMO_WORK:-${TMPDIR:-/tmp}/cube-demo}"
GIF="$REPO/assets/demo.gif"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

ZONE=America/Chicago
DEMO_TIME="14:20"
STUB_PORT=8124
PANEL_PORT=4097
DEVTOOLS_PORT=9333
GIF_WIDTH=960
GIF_FPS=20
STARTUP_SECONDS=6

mkdir -p "$WORK"

# Seconds from now to today's DEMO_TIME in ZONE.
OFFSET=$(TZ=$ZONE python3 -c "
from datetime import datetime
now = datetime.now().astimezone()
hour, minute = map(int, '$DEMO_TIME'.split(':'))
print(int((now.replace(hour=hour, minute=minute, second=0, microsecond=0) - now).total_seconds()))
")
echo "clock offset: ${OFFSET}s"

stop() {
  for port in $PANEL_PORT $STUB_PORT $DEVTOOLS_PORT; do
    pids=$(lsof -tiTCP:$port -sTCP:LISTEN || true)
    [ -n "$pids" ] && kill $pids
  done
  return 0
}
stop
trap stop EXIT
sleep 1

# The panel's resources: the house, and the icon set the repo already has.
mkdir -p "$WORK/resources"
python3 "$HERE/floorplan.py" "$WORK/resources/floorplans/downstairs.svg"
[ -f "$REPO/resources/icons.json" ] && cp "$REPO/resources/icons.json" "$WORK/resources/"
: > "$WORK/resources/floorplan.css"

# Seeded from a source run's cache when there is one, so the radar has a basemap even while the
# style server is refusing a fresh fetch.
if [ ! -d "$WORK/cache" ] && [ -d "$REPO/cache" ]; then
  cp -R "$REPO/cache" "$WORK/cache"
fi

cd "$REPO"
[ -d web/dist ] || npm --prefix web run build

TZ=$ZONE nohup uv run --no-env-file python "$HERE/demo_stub.py" --config "$HERE/demo.yaml" \
  --port $STUB_PORT --offset "$OFFSET" > "$WORK/stub.log" 2>&1 &
sleep 4

CUBE_HA_URL=http://127.0.0.1:$STUB_PORT CUBE_HA_TOKEN=demo CUBE_PORT=$PANEL_PORT CUBE_HOST=127.0.0.1 \
  CUBE_DASHBOARD_PATH="$HERE/demo.yaml" CUBE_FRONTEND_PATH=web/dist CUBE_RESOURCES_PATH="$WORK/resources" \
  CUBE_CACHE_PATH="$WORK/cache" TZ=$ZONE \
  nohup uv run --no-env-file python -m cube > "$WORK/cube.log" 2>&1 &

"$CHROME" --headless=new --remote-debugging-port=$DEVTOOLS_PORT --user-data-dir="$WORK/chrome" \
  --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars about:blank > "$WORK/chrome.log" 2>&1 &
sleep $STARTUP_SECONDS
for _ in 1 2 3 4 5 6; do curl -s http://127.0.0.1:$DEVTOOLS_PORT/json/version > /dev/null && break; sleep 2; done

grep -v "tilecache\|httpx" "$WORK/cube.log" | grep -i "warn\|error" || true

if [ "$MODE" = "record" ]; then
  rm -rf "$WORK/rec"
  PANEL_URL=http://127.0.0.1:$PANEL_PORT/ node "$HERE/record.mjs" $DEVTOOLS_PORT "$WORK/rec" record "$OFFSET"
  cd "$WORK/rec"
  ffmpeg -loglevel error -y -f concat -safe 0 -i frames.txt \
    -vf "fps=$GIF_FPS,scale=$GIF_WIDTH:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
    -loop 0 "$GIF"
  ls -la "$GIF"
else
  PANEL_URL=http://127.0.0.1:$PANEL_PORT/ node "$HERE/record.mjs" $DEVTOOLS_PORT "$WORK/still" still "$OFFSET"
  echo "stills in $WORK/still"
fi
