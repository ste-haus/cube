"""tools/stub_hass.py with the randomness taken out, for recording the README demo.

    TZ=America/Chicago uv run python tools/demo/demo_stub.py --port 8124 --offset <seconds>

`--offset` moves the stub's clock by the same amount the recorder moves the page's, so the
forecast and the calendar agree with the time on the panel. Started by run.sh.
"""

import argparse
import itertools
import math
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

# Minutes to each trip under way, and how long from now each should leave: Alice soon, Bob a
# couple of minutes ago, and the commute, which leaves whenever, with none.
TRAVEL_TIMES = {
    "sensor.example_travel_time_alice": (34, "sensor.example_departure_time_alice", 12),
    "sensor.example_travel_time_bob": (22, "sensor.example_departure_time_bob", -2),
    "sensor.example_travel_time_home_to_work": (18, None, None),
}

# The event each trip is for: its title, how long from now it starts (the time to leave, the
# drive, and the five minutes the departure time leaves spare), and where.
DEPARTURE_SPARE_MINUTES = 5
TRIP_EVENTS = {
    "calendar.example_alice": ("Climbing gym", 12 + 34 + DEPARTURE_SPARE_MINUTES, "Botanica, 701 Amidon St, Wichita"),
    "calendar.example_bob": ("Oil change", -2 + 22 + DEPARTURE_SPARE_MINUTES, "Midas, 2001 N Rock Rd, Wichita"),
}

# How many minutes ago each route's time was last asked for.
CHECKED_MINUTES_AGO = {
    "input_datetime.example_checked_alice": 4,
    "input_datetime.example_checked_bob": 11,
    "input_datetime.example_checked_home_to_work": 2,
}
HA_LOCAL_FORMAT = "%Y-%m-%d %H:%M:%S"

# What each route read before now, as (minutes ago, minutes), oldest first, for the window's
# trend; its reading now is from TRAVEL_TIMES, as of a few minutes ago.
TRAVEL_HISTORY = {
    "sensor.example_travel_time_alice": [(40, 28), (20, 31)],
    "sensor.example_travel_time_bob": [(30, 25)],
    "sensor.example_travel_time_home_to_work": [(25, 16)],
}
LATEST_READING_MINUTES_AGO = 5

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
    "sensor.example_bin": "take_out",
    "switch.example_living_room_fan": "on",
    "binary_sensor.example_driveway_occupied": "on",
    # What a tap on a route opens: what traffic adds, how far, and where.
    "sensor.example_free_flow_alice": ("26", {"unit_of_measurement": "min"}),
    "sensor.example_distance_alice": ("18.43", {"unit_of_measurement": "mi"}),
    "sensor.example_destination_alice": ("37.6872,-97.3301", {"address": "Botanica, 701 Amidon St, Wichita"}),
    "sensor.example_free_flow_bob": ("19", {"unit_of_measurement": "min"}),
    "sensor.example_distance_bob": ("11.72", {"unit_of_measurement": "mi"}),
    "sensor.example_destination_bob": ("37.7174,-97.2447", {"address": "Midas, 2001 N Rock Rd, Wichita"}),
    "sensor.example_free_flow_home_to_work": ("15", {"unit_of_measurement": "min"}),
    "sensor.example_distance_home_to_work": ("9.06", {"unit_of_measurement": "mi"}),
    # The commute usually takes 16 at this hour, so today's 18 is slower than usual.
    "sensor.example_usual_home_to_work": ("16", {"unit_of_measurement": "min"}),
    # Alice is home and due to leave; Bob has already gone, so his trip is not hurried.
    "person.example_alice": "home",
    "person.example_bob": "not_home",
}


