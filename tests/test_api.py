from fastapi.testclient import TestClient

from cube.app import create_app

FORBIDDEN = 403
NOT_FOUND = 404
OK = 200

UNCONTROLLABLE_ENTITY = "sensor.example_bin"
UNKNOWN_CAMERA = "camera.not_configured"


def test_config_exposes_the_dashboard_without_leaking_the_token(settings):
    with TestClient(create_app(settings)) as client:
        body = client.get("/api/config").json()

    assert body["profile"]["key"] == settings.profile
    assert body["floorplans"]
    assert body["notices"]
    assert settings.ha_token not in str(body)


def test_config_falls_back_to_the_default_profile(settings):
    with TestClient(create_app(settings)) as client:
        body = client.get("/api/config", params={"profile": "nonexistent"}).json()

    assert body["profile"]["name"]


def test_state_reports_a_disconnected_upstream(settings):
    with TestClient(create_app(settings)) as client:
        body = client.get("/api/state").json()

    assert body["connected"] is False
    assert body["states"] == {}


def test_toggling_a_read_only_entity_is_refused(settings):
    with TestClient(create_app(settings)) as client:
        response = client.post("/api/toggle", json={"entity_id": UNCONTROLLABLE_ENTITY})

    assert response.status_code == FORBIDDEN


def test_unconfigured_camera_is_not_reachable(settings):
    with TestClient(create_app(settings)) as client:
        response = client.get(f"/api/camera/{UNKNOWN_CAMERA}/snapshot")

    assert response.status_code == NOT_FOUND


def test_unknown_floorplan_is_not_reachable(settings):
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/floorplan/basement")

    assert response.status_code == NOT_FOUND


def test_stream_opens_with_a_snapshot(settings):
    with TestClient(create_app(settings)) as client, client.websocket_connect("/api/stream") as socket:
        message = socket.receive_json()

    assert message["type"] == "init"
    assert message["connected"] is False
    assert message["states"] == {}
