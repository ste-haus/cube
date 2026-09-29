"""A stand-in Home Assistant, for developing the dashboard without one.

Serves the websocket and REST surfaces cube talks to, driven by whichever dashboard config
it is pointed at. The floorplan it returns is generated from that config's groups, so the
wiring between entity, SVG element, and stylesheet class can be seen without a real drawing.

    uv run python tools/stub_hass.py --config config.yaml --port 8123
"""

import argparse
import asyncio
import colorsys
import random
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, Response, WebSocket, WebSocketDisconnect

from cube.dashboard import GUEST_FACE_CONTENT, AlertTier, Dashboard, Wifi, load_dashboard
from cube.hass import protocol

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8123
DEFAULT_CONFIG = Path("config.yaml")

CHURN_INTERVAL_SECONDS = 3.0
CHURN_ENTITY_COUNT = 3

ON = "on"
OFF = "off"
OPEN = "open"
CLOSED = "closed"
FULLY_OPEN = 100
FULLY_CLOSED = 0
BRIGHTNESS_MAX = 255
PERCENT = 100

# The services cube sets a value through, and the field each carries it in.
LIGHT_TURN_ON = ("light", "turn_on")
COVER_SET_POSITION = ("cover", "set_cover_position")
DATETIME_SET = ("input_datetime", "set_datetime")
BRIGHTNESS_PCT_FIELD = "brightness_pct"
HS_COLOR_FIELD = "hs_color"
XY_COLOR_FIELD = "xy_color"
# Home Assistant's own way from a CIE xy point to red, green, and blue: the matrix, and sRGB's gamma.
XY_TO_RGB = ((1.656492, -0.354851, -0.255038), (-0.707196, 1.655397, 0.036152), (0.051713, -0.121364, 1.011530))
GAMMA_KNEE = 0.0031308
GAMMA_LINEAR = 12.92
GAMMA_OFFSET = 0.055
GAMMA_EXPONENT = 1 / 2.4
HS_COLOR_ATTRIBUTE = "hs_color"
RGB_COLOR_ATTRIBUTE = "rgb_color"
SUPPORTED_COLOR_MODES_ATTRIBUTE = "supported_color_modes"
# Every light the stub serves can be coloured, and starts a warm white.
SAMPLE_COLOR_MODES = ["hs"]
SAMPLE_HS_COLOR = [35.0, 30.0]
HUE_TURN = 360
RGB_MAX = 255
POSITION_FIELD = "position"
TIME_FIELD = "time"
POSITION_ATTRIBUTE = "current_position"
BRIGHTNESS_ATTRIBUTE = "brightness"

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
SAMPLE_ALARM_TIME = "07:00:00"
SAMPLE_WIFI_SSID = "Example Guest"
SAMPLE_WIFI_PASSWORD = "correct-horse-battery-staple"
SAMPLE_COVER_POSITION = 50

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

# Both masters were last cleared a while ago, so an alert is cleared when it triggered before
# that and not when it triggered since. Master caution is lit, with alerts either side of its
# clear; master warning is dark, with every alert from before it.
MCW_ALERTS_ATTRIBUTE = "alerts"
MCW_LAST_CLEARED_ATTRIBUTE = "last_cleared"
MCW_CLEARED_MINUTES_AGO = 30
MINUTES_PER_DAY = 24 * 60
FIRE_EVENT_DOMAIN = "pyscript"
FIRE_EVENT_SERVICE = "fire_event"
SAMPLE_WARNINGS = (
    ("binary_sensor.mcw_warning_water_leak", "Water leak: Kitchen sink", 75),
    ("binary_sensor.mcw_warning_ups_runtime_low", "UPS runtime low: UPS 3301 4 min", 40),
)
SAMPLE_CAUTIONS = (
    ("binary_sensor.mcw_caution_utility_power", "Utility power lost", 5),
    ("binary_sensor.mcw_caution_doors_unsecured", "Doors unsecured: Front door, Garage door", 14),
    ("binary_sensor.mcw_caution_backup_stale", "No backup in 11 days", 2 * MINUTES_PER_DAY),
)

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