# The network face: a small house of hosts behind one gateway, one of them in a cluster, with every
# address from the ranges kept for documentation.
UP = "on"
DOWN = "off"
METRICS_ATTRIBUTES = ("cpu_utilization", "memory_utilization", "disk_utilization")
NETWORK_STATES: dict[str, Any] = {
    "binary_sensor.example_resolver_connection": UP,
    "sensor.example_resolver_latency": "6.4",
    "binary_sensor.example_search_connection": UP,
    "sensor.example_search_latency": "8.1",
    "binary_sensor.example_wan": UP,
    "sensor.example_public_ip": "203.0.113.42",
    "sensor.example_wan_download": "287",
    "sensor.example_wan_upload": "412",
    "binary_sensor.example_modem_connection": UP,
    "sensor.example_modem_latency": "0.9",
    "binary_sensor.example_gateway_connection": UP,
    "sensor.example_gateway_latency": "0.4",
    "switch.example_dns_blocking": UP,
    "binary_sensor.example_dns_connection": UP,
    "binary_sensor.example_nas_connection": UP,
    "sensor.example_nas_latency": "0.5",
    "sensor.example_nas_ip": "192.0.2.10",
    "binary_sensor.example_cluster": UP,
    "binary_sensor.example_node_a_connection": UP,
    "sensor.example_node_a_latency": "0.6",
    "sensor.example_node_a_ip": "192.0.2.21",
    "binary_sensor.example_node_b_connection": UP,
    "sensor.example_node_b_latency": "0.4",
    "sensor.example_node_b_ip": "192.0.2.22",
    "binary_sensor.example_home_server": UP,
    "binary_sensor.example_home_assistant": UP,
    "binary_sensor.example_zigbee_connection": DOWN,
    "binary_sensor.example_mqtt_connection": UP,
    "sensor.example_nas_metrics": (
        "online",
        {
            "cpu_utilization": 0.04,
            "memory_utilization": 0.71,
            "disk_utilization": 0.58,
            "upsince": "2026-07-21 13:32:13",
        },
    ),
    "sensor.example_node_a_metrics": (
        "online",
        {
            "cpu_utilization": 0.23,
            "memory_utilization": 0.66,
            "disk_utilization": 0.12,
            "upsince": "2026-09-30 08:02:51",
        },
    ),
    "sensor.example_node_b_metrics": (
        "online",
        {"cpu_utilization": 0.08, "memory_utilization": 0.46, "disk_utilization": 0.29},
    ),
    "sensor.example_ups": ("normal", {"capacity": 100, "runtime_remaining": 1320}),
    "sensor.example_home_server_name": "atlas",
    "sensor.example_home_server_ip": "192.0.2.30",
    "sensor.example_home_server_heartbeat": "beating",
    "sensor.example_home_server_booted": "2026-10-11T18:58:58+00:00",
    "sensor.example_home_server_cpu": "6",
    "sensor.example_home_server_memory": "21",
    "sensor.example_home_server_disk": "9",
    "sensor.example_home_server_power": ("normal", {"capacity": 80, "runtime_remaining": 600}),
    "sensor.example_home_server_status": (
        "ok",
        {
            "containers": [
                {"name": name, "state": state, "status": status, "uptime": uptime}
                for name, state, status, uptime in (
                    ("broker", "ok", "healthy", "6d 2h"),
                    ("database", "ok", "healthy", "6d 2h"),
                    ("home-assistant", "ok", "healthy", "6d 2h"),
                    ("migrate", "completed", "completed", "6d 2h"),
                    ("proxy", "ok", "healthy", "6d 2h"),
                    ("recorder-backup", "warning", "restarted x2", "4m"),
                    ("updater", "ok", "running", "6d 2h"),
                    ("zigbee", "ok", "running", "1h 12m"),
                )
            ]
        },
    ),
    "sensor.example_vips": ("online", {"dns": "nas", "cluster": "node-a", "lb": "node-b"}),
    "sensor.example_wifi_clients": "23",
    "sensor.example_ads_blocked": "6142",
    "sensor.example_blocked_share": "0.9",
    "sensor.example_dns_rate": "312",
    "sensor.example_state_changes": "842",
    "sensor.example_automations": "37",
    "sensor.example_loop_lag": "6",
    "sensor.example_mqtt_rate": "1180",
    "sensor.example_rack_temperature": "81",
    "sensor.example_rack_top_temperature": "75",
    "sensor.example_rack_bottom_temperature": "69",
    "sensor.example_rack_fan": "3",
    "sensor.example_media_sessions": (
        "2",
        {
            "sessions": [
                {
                    "device": "Living Room TV",
                    "user": "alice",
                    "title": "The Long Way Round",
                    "series": "Night Trains",
                    "state": "playing",
                    "position": 1310,
                    "duration": 2640,
                    "play_method": "DirectPlay",
                    "resolution": "1080p",
                    "bitrate": 8_400_000,
                },
                {
                    "device": "Bob's laptop",
                    "user": "bob",
                    "title": "Signs",
                    "series": "Small Hours",
                    "state": "paused",
                    "position": 301,
                    "duration": 1320,
                    "play_method": "Transcode",
                    "resolution": "720p",
                    "bitrate": 3_200_000,
                },
            ]
        },
    ),
}
STATES.update(NETWORK_STATES)

# How long the connection has been up, and the day's dropouts on the strips: (hours ago, minutes).
WAN_UP_FOR = timedelta(days=12, hours=4)
OUTAGES = {
    "binary_sensor.example_nas_connection": [],
    "binary_sensor.example_wan": [(7, 25)],
    "binary_sensor.example_node_a_connection": [(9.5, 25)],
    "binary_sensor.example_node_b_connection": [(17, 70), (3, 6)],
}
HOME_SERVER_HEARTBEAT = "sensor.example_home_server_heartbeat"
HEARTBEAT_GAPS = [(14 * 60, 40), (5 * 60, 2)]
MINUTES_PER_HOUR = 60
HOURS_PER_DAY = 24
WHOLE_TURN = 2 * math.pi

