"""A stand-in Home Assistant, for developing the dashboard without one.

Serves the websocket and REST surfaces cube talks to, driven by whichever dashboard config
it is pointed at. The floorplan it returns is generated from that config's groups, so the
wiring between entity, SVG element, and stylesheet class can be seen without a real drawing.

    uv run python tools/stub_hass.py --config config.yaml --port 8123
"""

import argparse
import asyncio
import random
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, Response, WebSocket, WebSocketDisconnect

from cube.dashboard import Dashboard, load_dashboard
from cube.hass import protocol

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8123
DEFAULT_CONFIG = Path("config.yaml")

CHURN_INTERVAL_SECONDS = 3.0
CHURN_ENTITY_COUNT = 3

ON = "on"
OFF = "off"

# Plausible readings, so the panel has something to lay out.
NUMERIC_RANGE = (0, 100)
TEMPERATURE_RANGE = (30, 90)
BEARING_RANGE = (0, 359)
BRIGHTNESS_RANGE = (40, 255)
# Either side of now: a turning point still to come, or one just gone.
TURNING_POINT_HOURS_RANGE = (-6, 12)

SAMPLE_NOTICE_ICON = "mdi:information-outline"
SAMPLE_MESSAGE = "Sample notice text"
SAMPLE_CONDITION = "partlycloudy"
SAMPLE_HUMIDITY_RANGE = (30, 95)
SAMPLE_TEMPERATURE_UNIT = "°F"
SAMPLE_WIND_SPEED_UNIT = "mph"
# How far a gust runs over the steady wind, sometimes enough to be worth showing.
GUST_EXTRA_RANGE = (0, 25)
SUN_UP = "above_horizon"

# A week that has some shape to it, stamped the way most providers stamp a day: its local midnight.
SAMPLE_FORECAST_DAYS = 7
# A day of hours from the one under way, the temperature drifting a degree or two at a time.
SAMPLE_FORECAST_HOURS = 24
HOURLY_DRIFT_RANGE = (-2, 2)
SAMPLE_RAIN_CHANCES = (0, 0, 0, 10, 30, 60)
FORECAST_TYPE_KEY = "type"
HOURLY_FORECAST_TYPE = "hourly"
SAMPLE_FORECAST_CONDITIONS = ("sunny", "partlycloudy", "cloudy", "rainy")
FORECAST_LOW_RANGE = (45, 60)
FORECAST_SPREAD_RANGE = (8, 20)

# A place where the machine's own clock is roughly solar time, so the horizon the stub draws has
# its sunrise in the morning wherever it is run. Fifteen degrees of longitude to the hour.
SAMPLE_LATITUDE = 45.0
MINUTES_PER_DEGREE = 4
SECONDS_PER_MINUTE = 60
SAMPLE_SUMMARY = "Grey, with a decent chance of more grey later on."
SAMPLE_TRANSCRIPT = "this is a sample announcement"

# A day with a shape to it: a busy morning, a long empty afternoon, something late on. The
# gap is what makes the timeline's break worth looking at.
SAMPLE_EVENT_HOURS = (9, 10, 15, 16)
SAMPLE_STATUS_STATE = "Caution"
SAMPLE_STATUS_NOTE = "Pavement is warm"

# A schematic floorplan: one labelled cell per entity, laid out on a grid.
CELL_WIDTH = 150
CELL_HEIGHT = 60
CELL_GAP = 10
COLUMNS = 4
LABEL_OFFSET_X = 8
LABEL_OFFSET_Y = 24
GROUP_OFFSET_Y = 42
FONT_SIZE = 11
GROUP_FONT_SIZE = 9

PLACEHOLDER_CAMERA_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">'
    '<rect width="320" height="180" fill="#111111" />'
    '<text x="160" y="95" fill="#555555" font-family="monospace" font-size="14" '
    'text-anchor="middle">camera</text></svg>'
)



def build_states(dashboard: Dashboard) -> dict[str, dict[str, Any]]:
    states: dict[str, dict[str, Any]] = {}

    for entity_id in sorted(dashboard.allowed_entities):
        states[entity_id] = _initial_state(dashboard, entity_id)

    return states


