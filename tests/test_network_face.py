import re
from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from cube.dashboard import (
    CUBE_FACES,
    DEFAULT_FAN_MAX,
    DEFAULT_HEARTBEAT_SECONDS,
    DEFAULT_LATENCY_BUSY_MS,
    DEFAULT_LATENCY_FULL_MS,
    DEFAULT_MEDIA_TITLE,
    DEFAULT_WAN_HISTORY_MINUTES,
    MAX_WAN_HISTORY_MINUTES,
    Dashboard,
)

PANELS_DOC = Path("docs/panels.md")
NETWORK_SECTION = "### The network face"
YAML_BLOCK = re.compile(r"```yaml\n(.*?)```", re.DOTALL)

RESOLVER = "binary_sensor.resolver_connection"
RESOLVER_LATENCY = "sensor.resolver_round_trip"
ROUTER = "binary_sensor.router_connection"
NAS = "binary_sensor.nas_connection"
NAS_LATENCY = "sensor.nas_round_trip"
DEMARC_NAME = "sensor.public_ip"
WAN = "binary_sensor.wan_status"
WAN_DOWN = "sensor.wan_download"
WAN_UP = "sensor.wan_upload"
NAS_METRICS = "sensor.nas_metrics"
UPS = "sensor.ups"
HEARTBEAT = "sensor.server_heartbeat"
SERVER_STATUS = "sensor.server_status"
VIPS = "sensor.vips"
WIFI = "sensor.wifi_clients"
STATE_CHANGES = "sensor.state_changes"
RACK = "sensor.rack_temperature"
RACK_TOP = "sensor.rack_top_temperature"
RACK_FAN = "sensor.rack_fan_speed"
SESSIONS = "sensor.media_sessions"
NTP_OFFSET = "sensor.ntp_offset"


def network_face(**options) -> dict:
    complete = {face: {"content": "blank", "label": face} for face in CUBE_FACES}
    complete["down"] = {"content": "network", "options": options}

    return {
        "floorplans": {"downstairs": {"image": "downstairs"}},
        "profiles": {"default": {"floorplan": "downstairs", "faces": complete}},
    }


def options_of(dashboard: Dashboard) -> dict:
    return dashboard.profiles["default"].faces["down"].options


def everything() -> Dashboard:
    return Dashboard.model_validate(
        network_face(
            map={
                "upstream": [{"name": "Resolver", "entity_id": RESOLVER, "latency_entity_id": RESOLVER_LATENCY}],
                "line": [
                    {"name": "Demarc", "name_entity_id": DEMARC_NAME, "entity_id": WAN},
                    {
                        "name": "Router",
                        "entity_id": ROUTER,
                        "branches": [{"name": "nas", "entity_id": NAS, "latency_entity_id": NAS_LATENCY}],
                    },
                ],
            },
            wan={"entity_id": WAN, "download_entity_id": WAN_DOWN, "upload_entity_id": WAN_UP},
            hosts=[
                {"name": "nas", "connection_entity_id": NAS, "metrics_entity_id": NAS_METRICS, "ups_entity_id": UPS},
                {"name": "server", "heartbeat_entity_id": HEARTBEAT},
            ],
            containers=[{"name": "server", "entity_id": SERVER_STATUS}],
            vips=[{"name": "DNS", "entity_id": VIPS, "attribute": "dns"}],
            stats={"title": "Vitals", "rows": [{"label": "Wi-Fi", "entity_id": WIFI}]},
            bus={"title": "Bus", "rows": [{"label": "Changes", "entity_id": STATE_CHANGES}]},
            rack={"title": "Rack", "entity_id": RACK, "upper_entity_id": RACK_TOP, "fan_entity_id": RACK_FAN},
            media={"entity_id": SESSIONS},
            clock={"ntp_entity_id": NTP_OFFSET},
        )
    )


READ = {
    RESOLVER,
    RESOLVER_LATENCY,
    ROUTER,
    NAS,
    NAS_LATENCY,
    DEMARC_NAME,
    WAN,
    WAN_DOWN,
    WAN_UP,
    NAS_METRICS,
    UPS,
    HEARTBEAT,
    SERVER_STATUS,
    VIPS,
    WIFI,
    STATE_CHANGES,
    RACK,
    RACK_TOP,
    RACK_FAN,
    SESSIONS,
    NTP_OFFSET,
}


def test_the_documented_example_loads():
    section = PANELS_DOC.read_text().split(NETWORK_SECTION, 1)[1]
    example = yaml.safe_load(YAML_BLOCK.search(section).group(1))

    Dashboard.model_validate(network_face(**example["faces"]["down"]["options"]))


def test_everything_a_network_face_reads_is_subscribed_down_to_a_branchs_branches():
    assert READ <= everything().allowed_entities


def test_a_network_face_controls_nothing():
    dashboard = everything()

    for entity_id in READ:
        assert not dashboard.may_toggle(entity_id)
        assert not dashboard.may_set(entity_id)


def test_a_network_face_with_no_options_draws_nothing_and_loads():
    options = options_of(Dashboard.model_validate(network_face()))

    assert options["map"] is None
    assert options["hosts"] == []


def test_the_defaults_are_as_documented():
    options = options_of(everything())

    assert options["wan"]["history_minutes"] == DEFAULT_WAN_HISTORY_MINUTES
    assert options["wan"]["latency_busy_ms"] == DEFAULT_LATENCY_BUSY_MS
    assert options["wan"]["latency_full_ms"] == DEFAULT_LATENCY_FULL_MS
    assert options["hosts"][1]["heartbeat_seconds"] == DEFAULT_HEARTBEAT_SECONDS
    assert options["rack"]["fan_max"] == DEFAULT_FAN_MAX
    assert options["media"]["title"] == DEFAULT_MEDIA_TITLE


def test_a_map_needs_a_line():
    with pytest.raises(ValidationError):
        Dashboard.model_validate(network_face(map={"upstream": [{"name": "Resolver"}], "line": []}))


def test_a_host_needs_a_name_or_an_entity_to_take_one_from():
    with pytest.raises(ValidationError):
        Dashboard.model_validate(network_face(hosts=[{"connection_entity_id": NAS}]))

    Dashboard.model_validate(network_face(hosts=[{"name_entity_id": "sensor.server_name"}]))


def test_a_racks_warning_cannot_come_before_its_caution():
    with pytest.raises(ValidationError):
        Dashboard.model_validate(
            network_face(rack={"title": "Rack", "entity_id": RACK, "caution_above": 90, "warning_above": 80})
        )


def test_the_way_outs_history_runs_no_further_back_than_the_proxy_gives():
    with pytest.raises(ValidationError):
        Dashboard.model_validate(network_face(wan={"entity_id": WAN, "history_minutes": MAX_WAN_HISTORY_MINUTES + 1}))


def test_a_card_of_readings_needs_a_reading():
    with pytest.raises(ValidationError):
        Dashboard.model_validate(network_face(stats={"title": "Vitals", "rows": []}))
