"""tools/stub_hass.py with the randomness taken out, for recording the README demo.

    TZ=America/Chicago uv run python tools/demo/demo_stub.py --port 8124 --offset <seconds>

`--offset` moves the stub's clock by the same amount the recorder moves the page's, so the
forecast and the calendar agree with the time on the panel. Started by run.sh.
"""

import argparse
import itertools
import random
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import Response

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import stub_hass
from cube.dashboard import load_dashboard
from cube.hass import protocol

SEED = 7
SVG = "image/svg+xml"

# Potwin, Kansas.
LATITUDE = 37.9414
LONGITUDE = -97.0206

SUMMARY = "Partly cloudy, which is just sunny with commitment issues."
CONDITION_NOTE = "Pavement is warm. So is the dog. Adjust walks."
NOTICES = {
    "sensor.example_notice_delivery": (
        "A package arrived. It is not the one you wanted.",
        "mdi:package-variant-closed",
    ),
    "sensor.example_notice_collection_day": ("Recycling goes out tonight", "mdi:recycle"),
}

CAMERAS = {
    "camera.example_traffic": HERE / "traffic.svg",
    "camera.example_front_door": HERE / "cam-front.svg",
    "camera.example_back_yard": HERE / "cam-yard.svg",
}

# (hour, minute, title) for today.
CALENDARS = {
    "calendar.example_alice": [(8, 30, "Standup"), (12, 0, "Lunch with Priya"), (17, 30, "Climbing gym")],
    "calendar.example_bob": [(9, 0, "Dentist (ugh)"), (15, 0, "Oil change"), (19, 0, "Band practice")],
    "calendar.example_chores": [(18, 0, "Water the plants")],
}
EVENT_MINUTES = 45

# One light flips at a time, in this order, so the floorplan is visibly live.
LIGHT_CYCLE = [
    "light.example_hallway",
    "light.example_living_room",
    "light.example_garage",
    "light.example_hallway",
    "light.example_living_room",
    "light.example_garage",
]
LIGHT_INTERVAL_SECONDS = 2.5

STATES: dict[str, Any] = {
    "sensor.example_precipitation_probability": "20",
    "sensor.example_air_quality_index": "32",
    "sensor.example_allergy_index": "3.1",
    "sensor.example_sunrise": ("07:23", {"local_time": "07:23"}),
    "sensor.example_sunset": ("19:16", {"local_time": "19:16"}),
    "sensor.example_agenda_count": "6",
    "sensor.example_notice_count": "3",
    "sensor.example_vehicle_one_fuel_level": "78",
    "sensor.example_vehicle_two_fuel_level": "23",
    "sun.sun": "above_horizon",
    "zone.home": ("0", {"latitude": LATITUDE, "longitude": LONGITUDE}),
    "light.example_garage": "off",
    "light.example_kitchen": ("on", {"brightness": 230}),
    "light.example_living_room": ("on", {"brightness": 150}),
    "light.example_laundry": ("on", {"brightness": 200}),
    "light.example_hallway": "off",
    "binary_sensor.example_front_door": "locked",
    "binary_sensor.example_garage_door": "closed",
    "binary_sensor.example_kitchen_window": "on",
    "binary_sensor.example_living_room_window": "off",
    "binary_sensor.example_hallway_motion": "on",
    "binary_sensor.example_washer": "on",
    "sensor.example_bin": "out",
    "switch.example_living_room_fan": "on",
    "binary_sensor.example_driveway_occupied": "on",
}


class Scripted(random.Random):
    """The stub's random, except that the churn picks the next light in the cycle."""

    lights = itertools.cycle(LIGHT_CYCLE)

    def sample(self, population, k, **kwargs):
        return [next(self.lights)]


def shifted(offset: timedelta) -> type[datetime]:
    class Shifted(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.now(tz) + offset

    return Shifted


def demo_state(dashboard, entity_id: str, clock: type[datetime]) -> dict[str, Any]:
    now = clock.now(UTC)

    if entity_id in STATES:
        value = STATES[entity_id]
        state, attributes = value if isinstance(value, tuple) else (value, {})

        return {protocol.STATE: state, protocol.ATTRIBUTES: dict(attributes)}

    if entity_id == "weather.example":
        return {
            protocol.STATE: "partlycloudy",
            protocol.ATTRIBUTES: {
                "temperature": 61,
                "apparent_temperature": 60,
                "temperature_unit": "°F",
                "humidity": 48,
                "wind_speed": 8,
                "wind_gust_speed": 17,
                "wind_bearing": 225,
                "wind_speed_unit": "mph",
            },
        }

    if entity_id == dashboard.weather.summary_entity_id:
        return {protocol.STATE: SUMMARY, protocol.ATTRIBUTES: {}}

    for extreme, temperature, hours in ((dashboard.weather.high, 64, 2), (dashboard.weather.low, 47, 16)):
        if entity_id == extreme.entity_id:
            point = {
                "time": (now + timedelta(hours=hours)).isoformat(),
                "temperature": temperature,
                "upcoming": True,
                "hours": hours,
            }

            return {protocol.STATE: str(temperature), protocol.ATTRIBUTES: {extreme.turning_point_attribute: point}}

    for notice in dashboard.notices:
        if notice.entity_id == entity_id and entity_id in NOTICES:
            message, icon = NOTICES[entity_id]

            return {
                protocol.STATE: "on",
                protocol.ATTRIBUTES: {notice.message_attribute: message, notice.icon_attribute: icon},
            }

    if entity_id == "sensor.example_condition":
        return {protocol.STATE: "Caution", protocol.ATTRIBUTES: {"note": CONDITION_NOTE}}

    return stub_hass._initial_state(dashboard, entity_id)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=HERE / "demo.yaml")
    parser.add_argument("--port", type=int, default=8124)
    parser.add_argument("--offset", type=float, default=0.0, help="Seconds to move the clock by")
    args = parser.parse_args()

    clock = shifted(timedelta(seconds=args.offset))
    stub_hass.datetime = clock
    stub_hass.random = Scripted(SEED)
    stub_hass.CHURN_INTERVAL_SECONDS = LIGHT_INTERVAL_SECONDS
    stub_hass.CHURN_ENTITY_COUNT = 1

    dashboard = load_dashboard(args.config)
    stub_hass.build_states = lambda d: {e: demo_state(d, e, clock) for e in sorted(d.allowed_entities)}

    app = stub_hass.create_stub(dashboard)
    app.router.routes = [
        r for r in app.router.routes if not getattr(r, "path", "").startswith(("/api/calendars", "/api/camera_proxy"))
    ]

    @app.get("/api/calendars/{entity_id}")
    async def calendar(entity_id: str) -> list[dict[str, Any]]:
        midnight = clock.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)

        return [
            {
                "summary": title,
                "start": {"dateTime": (midnight + timedelta(hours=hour, minutes=minute)).isoformat()},
                "end": {"dateTime": (midnight + timedelta(hours=hour, minutes=minute + EVENT_MINUTES)).isoformat()},
            }
            for hour, minute, title in CALENDARS.get(entity_id, [])
        ]

    @app.get("/api/camera_proxy_stream/{entity_id}")
    @app.get("/api/camera_proxy/{entity_id}")
    async def camera(entity_id: str) -> Response:
        path = CAMERAS.get(entity_id)
        content = path.read_bytes() if path else stub_hass.PLACEHOLDER_CAMERA_SVG.encode()

        return Response(content=content, media_type=SVG)

    uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
