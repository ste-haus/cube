from pathlib import Path

import httpx
import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient

from cube.app import NONCE_PARAMETER, create_app
from cube.dashboard import CUBE_FACES, DEFAULT_PROFILE_KEY
from cube.hass import protocol
from cube.hass.rest import MediaMetadata

SAMPLE_CONFIG = Path("config.yaml.dist")

FORBIDDEN = 403
NOT_FOUND = 404
OK = 200

UNCONTROLLABLE_ENTITY = "sensor.example_bin"
UNKNOWN_CAMERA = "camera.not_configured"
# Matches `profiles.example-guest.faces.front.options` in the sample config.
SAMPLE_GUEST_LIGHT = "light.example_guest_room"
SAMPLE_GUEST_BLINDS = "cover.example_guest_blinds"
SAMPLE_GUEST_FAN = "switch.example_guest_fan"
SAMPLE_ALARM_TIME = "input_datetime.example_guest_alarm"
# Matches a tile of `profiles.example-cameras.faces.left` in the sample config, which no
# `camera:` block names.
FACE_CAMERA = "camera.example_back_yard"
CAMERA_FRAME = b"frame"
JPEG_CONTENT_TYPE = "image/jpeg"
OVERRIDE_CSS = ".floorplan__canvas #counter { fill: #555555; }"

# A complete `default` is required of every config, including the ones a test writes to probe
# something else.
TRAVERSAL_CONFIG = """
floorplans:
  downstairs:
    image: ../../secret

profiles:
  default:
    faces:
      front:
        content: dashboard
      back:
        content: blank
      left:
        content: blank
      right:
        content: blank
      up:
        content: blank
      down:
        content: blank
"""

# Matches `profiles.example` and `visualizer.content_marker` in the sample config.
SAMPLE_PANEL_PROFILE = "example"
# Matches the custom face the `resources` fixture writes.
SAMPLE_FACE_PAGE = "bedroom"
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


def test_config_serves_the_profile_a_panel_asks_for(settings):
    with TestClient(create_app(settings)) as client:
        body = client.get("/api/config", params={"profile": SAMPLE_PANEL_PROFILE}).json()

    profile = body["profile"]

    assert profile["key"] == SAMPLE_PANEL_PROFILE
    assert profile["media_player"] == ANNOUNCEMENT_SPEAKER
    assert sorted(profile["faces"]) == sorted(CUBE_FACES)


def test_an_unknown_profile_gets_the_template_and_no_speaker(settings):
    """The fallback must not impersonate a room: a generic panel is a visible mistake."""

    with TestClient(create_app(settings)) as client:
        body = client.get("/api/config", params={"profile": "nonexistent"}).json()

    profile = body["profile"]

    assert profile["key"] == DEFAULT_PROFILE_KEY
    assert profile["media_player"] is None
    assert profile["name"]


def test_a_custom_face_is_served_from_the_resources_directory(settings):
    with TestClient(create_app(settings)) as client:
        response = client.get(f"/faces/{SAMPLE_FACE_PAGE}/")

    assert response.status_code == OK
    assert SAMPLE_FACE_PAGE in response.text
    # Stamped like every other document, or a panel would hold the first one it was given.
    assert f"face.css?{NONCE_PARAMETER}=" in response.text


def test_an_unknown_face_is_not_served(settings):
    with TestClient(create_app(settings)) as client:
        response = client.get("/faces/not-a-face/")

    assert response.status_code == NOT_FOUND


def test_a_face_name_cannot_escape_the_resources_directory(settings, resources):
    secret = resources.parent / "secret" / "index.html"
    secret.parent.mkdir(parents=True, exist_ok=True)
    secret.write_text("classified")

    with TestClient(create_app(settings)) as client:
        response = client.get("/faces/..%2Fsecret/")

    assert response.status_code == NOT_FOUND
    assert "classified" not in response.text


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


def test_a_camera_only_a_face_names_is_reachable(settings):
    """A camera face is the other way a camera reaches a panel, and the only way for most."""

    async def snapshot(entity_id: str):
        return CAMERA_FRAME, JPEG_CONTENT_TYPE

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.rest.camera_snapshot = snapshot

        response = client.get(f"/api/camera/{FACE_CAMERA}/snapshot")

    assert response.status_code == OK
    assert response.content == CAMERA_FRAME


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


DEMO_CLIP = "sounds/demo.wav"
DEMO_AUDIO = b"demo-audio"
DEMO_CLIP_ROUTE = "/api/visualizer/demo-clip"
DEMO_SWITCH_LINE = "  demo: false\n"


def demo_settings(settings, tmp_path, demo: bool):
    """The sample config with the visualizer demo switched as asked, pointing at a clip."""

    config = tmp_path / "demo.yaml"
    config.write_text(
        SAMPLE_CONFIG.read_text().replace(
            DEMO_SWITCH_LINE,
            f"  demo: {str(demo).lower()}\n  demo_clip: {DEMO_CLIP}\n",
        ),
    )

    return settings.model_copy(update={"dashboard_path": config})


def test_the_demo_clip_is_served_while_the_demo_is_on(settings, resources, tmp_path):
    (resources / "sounds").mkdir()
    (resources / DEMO_CLIP).write_bytes(DEMO_AUDIO)

    with TestClient(create_app(demo_settings(settings, tmp_path, demo=True))) as client:
        response = client.get(DEMO_CLIP_ROUTE)

    assert response.status_code == OK
    assert response.content == DEMO_AUDIO