def _initial_state(dashboard: Dashboard, entity_id: str) -> dict[str, Any]:
    domain, _, _ = entity_id.partition(".")
    attributes: dict[str, Any] = {}

    if domain in ("light", "switch", "group", "input_boolean", "binary_sensor"):
        state = random.choice([ON, OFF])
        if domain == "light" and state == ON:
            attributes["brightness"] = random.randint(*BRIGHTNESS_RANGE)

        return {protocol.STATE: state, protocol.ATTRIBUTES: attributes}

    if domain == "weather":
        wind_speed = random.randint(*NUMERIC_RANGE)

        return {
            protocol.STATE: SAMPLE_CONDITION,
            protocol.ATTRIBUTES: {
                "temperature": random.randint(*TEMPERATURE_RANGE),
                "apparent_temperature": random.randint(*TEMPERATURE_RANGE),
                "temperature_unit": SAMPLE_TEMPERATURE_UNIT,
                "humidity": random.randint(*SAMPLE_HUMIDITY_RANGE),
                "wind_speed": wind_speed,
                "wind_gust_speed": wind_speed + random.randint(*GUST_EXTRA_RANGE),
                "wind_bearing": random.randint(*BEARING_RANGE),
                "wind_speed_unit": SAMPLE_WIND_SPEED_UNIT,
            },
        }

    if domain == "zone":
        return {
            protocol.STATE: "0",
            protocol.ATTRIBUTES: {"latitude": SAMPLE_LATITUDE, "longitude": sample_longitude()},
        }

    if domain == "sun":
        return {protocol.STATE: SUN_UP, protocol.ATTRIBUTES: {}}

    if domain == "input_text":
        return {protocol.STATE: SAMPLE_TRANSCRIPT, protocol.ATTRIBUTES: {}}

    if domain in ("calendar", "camera", "media_player"):
        return {protocol.STATE: OFF, protocol.ATTRIBUTES: {}}

    for notice in dashboard.notices:
        if notice.entity_id == entity_id:
            return {
                protocol.STATE: ON,
                protocol.ATTRIBUTES: {
                    notice.message_attribute: SAMPLE_MESSAGE,
                    notice.icon_attribute: SAMPLE_NOTICE_ICON,
                },
            }

    for indicator in dashboard.status_indicators:
        if indicator.entity_id == entity_id:
            attribute = indicator.attribute or "note"

            return {protocol.STATE: SAMPLE_STATUS_STATE, protocol.ATTRIBUTES: {attribute: SAMPLE_STATUS_NOTE}}

    if dashboard.weather and entity_id == dashboard.weather.summary_entity_id:
        return {protocol.STATE: SAMPLE_SUMMARY, protocol.ATTRIBUTES: {}}

    for extreme in (dashboard.weather.high, dashboard.weather.low) if dashboard.weather else ():
        if extreme and extreme.entity_id == entity_id:
            attributes: dict[str, Any] = {}

            if extreme.turning_point_attribute:
                hours = random.randint(*TURNING_POINT_HOURS_RANGE)
                attributes[extreme.turning_point_attribute] = {
                    "time": (datetime.now(UTC) + timedelta(hours=hours)).isoformat(),
                    "temperature": random.randint(*TEMPERATURE_RANGE),
                    "upcoming": hours >= 0,
                    "hours": hours,
                }

            return {protocol.STATE: str(random.randint(*TEMPERATURE_RANGE)), protocol.ATTRIBUTES: attributes}

    return {protocol.STATE: str(random.randint(*NUMERIC_RANGE)), protocol.ATTRIBUTES: {}}


def sample_longitude() -> float:
    offset = datetime.now().astimezone().utcoffset() or timedelta(0)

    return offset.total_seconds() / SECONDS_PER_MINUTE / MINUTES_PER_DEGREE


def sample_hourly_forecast() -> list[dict[str, Any]]:
    start = datetime.now().astimezone().replace(minute=0, second=0, microsecond=0)
    temperature = random.randint(*FORECAST_LOW_RANGE)

    hours = []
    for offset in range(SAMPLE_FORECAST_HOURS):
        temperature += random.randint(*HOURLY_DRIFT_RANGE)
        hours.append(
            {
                "datetime": (start + timedelta(hours=offset)).isoformat(),
                "condition": random.choice(SAMPLE_FORECAST_CONDITIONS),
                "temperature": temperature,
                "precipitation_probability": random.choice(SAMPLE_RAIN_CHANCES),
            }
        )

    return hours