def sample_master(samples: tuple[tuple[str, str, int], ...]) -> dict[str, Any]:
    now = datetime.now(UTC)
    alerts = [
        {
            "entity_id": entity_id,
            "message": message,
            "triggered": (now - timedelta(minutes=minutes_ago)).isoformat(),
            "cleared": minutes_ago >= MCW_CLEARED_MINUTES_AGO,
        }
        for entity_id, message, minutes_ago in sorted(samples, key=lambda sample: sample[2])
    ]
    lit = any(not alert["cleared"] for alert in alerts)
    last_cleared = (now - timedelta(minutes=MCW_CLEARED_MINUTES_AGO)).isoformat()

    return {
        protocol.STATE: ON if lit else OFF,
        protocol.ATTRIBUTES: {MCW_ALERTS_ATTRIBUTE: alerts, MCW_LAST_CLEARED_ATTRIBUTE: last_cleared},
    }


def clear_master(state: dict[str, Any]) -> None:
    """What Home Assistant does on the clear event: every active alert is now a cleared one."""

    attributes = state[protocol.ATTRIBUTES]
    for alert in attributes.get(MCW_ALERTS_ATTRIBUTE, []):
        alert["cleared"] = True

    attributes[MCW_LAST_CLEARED_ATTRIBUTE] = datetime.now(UTC).isoformat()
    state[protocol.STATE] = OFF


def _initial_state(dashboard: Dashboard, entity_id: str) -> dict[str, Any]:
    domain, _, _ = entity_id.partition(".")
    attributes: dict[str, Any] = {}

    if dashboard.mcw and entity_id == dashboard.mcw.warning_entity_id:
        return sample_master(SAMPLE_WARNINGS)

    if dashboard.mcw and entity_id == dashboard.mcw.caution_entity_id:
        return sample_master(SAMPLE_CAUTIONS)

    for wifi in guest_wifis(dashboard):
        if entity_id == wifi.ssid_entity_id:
            return {protocol.STATE: SAMPLE_WIFI_SSID, protocol.ATTRIBUTES: {}}
        if entity_id == wifi.password_entity_id:
            return {protocol.STATE: SAMPLE_WIFI_PASSWORD, protocol.ATTRIBUTES: {}}

    if domain == "cover":
        return {protocol.STATE: OPEN, protocol.ATTRIBUTES: {POSITION_ATTRIBUTE: SAMPLE_COVER_POSITION}}

    if domain == "input_datetime":
        return {protocol.STATE: SAMPLE_ALARM_TIME, protocol.ATTRIBUTES: {}}

    if domain in ("light", "switch", "group", "input_boolean", "binary_sensor"):
        state = random.choice([ON, OFF])
        if domain == "light":
            attributes[SUPPORTED_COLOR_MODES_ATTRIBUTE] = SAMPLE_COLOR_MODES
            if state == ON:
                attributes["brightness"] = random.randint(*BRIGHTNESS_RANGE)
                set_colour(attributes, SAMPLE_HS_COLOR)

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


def guest_wifis(dashboard: Dashboard) -> list[Wifi]:
    """Every network a guest face shows, so its name and password read as a name and a password."""

    wifis = []

    for profile in dashboard.profiles.values():
        for face in profile.faces.values():
            wifi = face.options.get("wifi") if face.content == GUEST_FACE_CONTENT else None
            if wifi:
                wifis.append(Wifi.model_validate(wifi))

    return wifis


def set_colour(attributes: dict[str, Any], hs_color: list[float]) -> None:
    """Gives a light its hue and saturation, and the red, green, and blue Home Assistant works out from them."""

    hue, saturation = hs_color
    red, green, blue = colorsys.hsv_to_rgb(hue / HUE_TURN, saturation / PERCENT, 1)

    attributes[HS_COLOR_ATTRIBUTE] = hs_color
    attributes[RGB_COLOR_ATTRIBUTE] = [round(channel * RGB_MAX) for channel in (red, green, blue)]


def xy_to_hs(xy: list[float]) -> list[float]:
    """The hue and saturation Home Assistant reports for a light set to a CIE xy point."""

    x, y = xy
    luminance = 1.0
    tristimulus = ((luminance / y) * x, luminance, (luminance / y) * (1 - x - y))

    def gamma(value: float) -> float:
        linear = (
            GAMMA_LINEAR * value if value <= GAMMA_KNEE else (1 + GAMMA_OFFSET) * value**GAMMA_EXPONENT - GAMMA_OFFSET
        )

        return max(0.0, linear)

    rgb = [gamma(sum(weight * part for weight, part in zip(row, tristimulus, strict=True))) for row in XY_TO_RGB]
    brightest = max(rgb)
    hue, saturation, _ = colorsys.rgb_to_hsv(*(channel / brightest for channel in rgb))

    return [hue * HUE_TURN, saturation * PERCENT]


