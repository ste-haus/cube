from pathlib import Path

from fastapi.testclient import TestClient

from cube.app import create_app
from cube.config import Settings

NO_CONTENT = 204
FORBIDDEN = 403

EVENT_ROUTE = "/api/event"
# `mcw` in the sample config clears with this, and names no event of its own.
SAMPLE_CLEAR_EVENT = "MCW_CLEAR"
LISTED_EVENT = "DOORBELL_SILENCE"
UNLISTED_EVENT = "ZIGBEE_NETWORK_RESET"
WARNING_TIER = {"tier": "warning"}

BARE_CONFIG = """
profiles:
  default:
    faces:
      front: { content: blank }
      back: { content: blank }
      left: { content: blank }
      right: { content: blank }
      up: { content: blank }
      down: { content: blank }
"""


def recording(calls: list[tuple]):
    async def call_service(*arguments):
        calls.append(arguments)

    return call_service


def settings_for(settings: Settings, tmp_path: Path, config: str) -> Settings:
    path = tmp_path / "config.yaml"
    path.write_text(config)

    return Settings(**(settings.model_dump() | {"dashboard_path": path}))


def test_an_allowed_event_is_fired_through_pyscript_with_its_data(settings):
    calls: list[tuple] = []

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.call_service = recording(calls)

        response = client.post(EVENT_ROUTE, json={"event_type": SAMPLE_CLEAR_EVENT, "event_data": WARNING_TIER})

    assert response.status_code == NO_CONTENT
    assert calls == [("pyscript", "fire_event", None, {"event_type": SAMPLE_CLEAR_EVENT, "event_data": WARNING_TIER})]


def test_an_event_with_no_data_is_fired_with_empty_data(settings):
    calls: list[tuple] = []

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.call_service = recording(calls)

        client.post(EVENT_ROUTE, json={"event_type": SAMPLE_CLEAR_EVENT})

    assert calls[0][-1]["event_data"] == {}


def test_an_event_the_config_does_not_allow_is_refused(settings):
    calls: list[tuple] = []

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.call_service = recording(calls)

        response = client.post(EVENT_ROUTE, json={"event_type": UNLISTED_EVENT})

    assert response.status_code == FORBIDDEN
    assert calls == []


def test_an_event_listed_under_events_is_allowed(settings, tmp_path: Path):
    calls: list[tuple] = []
    listed = settings_for(settings, tmp_path, BARE_CONFIG + f"events: [{LISTED_EVENT}]\n")

    with TestClient(create_app(listed)) as client:
        client.app.state.hub.client.call_service = recording(calls)

        response = client.post(EVENT_ROUTE, json={"event_type": LISTED_EVENT})

    assert response.status_code == NO_CONTENT
    assert calls[0][-1]["event_type"] == LISTED_EVENT


def test_the_clear_event_is_only_allowed_while_mcw_is_on(settings, tmp_path: Path):
    bare = settings_for(settings, tmp_path, BARE_CONFIG)

    with TestClient(create_app(bare)) as client:
        response = client.post(EVENT_ROUTE, json={"event_type": SAMPLE_CLEAR_EVENT, "event_data": WARNING_TIER})

    assert response.status_code == FORBIDDEN