def sample_forecast() -> list[dict[str, Any]]:
    midnight = datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)

    days = []
    for offset in range(SAMPLE_FORECAST_DAYS):
        low = random.randint(*FORECAST_LOW_RANGE)
        days.append(
            {
                "datetime": (midnight + timedelta(days=offset)).isoformat(),
                "condition": random.choice(SAMPLE_FORECAST_CONDITIONS),
                "temperature": low + random.randint(*FORECAST_SPREAD_RANGE),
                "templow": low,
                "precipitation_probability": random.randint(*NUMERIC_RANGE),
            }
        )

    return days


def render_floorplan(dashboard: Dashboard, image: str) -> str:
    """Draws a labelled cell per entity, so the SVG-to-entity contract is visible."""

    plan = next((level for level in dashboard.floorplans.values() if level.image == image), None)
    if plan is None:
        return "<svg xmlns='http://www.w3.org/2000/svg'></svg>"

    cells = []
    index = 0
    for group, entities in plan.groups.items():
        for entity_id in entities:
            column = index % COLUMNS
            row = index // COLUMNS
            x = column * (CELL_WIDTH + CELL_GAP)
            y = row * (CELL_HEIGHT + CELL_GAP)

            cells.append(
                f'<g id="{entity_id}">'
                f'<rect x="{x}" y="{y}" width="{CELL_WIDTH}" height="{CELL_HEIGHT}" />'
                f'<text x="{x + LABEL_OFFSET_X}" y="{y + LABEL_OFFSET_Y}" font-size="{FONT_SIZE}">{entity_id}</text>'
                f'<text x="{x + LABEL_OFFSET_X}" y="{y + GROUP_OFFSET_Y}" font-size="{GROUP_FONT_SIZE}">{group}</text>'
                f"</g>"
            )
            index += 1

    rows = (index + COLUMNS - 1) // COLUMNS
    width = COLUMNS * (CELL_WIDTH + CELL_GAP)
    height = rows * (CELL_HEIGHT + CELL_GAP)

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}">{"".join(cells)}</svg>'
    )