def apply_service(state: dict[str, Any], domain: str, service: str, data: dict[str, Any]) -> None:
    """What Home Assistant would do to an entity for the services cube calls."""

    attributes = state[protocol.ATTRIBUTES]

    if (domain, service) == LIGHT_TURN_ON and (HS_COLOR_FIELD in data or XY_COLOR_FIELD in data):
        state[protocol.STATE] = ON
        attributes[BRIGHTNESS_ATTRIBUTE] = attributes.get(BRIGHTNESS_ATTRIBUTE) or BRIGHTNESS_MAX
        hs_color = data[HS_COLOR_FIELD] if HS_COLOR_FIELD in data else xy_to_hs(data[XY_COLOR_FIELD])
        set_colour(attributes, hs_color)
    elif (domain, service) == LIGHT_TURN_ON:
        percent = data.get(BRIGHTNESS_PCT_FIELD, PERCENT)
        state[protocol.STATE] = ON if percent > 0 else OFF
        attributes[BRIGHTNESS_ATTRIBUTE] = round(percent * BRIGHTNESS_MAX / PERCENT) if percent > 0 else None
        if percent > 0 and RGB_COLOR_ATTRIBUTE not in attributes:
            set_colour(attributes, SAMPLE_HS_COLOR)
    elif (domain, service) == COVER_SET_POSITION:
        position = data[POSITION_FIELD]
        state[protocol.STATE] = OPEN if position > FULLY_CLOSED else CLOSED
        attributes[POSITION_ATTRIBUTE] = position
    elif (domain, service) == DATETIME_SET:
        # Home Assistant keeps the seconds, whether or not it was sent any.
        state[protocol.STATE] = data[TIME_FIELD] if data[TIME_FIELD].count(":") == 2 else f"{data[TIME_FIELD]}:00"
    elif state[protocol.STATE] in (OPEN, CLOSED):
        opening = state[protocol.STATE] == CLOSED
        state[protocol.STATE] = OPEN if opening else CLOSED
        attributes[POSITION_ATTRIBUTE] = FULLY_OPEN if opening else FULLY_CLOSED
    else:
        state[protocol.STATE] = OFF if state[protocol.STATE] == ON else ON

        # A colour light switched on shines in some colour, as a real one reports it.
        colour_light = SUPPORTED_COLOR_MODES_ATTRIBUTE in attributes
        if colour_light and state[protocol.STATE] == ON and RGB_COLOR_ATTRIBUTE not in attributes:
            set_colour(attributes, SAMPLE_HS_COLOR)


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

        # Only what is simply on or off, and not a face's own controls: a guest's light or alarm
        # switching itself while being set reads as a fault, not as a live panel.
        face_controls = {
            entity
            for profile in dashboard.profiles.values()
            for face in profile.faces.values()
            for entity in face.controls
        }
        toggleable = sorted(
            entity
            for entity in dashboard.toggleable_entities - face_controls
            if states[entity][protocol.STATE] in (ON, OFF)
        )
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

        # cube checks the connection is alive with Home Assistant's ping, and drops it when
        # nothing answers.
        if message_type == protocol.PING:
            await socket.send_json({protocol.ID: message_id, protocol.TYPE: protocol.PONG})
        elif message_type == protocol.SUBSCRIBE_ENTITIES:
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
        elif (
            message_type == protocol.CALL_SERVICE
            and message.get("domain") == FIRE_EVENT_DOMAIN
            and message.get("service") == FIRE_EVENT_SERVICE
        ):
            tier = message.get(protocol.SERVICE_DATA, {}).get("event_data", {}).get("tier")
            master = dashboard.mcw.entity_for(AlertTier(tier)) if dashboard.mcw and tier in set(AlertTier) else None

            if master in states:
                clear_master(states[master])
                await broadcast([master])

            await socket.send_json({protocol.ID: message_id, protocol.TYPE: protocol.RESULT, protocol.SUCCESS: True})
        elif message_type == protocol.CALL_SERVICE:
            entity_id = message.get("target", {}).get("entity_id")
            if entity_id in states:
                apply_service(
                    states[entity_id],
                    message.get("domain"),
                    message.get("service"),
                    message.get(protocol.SERVICE_DATA) or {},
                )
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
