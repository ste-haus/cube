import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient

from cube.app import create_app
from cube.hass import protocol
from cube.hass.rest import MediaMetadata

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

# Matches `profiles.default.media_player` and `visualizer.content_marker` in the sample config.
ANNOUNCEMENT_SPEAKER = "media_player.example_speaker"
UNWATCHED_SPEAKER = "media_player.not_configured"

ANNOUNCEMENT_PATH = "/media/local/sounds/temp/chime_tts/deadbeef.mp3"
ANNOUNCEMENT_URL = f"https://renamed-since.invalid{ANNOUNCEMENT_PATH}?authSig=signed"
MUSIC_PATH = "/media/local/music/something-else.mp3"
MUSIC_URL = f"https://renamed-since.invalid{MUSIC_PATH}"

ANNOUNCEMENT_AUDIO = b"announcement-audio"
AUDIO_CONTENT_TYPE = "audio/mpeg"
CONTENT_TYPE_HEADER = "content-type"
PLAYING = "playing"
IDLE = "idle"

ANNOUNCEMENT_ROUTE = "/api/announcement/{entity_id}/audio"
CONTENT_PARAM = "content"


def announcement_route(entity_id: str) -> str:
    return ANNOUNCEMENT_ROUTE.format(entity_id=entity_id)


def playing(media_content_id: str, state: str = PLAYING) -> dict:
    return {protocol.STATE: state, protocol.ATTRIBUTES: {"media_content_id": media_content_id}}


def relay(requested: list[tuple[str, str | None]]):
    """Stands in for the upstream fetch, recording the address the relay resolved to."""

    async def media_stream(url: str, range_header: str | None = None):
        requested.append((url, range_header))
        yield ANNOUNCEMENT_AUDIO, MediaMetadata(status_code=OK, headers={CONTENT_TYPE_HEADER: AUDIO_CONTENT_TYPE})

    return media_stream


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


def test_announcement_audio_is_relayed_for_a_watched_speaker(settings):
    requested: list[tuple[str, str | None]] = []

    with TestClient(create_app(settings)) as client:
        hub = client.app.state.hub
        hub.client.states[ANNOUNCEMENT_SPEAKER] = playing(ANNOUNCEMENT_URL)
        hub.rest.media_stream = relay(requested)

        response = client.get(
            announcement_route(ANNOUNCEMENT_SPEAKER),
            params={CONTENT_PARAM: ANNOUNCEMENT_PATH},
        )

    assert response.status_code == OK
    assert response.content == ANNOUNCEMENT_AUDIO
    assert response.headers[CONTENT_TYPE_HEADER] == AUDIO_CONTENT_TYPE

    # The signed address is resolved from state, so the panel never has to send it.
    assert requested == [(ANNOUNCEMENT_URL, None)]


def test_announcement_audio_refuses_an_address_the_panel_names(settings):
    """The `content` parameter identifies what is playing; it does not choose what is fetched."""

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.states[ANNOUNCEMENT_SPEAKER] = playing(ANNOUNCEMENT_URL)

        response = client.get(
            announcement_route(ANNOUNCEMENT_SPEAKER),
            params={CONTENT_PARAM: MUSIC_PATH},
        )

    assert response.status_code == NOT_FOUND


def test_announcement_audio_is_not_relayed_for_an_unwatched_speaker(settings):
    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.states[UNWATCHED_SPEAKER] = playing(ANNOUNCEMENT_URL)

        response = client.get(
            announcement_route(UNWATCHED_SPEAKER),
            params={CONTENT_PARAM: ANNOUNCEMENT_PATH},
        )

    assert response.status_code == NOT_FOUND


def test_announcement_audio_is_not_relayed_for_ordinary_playback(settings):
    """The relay is for announcements, not for whatever else the speaker is playing."""

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.states[ANNOUNCEMENT_SPEAKER] = playing(MUSIC_URL)

        response = client.get(announcement_route(ANNOUNCEMENT_SPEAKER), params={CONTENT_PARAM: MUSIC_PATH})

    assert response.status_code == NOT_FOUND


def test_announcement_audio_stops_when_the_speaker_does(settings):
    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.states[ANNOUNCEMENT_SPEAKER] = playing(ANNOUNCEMENT_URL, state=IDLE)

        response = client.get(
            announcement_route(ANNOUNCEMENT_SPEAKER),
            params={CONTENT_PARAM: ANNOUNCEMENT_PATH},
        )

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


def test_only_so_many_panels_are_accepted(settings):
    """Each stream costs a queue and two tasks, so the count is capped."""

    capped = settings.model_copy(update={"max_panels": 1})

    with (
        TestClient(create_app(capped)) as client,
        client.websocket_connect("/api/stream"),
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect("/api/stream") as second,
    ):
        second.receive_json()


def test_a_panel_can_connect_again_once_one_leaves(settings):
    capped = settings.model_copy(update={"max_panels": 1})
    app = create_app(capped)

    with TestClient(app) as client:
        with client.websocket_connect("/api/stream") as first:
            first.receive_json()

        with client.websocket_connect("/api/stream") as second:
            assert second.receive_json()["type"] == "init"


def test_stream_opens_with_a_snapshot(settings):
    with TestClient(create_app(settings)) as client, client.websocket_connect("/api/stream") as socket:
        message = socket.receive_json()

    assert message["type"] == "init"
    assert message["connected"] is False
    assert message["states"] == {}