def create_stub(dashboard: Dashboard) -> FastAPI:
    app = FastAPI()
    states = build_states(dashboard)
    listeners: set[WebSocket] = set()
    subscriptions: dict[WebSocket, int] = {}

    async def broadcast(entity_ids: list[str]) -> None:
        changed = {
            entity_id: {
                protocol.CHANGE_SET: {
                    protocol.STATE: states[entity_id][protocol.STATE],
                    protocol.ATTRIBUTES: states[entity_id][protocol.ATTRIBUTES],
                }
            }
            for entity_id in entity_ids
        }

        for socket in list(listeners):
            try:
                await socket.send_json(
                    {
                        protocol.ID: subscriptions.get(socket, 0),
                        protocol.TYPE: protocol.EVENT,
                        protocol.EVENT: {protocol.CHANGED: changed},
                    }
                )
            except Exception:  # noqa: BLE001 - a panel that has gone away must not stop the rest
                listeners.discard(socket)

    async def churn() -> None:
        """Flips a few entities on a timer, so the panel is visibly live."""

        toggleable = sorted(dashboard.toggleable_entities)
        if not toggleable:
            return

        while True:
            await asyncio.sleep(CHURN_INTERVAL_SECONDS)

            picked = random.sample(toggleable, min(CHURN_ENTITY_COUNT, len(toggleable)))
            for entity_id in picked:
                current = states[entity_id][protocol.STATE]
                states[entity_id][protocol.STATE] = OFF if current == ON else ON

            await broadcast(picked)

    @app.on_event("startup")
    async def start_churn() -> None:
        asyncio.create_task(churn())

    @app.websocket("/api/websocket")
    async def websocket(socket: WebSocket) -> None:
        await socket.accept()
        await socket.send_json({protocol.TYPE: protocol.AUTH_REQUIRED})

        await socket.receive_json()
        await socket.send_json({protocol.TYPE: protocol.AUTH_OK})

        listeners.add(socket)
        try:
            while True:
                message = await socket.receive_json()
                await _dispatch(socket, message)
        except WebSocketDisconnect:
            pass
        finally:
            listeners.discard(socket)
            subscriptions.pop(socket, None)

    async def _dispatch(socket: WebSocket, message: dict[str, Any]) -> None:
        message_id = message.get(protocol.ID, 0)
        message_type = message.get(protocol.TYPE)

        if message_type == protocol.SUBSCRIBE_ENTITIES:
            subscriptions[socket] = message_id
            requested = message.get(protocol.ENTITY_IDS, [])

            await socket.send_json({protocol.ID: message_id, protocol.TYPE: protocol.RESULT, protocol.SUCCESS: True})
            await socket.send_json(
                {
                    protocol.ID: message_id,
                    protocol.TYPE: protocol.EVENT,
                    protocol.EVENT: {
                        protocol.ADDED: {entity_id: states[entity_id] for entity_id in requested if entity_id in states}
                    },
                }
            )
        elif message_type == protocol.CALL_SERVICE and message.get(protocol.RETURN_RESPONSE):
            # The only service cube asks an answer of is the forecast, by the day or by the hour.
            entity_id = message.get("target", {}).get("entity_id")
            kind = message.get(protocol.SERVICE_DATA, {}).get(FORECAST_TYPE_KEY)
            forecast = sample_hourly_forecast() if kind == HOURLY_FORECAST_TYPE else sample_forecast()

            await socket.send_json(
                {
                    protocol.ID: message_id,
                    protocol.TYPE: protocol.RESULT,
                    protocol.SUCCESS: True,
                    protocol.RESULT_PAYLOAD: {protocol.RESPONSE: {entity_id: {"forecast": forecast}}},
                }
            )
        elif message_type == protocol.CALL_SERVICE:
            entity_id = message.get("target", {}).get("entity_id")
            if entity_id in states:
                current = states[entity_id][protocol.STATE]
                states[entity_id][protocol.STATE] = OFF if current == ON else ON
                await broadcast([entity_id])

            await socket.send_json({protocol.ID: message_id, protocol.TYPE: protocol.RESULT, protocol.SUCCESS: True})

    @app.get("/api/calendars/{entity_id}")
    async def calendar(entity_id: str) -> list[dict[str, Any]]:
        start = datetime.now().astimezone()

        midnight = start.replace(hour=0, minute=0, second=0, microsecond=0)

        return [
            {
                "summary": f"{entity_id.split('.')[-1]} event {index + 1}",
                "start": {"dateTime": (midnight + timedelta(hours=hour)).isoformat()},
                "end": {"dateTime": (midnight + timedelta(hours=hour, minutes=45)).isoformat()},
            }
            for index, hour in enumerate(SAMPLE_EVENT_HOURS)
        ]

    @app.get("/api/camera_proxy_stream/{entity_id}")
    @app.get("/api/camera_proxy/{entity_id}")
    async def camera(entity_id: str) -> Response:
        return Response(content=PLACEHOLDER_CAMERA_SVG, media_type="image/svg+xml")

    return app


def write_floorplans(dashboard: Dashboard, directory: Path) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)

    written = []
    for plan in dashboard.floorplans.values():
        path = directory / f"{plan.image}.svg"
        path.write_text(render_floorplan(dashboard, plan.image))
        written.append(path)

    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--host", default=DEFAULT_HOST, help="Bind address; use 0.0.0.0 to reach it from a container")
    parser.add_argument(
        "--write-floorplans",
        type=Path,
        metavar="DIR",
        help="Write a schematic SVG per floorplan into DIR and exit, for panels with no drawing yet",
    )
    arguments = parser.parse_args()

    dashboard = load_dashboard(arguments.config)

    if arguments.write_floorplans:
        for path in write_floorplans(dashboard, arguments.write_floorplans):
            print(f"wrote {path}")

        return

    uvicorn.run(create_stub(dashboard), host=arguments.host, port=arguments.port)


if __name__ == "__main__":
    main()