# A day of the rack, warmest mid-afternoon, and of its fan, which follows it; and an hour of the
# rates and the latency, each drifting about its reading now: (centre, swing, minutes between).
RACK_TEMPERATURE = "sensor.example_rack_temperature"
RACK_FAN = "sensor.example_rack_fan"
RACK_SWING = 3
FAN_SWING = 3
RACK_STEP_MINUTES = 5
WAVES = {
    "sensor.example_wan_download": (287, 160, 2),
    "sensor.example_wan_upload": (412, 140, 2),
    "sensor.example_resolver_latency": (6.4, 2, 2),
}
WAVE_MINUTES = 60
WAVE_CYCLES = 3


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

        mocked = {protocol.STATE: state, protocol.ATTRIBUTES: dict(attributes)}
        if entity_id == "binary_sensor.example_wan":
            mocked[protocol.LAST_CHANGED] = (now - WAN_UP_FOR).timestamp()

        return mocked

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

    for travel_entity_id, (minutes, departure_entity_id, leave_in_minutes) in TRAVEL_TIMES.items():
        if entity_id == travel_entity_id:
            return {protocol.STATE: str(minutes), protocol.ATTRIBUTES: {"unit_of_measurement": "min"}}

        if entity_id == departure_entity_id:
            leave = now + timedelta(minutes=leave_in_minutes)

            return {protocol.STATE: str(int(leave.timestamp())), protocol.ATTRIBUTES: {}}

    if entity_id in TRIP_EVENTS:
        title, starts_in_minutes, location = TRIP_EVENTS[entity_id]
        start = (now + timedelta(minutes=starts_in_minutes)).astimezone()

        return {
            protocol.STATE: "off",
            protocol.ATTRIBUTES: {
                "message": title,
                "all_day": False,
                "start_time": start.strftime(HA_LOCAL_FORMAT),
                "location": location,
            },
        }

    if entity_id in CHECKED_MINUTES_AGO:
        checked = (now - timedelta(minutes=CHECKED_MINUTES_AGO[entity_id])).astimezone()

        return {
            protocol.STATE: checked.strftime(HA_LOCAL_FORMAT),
            protocol.ATTRIBUTES: {"timestamp": checked.timestamp()},
        }

    if entity_id == "sensor.example_condition":
        return {protocol.STATE: "Caution", protocol.ATTRIBUTES: {"note": CONDITION_NOTE}}

    return stub_hass._initial_state(dashboard, entity_id)


def network_history(entity_id: str, start: datetime, now: datetime) -> list[dict[str, Any]] | None:
    """What the network face's strips and charts read: dropouts, a heartbeat, a day, and an hour."""

    def entry(state: Any, at: datetime) -> dict[str, Any]:
        return {"state": str(state), "last_changed": at.isoformat()}

    if entity_id in OUTAGES:
        entries = [entry(UP, start)]
        for hours_ago, minutes in sorted(OUTAGES[entity_id], reverse=True):
            down = now - timedelta(hours=hours_ago)
            entries += [entry(DOWN, down), entry(UP, down + timedelta(minutes=minutes))]

        return entries

    if entity_id == HOME_SERVER_HEARTBEAT:
        minutes = int((now - start).total_seconds() // timedelta(minutes=1).total_seconds())

        return [
            entry(ago, now - timedelta(minutes=ago))
            for ago in range(minutes, 0, -1)
            if not any(gap_start >= ago > gap_start - length for gap_start, length in HEARTBEAT_GAPS)
        ]

    if entity_id in (RACK_TEMPERATURE, RACK_FAN):
        reading = float(STATES[entity_id])
        swing = RACK_SWING if entity_id == RACK_TEMPERATURE else FAN_SWING
        day = HOURS_PER_DAY * MINUTES_PER_HOUR

        def shape(ago: int) -> float:
            return swing * math.sin((day - ago) / day * WHOLE_TURN - 1)

        return [
            entry(round(max(0.0, reading - shape(0) + shape(ago)), 1), now - timedelta(minutes=ago))
            for ago in range(day, 0, -RACK_STEP_MINUTES)
        ]

    if entity_id in WAVES:
        centre, swing, step = WAVES[entity_id]

        return [
            entry(
                round(centre + swing * math.sin(ago / WAVE_MINUTES * WAVE_CYCLES * WHOLE_TURN), 2),
                now - timedelta(minutes=ago),
            )
            for ago in range(WAVE_MINUTES, 0, -step)
        ]

    return None


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

    @app.get("/api/history/period/{start}")
    async def history(start: str, filter_entity_id: str) -> list[list[dict[str, Any]]]:
        now = clock.now(UTC)
        network = network_history(filter_entity_id, datetime.fromisoformat(start), now)
        if network is not None:
            return [network]

        current = TRAVEL_TIMES.get(filter_entity_id)
        if current is None:
            return []

        readings = [*TRAVEL_HISTORY.get(filter_entity_id, []), (LATEST_READING_MINUTES_AGO, current[0])]

        return [
            [
                {"state": str(minutes), "last_changed": (now - timedelta(minutes=ago)).isoformat()}
                for ago, minutes in readings
            ]
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
