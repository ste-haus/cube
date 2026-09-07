from fastapi.testclient import TestClient

from cube.app import create_app

FORBIDDEN = 403
NOT_FOUND = 404
OK = 200

UNCONTROLLABLE_ENTITY = "sensor.example_bin"
UNKNOWN_CAMERA = "camera.not_configured"
OVERRIDE_CSS = ".floorplan__canvas #counter { fill: #555555; }"

TRAVERSAL_CONFIG = """
floorplans:
  downstairs:
    image: ../../secret
"""


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


def test_floorplan_is_served_from_the_resources_directory(settings):
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/floorplan/downstairs")

    assert response.status_code == OK
    assert response.headers["content-type"].startswith("image/svg+xml")
    assert b"light.example_kitchen" in response.content


def test_configured_floorplan_without_a_drawing_is_not_found(settings):
    """`upstairs` is in the sample config but has no SVG in the fixture."""

    with TestClient(create_app(settings)) as client:
        response = client.get("/api/floorplan/upstairs")

    assert response.status_code == NOT_FOUND


def test_floorplan_image_cannot_escape_the_resources_directory(settings, tmp_path):
    """A drawing name is config, not user input, but it still must not address the filesystem."""

    secret = tmp_path.parent / "secret.svg"
    secret.write_text("classified")

    config = tmp_path / "traversal.yaml"
    config.write_text(TRAVERSAL_CONFIG)

    escaping = settings.model_copy(update={"dashboard_path": config})

    with TestClient(create_app(escaping)) as client:
        response = client.get("/api/floorplan/downstairs")

    assert response.status_code == NOT_FOUND


def test_floorplan_overrides_are_empty_when_absent(settings):
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/floorplan-styles.css")

    assert response.status_code == OK
    assert response.text == ""


def test_floorplan_overrides_are_served_when_present(settings, resources):
    (resources / "floorplan.css").write_text(OVERRIDE_CSS)

    with TestClient(create_app(settings)) as client:
        response = client.get("/api/floorplan-styles.css")

    assert response.status_code == OK
    assert OVERRIDE_CSS in response.text


def test_stream_opens_with_a_snapshot(settings):
    with TestClient(create_app(settings)) as client, client.websocket_connect("/api/stream") as socket:
        message = socket.receive_json()

    assert message["type"] == "init"
    assert message["connected"] is False
    assert message["states"] == {}
