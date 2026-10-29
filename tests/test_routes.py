"""A panel can rebuild only a route listed by its configured travel map."""

from unittest.mock import AsyncMock

import pytest
import yaml
from fastapi.testclient import TestClient
from pydantic import ValidationError

from cube.api.routes import REGENERATE_TIMEOUT_SECONDS
from cube.app import create_app
from cube.config import Settings
from cube.dashboard import CUBE_FACES, Dashboard
from cube.hass import protocol
from cube.hass.client import HassError

ROUTES_ENTITY = "binary_sensor.travel_routes_live"
MAP_ENTITY = "camera.travel"
TRIP = "lab_to_home"
OTHER_TRIP = "home_to_lab"
ROUTE = "/api/travel-routes/regenerate"
TOOLS = {"entity_id": ROUTES_ENTITY, "map_entity_id": MAP_ENTITY}
REQUEST = {"entity_id": ROUTES_ENTITY, "trip": TRIP}
# As the client holds it: Home Assistant's compressed keys
LIVE_STATE = {protocol.STATE: "on", protocol.ATTRIBUTES: {"trips": [TRIP]}}
OK = 200
FORBIDDEN = 403
BAD_GATEWAY = 502


def config(tools=TOOLS):
    faces = {face: {"content": "blank"} for face in CUBE_FACES}
    faces["back"] = {
        "content": "departure",
        "options": {
            "map": MAP_ENTITY,
            "travel_times": [{"entity_id": "sensor.travel_time", "name": "Commute"}],
            "route_tools": tools,
        },
    }
    return {"profiles": {"default": {"faces": faces}}}


def configured(settings, tmp_path, tools=TOOLS):
    path = tmp_path / "dashboard.yaml"
    path.write_text(yaml.safe_dump(config(tools)))
    return Settings(**(settings.model_dump() | {"dashboard_path": path}))


def test_route_tools_subscribe_their_metadata():
    assert ROUTES_ENTITY in Dashboard.model_validate(config()).allowed_entities


def test_route_tools_must_belong_to_a_configured_map():
    with pytest.raises(ValidationError, match="Route tools must name"):
        Dashboard.model_validate(config(TOOLS | {"map_entity_id": "camera.other"}))


def test_a_displayed_route_calls_the_fixed_response_service(settings, tmp_path):
    with TestClient(create_app(configured(settings, tmp_path))) as client:
        upstream = client.app.state.hub.client
        upstream.states[ROUTES_ENTITY] = LIVE_STATE
        upstream.query_service = AsyncMock(return_value={"ok": True, "trip": TRIP, "next_poll_minutes": 4})
        response = client.post(ROUTE, json=REQUEST)
        assert response.status_code == OK
        assert response.json()["next_poll_minutes"] == 4
        upstream.query_service.assert_awaited_once_with(
            "pyscript",
            "traffic_base_regenerate",
            None,
            {"trip": TRIP},
            timeout_seconds=REGENERATE_TIMEOUT_SECONDS,
        )


@pytest.mark.parametrize(
    ("tools", "entity", "payload"),
    [
        (None, LIVE_STATE, REQUEST),
        (TOOLS, LIVE_STATE, REQUEST | {"trip": OTHER_TRIP}),
        (TOOLS, {protocol.STATE: "off", protocol.ATTRIBUTES: {"trips": [TRIP]}}, REQUEST),
        (TOOLS, LIVE_STATE, REQUEST | {"entity_id": "binary_sensor.other"}),
    ],
)
def test_unconfigured_or_inactive_routes_cannot_be_rebuilt(settings, tmp_path, tools, entity, payload):
    with TestClient(create_app(configured(settings, tmp_path, tools))) as client:
        upstream = client.app.state.hub.client
        upstream.states[ROUTES_ENTITY] = entity
        upstream.query_service = AsyncMock()
        assert client.post(ROUTE, json=payload).status_code == FORBIDDEN
        upstream.query_service.assert_not_called()


@pytest.mark.parametrize("error", [HassError("Unavailable"), TimeoutError()])
def test_upstream_failures_are_reported(settings, tmp_path, error):
    with TestClient(create_app(configured(settings, tmp_path))) as client:
        upstream = client.app.state.hub.client
        upstream.states[ROUTES_ENTITY] = LIVE_STATE
        upstream.query_service = AsyncMock(side_effect=error)
        assert client.post(ROUTE, json=REQUEST).status_code == BAD_GATEWAY


def test_a_failed_rebuild_is_not_reported_as_success(settings, tmp_path):
    with TestClient(create_app(configured(settings, tmp_path))) as client:
        upstream = client.app.state.hub.client
        upstream.states[ROUTES_ENTITY] = LIVE_STATE
        upstream.query_service = AsyncMock(return_value={"ok": False, "error": "Old base kept"})
        response = client.post(ROUTE, json=REQUEST)
        assert response.status_code == BAD_GATEWAY
        assert response.json()["detail"] == "Old base kept"


def test_a_failure_home_assistant_does_not_explain_leaves_the_words_to_the_panel(settings, tmp_path):
    with TestClient(create_app(configured(settings, tmp_path))) as client:
        upstream = client.app.state.hub.client
        upstream.states[ROUTES_ENTITY] = LIVE_STATE
        upstream.query_service = AsyncMock(return_value={})
        response = client.post(ROUTE, json=REQUEST)
        assert response.status_code == BAD_GATEWAY
        assert response.json()["detail"] == ""
