from pathlib import Path

from fastapi.testclient import TestClient

from cube.app import create_app
from cube.config import Settings

NO_CONTENT = 204
NOT_FOUND = 404
UNPROCESSABLE = 422

CLEAR_ROUTE = "/api/mcw/clear"
WARNING = "warning"
UNKNOWN_TIER = "advisory"
SAMPLE_CLEAR_EVENT = "MCW_CLEAR"

WITHOUT_MCW_CONFIG = """
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


def test_clearing_fires_the_configured_event_for_the_tier(settings):
    calls: list[tuple] = []

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.call_service = recording(calls)

        response = client.post(CLEAR_ROUTE, json={"tier": WARNING})

    assert response.status_code == NO_CONTENT
    assert calls == [
        ("pyscript", "fire_event", None, {"event_type": SAMPLE_CLEAR_EVENT, "event_data": {"tier": WARNING}})
    ]


def test_a_tier_without_a_master_is_refused(settings):
    calls: list[tuple] = []

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.call_service = recording(calls)

        response = client.post(CLEAR_ROUTE, json={"tier": UNKNOWN_TIER})

    assert response.status_code == UNPROCESSABLE
    assert calls == []


def test_the_panel_cannot_name_the_event(settings):
    """Anything past the tier is ignored, so the route fires this one event and no other."""

    calls: list[tuple] = []

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.call_service = recording(calls)

        client.post(CLEAR_ROUTE, json={"tier": WARNING, "event_type": "SOMETHING_ELSE"})

    assert calls[0][-1]["event_type"] == SAMPLE_CLEAR_EVENT


def test_clearing_is_not_found_without_the_block(settings, tmp_path: Path):
    config = tmp_path / "config.yaml"
    config.write_text(WITHOUT_MCW_CONFIG)
    bare = Settings(**(settings.model_dump() | {"dashboard_path": config}))

    with TestClient(create_app(bare)) as client:
        response = client.post(CLEAR_ROUTE, json={"tier": WARNING})

    assert response.status_code == NOT_FOUND