def test_the_demo_clip_is_not_served_while_the_demo_is_off(settings, resources, tmp_path):
    (resources / "sounds").mkdir()
    (resources / DEMO_CLIP).write_bytes(DEMO_AUDIO)

    with TestClient(create_app(demo_settings(settings, tmp_path, demo=False))) as client:
        response = client.get(DEMO_CLIP_ROUTE)

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


SET_ROUTE = "/api/set"
NO_CONTENT = 204
UNPROCESSABLE = 422


def recording_calls(calls: list[tuple]):
    async def call_service(*arguments):
        calls.append(arguments)

    return call_service


@pytest.mark.parametrize(
    ("entity_id", "value", "expected"),
    [
        (SAMPLE_GUEST_LIGHT, 40, ("light", "turn_on", SAMPLE_GUEST_LIGHT, {"brightness_pct": 40})),
        (SAMPLE_GUEST_BLINDS, 75, ("cover", "set_cover_position", SAMPLE_GUEST_BLINDS, {"position": 75})),
        (SAMPLE_ALARM_TIME, "06:45", ("input_datetime", "set_datetime", SAMPLE_ALARM_TIME, {"time": "06:45"})),
        (
            SAMPLE_GUEST_LIGHT,
            {"hue": 210, "saturation": 100},
            ("light", "turn_on", SAMPLE_GUEST_LIGHT, {"hs_color": [210, 100]}),
        ),
        (
            SAMPLE_GUEST_LIGHT,
            {"x": 0.469, "y": 0.403},
            ("light", "turn_on", SAMPLE_GUEST_LIGHT, {"xy_color": [0.469, 0.403]}),
        ),
    ],
)
def test_a_control_is_set_through_its_domains_service(settings, entity_id, value, expected):
    calls: list[tuple] = []

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.call_service = recording_calls(calls)

        response = client.post(SET_ROUTE, json={"entity_id": entity_id, "value": value})

    assert response.status_code == NO_CONTENT
    assert calls == [expected]


@pytest.mark.parametrize(
    ("entity_id", "value"),
    [
        (SAMPLE_GUEST_LIGHT, 101),
        (SAMPLE_GUEST_BLINDS, "half"),
        (SAMPLE_ALARM_TIME, "25:00"),
        (SAMPLE_ALARM_TIME, 7),
        # A colour for something that has none.
        (SAMPLE_GUEST_BLINDS, {"hue": 210, "saturation": 100}),
    ],
)
def test_a_value_the_control_cannot_take_is_refused(settings, entity_id, value):
    calls: list[tuple] = []

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.call_service = recording_calls(calls)

        response = client.post(SET_ROUTE, json={"entity_id": entity_id, "value": value})

    assert response.status_code == UNPROCESSABLE
    assert calls == []


def test_setting_an_entity_that_is_only_shown_is_refused(settings):
    calls: list[tuple] = []

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.call_service = recording_calls(calls)

        response = client.post(SET_ROUTE, json={"entity_id": UNCONTROLLABLE_ENTITY, "value": 50})

    assert response.status_code == FORBIDDEN
    assert calls == []


def test_a_guest_faces_switch_may_be_toggled(settings):
    calls: list[tuple] = []

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.call_service = recording_calls(calls)

        response = client.post("/api/toggle", json={"entity_id": SAMPLE_GUEST_FAN})

    assert response.status_code == NO_CONTENT
    assert calls == [("homeassistant", "toggle", SAMPLE_GUEST_FAN, None)]


@pytest.mark.parametrize("colour", [{"hue": 361, "saturation": 100}, {"hue": 10, "saturation": 101}, {"hue": 10}])
def test_a_colour_off_the_wheel_is_refused(settings, colour):
    calls: list[tuple] = []

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.call_service = recording_calls(calls)

        response = client.post(SET_ROUTE, json={"entity_id": SAMPLE_GUEST_LIGHT, "value": colour})

    assert response.status_code == UNPROCESSABLE
    assert calls == []


# Matches the first route of `profiles.default.faces.back.options.travel_times` in the sample config.
SAMPLE_TRAVEL_TIME = "sensor.example_travel_time_alice"
TRAVEL_HISTORY = [
    {"entity_id": SAMPLE_TRAVEL_TIME, "state": "31", "last_changed": "2026-10-01T22:31:00+00:00"},
    {"state": "34", "last_changed": "2026-10-01T22:41:00+00:00"},
]
UPSTREAM_FAILED = 502
UNPROCESSABLE = 422


def test_a_dashboard_entitys_history_is_relayed_bare(settings):
    asked: list[str] = []

    async def history(entity_id: str, start):
        asked.append(entity_id)
        return TRAVEL_HISTORY

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.rest.history = history

        response = client.get(f"/api/history/{SAMPLE_TRAVEL_TIME}")

    assert response.status_code == OK
    assert asked == [SAMPLE_TRAVEL_TIME]
    assert response.json() == {
        "states": [{"state": entry["state"], "last_changed": entry["last_changed"]} for entry in TRAVEL_HISTORY]
    }


def test_history_reaches_no_further_than_the_dashboard(settings):
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/history/sensor.not_on_the_dashboard")

    assert response.status_code == NOT_FOUND


@pytest.mark.parametrize("hours", [0, 25])
def test_history_looks_back_a_bounded_while(settings, hours):
    with TestClient(create_app(settings)) as client:
        response = client.get(f"/api/history/{SAMPLE_TRAVEL_TIME}", params={"hours": hours})

    assert response.status_code == UNPROCESSABLE


def test_history_home_assistant_cannot_give_is_an_upstream_failure(settings):
    async def history(entity_id: str, start):
        raise httpx.ConnectError("down")

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.rest.history = history

        response = client.get(f"/api/history/{SAMPLE_TRAVEL_TIME}")

    assert response.status_code == UPSTREAM_FAILED
