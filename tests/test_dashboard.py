from pathlib import Path

import pytest
from pydantic import ValidationError

from cube.dashboard import (
    CUBE_FACES,
    DEFAULT_FORECAST_DAYS,
    DEFAULT_PROFILE_KEY,
    DEFAULT_WIND_GUST_THRESHOLD,
    RAINVIEWER_MAX_ZOOM,
    Camera,
    Dashboard,
    ThresholdBand,
    ThresholdScale,
    drop_missing_custom_faces,
    load_dashboard,
)

SAMPLE_CONFIG = Path("config.yaml.dist")

LOW_COLOR = "#999999"
MID_COLOR = "#11fcf7"
HIGH_COLOR = "#ff0000"

SPEAKER = "media_player.a_speaker"


@pytest.fixture
def dashboard():
    return load_dashboard(SAMPLE_CONFIG)


def test_sample_config_loads(dashboard):
    assert dashboard.profiles
    assert dashboard.floorplans
    assert dashboard.allowed_entities


def test_allowlist_covers_every_referenced_entity(dashboard):
    allowed = dashboard.allowed_entities

    for floorplan in dashboard.floorplans.values():
        assert set(floorplan.entity_ids) <= allowed

    for notice in dashboard.notices:
        assert notice.entity_id in allowed

    assert dashboard.camera.entity_id in allowed
    assert dashboard.transcript.entity_id in allowed


def test_only_controls_are_toggleable(dashboard):
    downstairs = dashboard.floorplans["downstairs"]

    for entity_id in downstairs.groups["lights"]:
        assert dashboard.may_toggle(entity_id)

    for entity_id in downstairs.groups["motion"]:
        assert not dashboard.may_toggle(entity_id)

    for entity_id in downstairs.groups["bins"]:
        assert not dashboard.may_toggle(entity_id)


def test_unknown_entity_is_never_toggleable(dashboard):
    assert not dashboard.may_toggle("light.not_in_the_config")


TURNING_POINT = "turning_point"


def test_an_extreme_may_name_a_turning_point():
    weather = {
        "entity_id": "weather.home",
        "high": {"entity_id": "sensor.high", "turning_point_attribute": TURNING_POINT},
        "low": {"entity_id": "sensor.low"},
    }
    dashboard = Dashboard.model_validate(profiles() | {"weather": weather})

    assert dashboard.weather.high.turning_point_attribute == TURNING_POINT
    assert dashboard.weather.low.turning_point_attribute is None
    assert "sensor.high" in dashboard.allowed_entities


def test_the_sample_config_reads_its_extremes_as_turning_points(dashboard):
    assert dashboard.weather.high.turning_point_attribute == TURNING_POINT
    assert dashboard.weather.low.turning_point_attribute == TURNING_POINT


def test_threshold_scale_picks_the_highest_matching_band():
    scale = ThresholdScale(
        default_color=LOW_COLOR,
        bands=[ThresholdBand(at=10, color=MID_COLOR), ThresholdBand(at=100, color=HIGH_COLOR)],
    )

    assert scale.color_for(0) == LOW_COLOR
    assert scale.color_for(10) == MID_COLOR
    assert scale.color_for(99) == MID_COLOR
    assert scale.color_for(100) == HIGH_COLOR


def profiles(**overrides: dict) -> dict:
    """A dashboard document with a complete `default` and whatever else a case needs."""

    complete = {face: {"content": "blank", "label": face} for face in CUBE_FACES}

    return {
        "floorplans": {level: {"image": level} for level in ("downstairs", "upstairs")},
        "profiles": {"default": {"floorplan": "downstairs", "faces": complete}, **overrides},
    }


def test_a_profile_inherits_every_face_it_does_not_name():
    dashboard = Dashboard.model_validate(profiles(lr={"media_player": SPEAKER}))

    assert sorted(dashboard.profiles["lr"].faces) == sorted(CUBE_FACES)
    assert dashboard.profiles["lr"].media_player == SPEAKER


def test_naming_a_face_replaces_it_and_leaves_its_siblings():
    dashboard = Dashboard.model_validate(profiles(pb={"faces": {"front": {"content": "dashboard"}}}))
    faces = dashboard.profiles["pb"].faces

    assert faces["front"].content == "dashboard"
    assert faces["front"].label == ""
    assert faces["back"].label == "back"


def test_inheritance_chains_through_a_named_parent():
    dashboard = Dashboard.model_validate(
        profiles(
            pb={"floorplan": "upstairs", "faces": {"front": {"content": "dashboard"}}},
            ob={"inherits": "pb", "media_player": SPEAKER},
        )
    )
    office = dashboard.profiles["ob"]

    assert office.floorplan == "upstairs"
    assert office.faces["front"].content == "dashboard"
    assert office.media_player == SPEAKER


def test_a_speaker_never_crosses_an_inheritance_edge():
    dashboard = Dashboard.model_validate(
        profiles(pb={"media_player": SPEAKER}, ob={"inherits": "pb"}),
    )

    assert dashboard.profiles["pb"].media_player == SPEAKER
    assert dashboard.profiles["ob"].media_player is None


WEATHER = {"entity_id": "weather.home", "zone_entity_id": "zone.home"}
WEATHER_FACE = {"faces": {"up": {"content": "weather"}}}
COLD_STOP = {"at": 30, "color": "#0000ff"}
HOT_STOP = {"at": 90, "color": "#ff0000"}


def test_a_weather_face_needs_a_weather_block_to_draw():
    with pytest.raises(ValidationError, match="no `weather` block"):
        Dashboard.model_validate(profiles(pb=WEATHER_FACE))


def test_a_weather_face_loads_once_there_is_weather():
    dashboard = Dashboard.model_validate(profiles(pb=WEATHER_FACE) | {"weather": WEATHER})

    assert dashboard.profiles["pb"].faces["up"].content == "weather"


def test_the_zone_placing_the_sky_is_subscribed():
    dashboard = Dashboard.model_validate(profiles() | {"weather": WEATHER})

    assert WEATHER["zone_entity_id"] in dashboard.allowed_entities


def test_the_temperature_gradient_is_read_coldest_first():
    weather = WEATHER | {"temperature_gradient": [HOT_STOP, COLD_STOP]}
    dashboard = Dashboard.model_validate(profiles() | {"weather": weather})

    assert [stop.at for stop in dashboard.weather.temperature_gradient] == [COLD_STOP["at"], HOT_STOP["at"]]


PRIMARY = "#f205f2"
SECONDARY = "#00bfff"
CUSTOM_PRIMARY = "#123456"


def test_a_colour_may_name_the_palette():
    document = profiles() | {
        "agenda": {"calendars": [{"entity_id": "calendar.a", "name": "A", "color": "primary"}]},
        "fuel": {"scale": {"default_color": "secondary", "bands": [{"at": 33, "color": "primary"}]}},
    }
    dashboard = Dashboard.model_validate(document)

    assert dashboard.agenda.calendars[0].color == PRIMARY
    assert dashboard.fuel.scale.default_color == SECONDARY
    assert dashboard.fuel.scale.bands[0].color == PRIMARY


def test_a_state_colour_may_name_the_palette():
    document = profiles() | {
        "status_indicators": [
            {
                "entity_id": "sensor.a",
                "icon": "mdi:alert",
                "nominal_state": "Safe",
                "state_colors": {"Unsafe": "primary"},
            }
        ]
    }

    assert Dashboard.model_validate(document).status_indicators[0].state_colors == {"Unsafe": PRIMARY}


def test_only_colour_settings_are_read_as_palette_names():
    document = profiles() | {
        "agenda": {"calendars": [{"entity_id": "calendar.a", "name": "primary", "color": "#ffffff"}]}
    }

    assert Dashboard.model_validate(document).agenda.calendars[0].name == "primary"


def test_the_palette_is_the_installations_to_change():
    document = profiles() | {
        "colors": {"primary": CUSTOM_PRIMARY},
        "agenda": {"calendars": [{"entity_id": "calendar.a", "name": "A", "color": "primary"}]},
    }
    dashboard = Dashboard.model_validate(document)

    assert dashboard.colors.primary == CUSTOM_PRIMARY
    assert dashboard.colors.secondary == SECONDARY
    assert dashboard.agenda.calendars[0].color == CUSTOM_PRIMARY


DUSK = {
    "day": "#7a8fa0",
    "night": "#2e2a45",
    "twilight": "#a0706b",
    "sun": "#d0a46c",
    "sun_below": "#6d5a50",
}


def test_the_sky_colours_need_not_be_written_down():
    colors = Dashboard.model_validate(profiles()).colors

    assert {name: getattr(colors, name) for name in DUSK} == DUSK


def test_a_colour_may_name_a_sky_colour():
    document = profiles() | {"fuel": {"scale": {"default_color": "night", "bands": [{"at": 15, "color": "twilight"}]}}}
    dashboard = Dashboard.model_validate(document)

    assert dashboard.fuel.scale.default_color == DUSK["night"]
    assert dashboard.fuel.scale.bands[0].color == DUSK["twilight"]


def test_the_sample_config_speaks_only_in_colours_once_loaded(dashboard):
    for calendar in dashboard.agenda.calendars:
        assert calendar.color.startswith("#")

    for band in dashboard.fuel.scale.bands:
        assert band.color.startswith("#")


SATELLITE = "camera.satellite"
WIND = {"url": "https://frames.example/wind.html", "title": "Wind"}


def weather_face(*tiles) -> dict:
    return {"faces": {"up": {"content": "weather", "options": {"tiles": list(tiles)}}}}


def weather_tiles(dashboard: Dashboard) -> list[dict]:
    return dashboard.profiles["pb"].faces["up"].options["tiles"]


def test_weather_tiles_read_an_entity_id_as_a_camera_a_url_as_a_frame_and_radar_as_a_radar():
    dashboard = Dashboard.model_validate(
        profiles(pb=weather_face(SATELLITE, WIND, {"radar": None})) | {"weather": WEATHER}
    )
    camera, frame, radar = weather_tiles(dashboard)

    assert camera["entity_id"] == SATELLITE
    assert frame["url"] == WIND["url"]
    assert radar["radar"]["zoom"] == RAINVIEWER_MAX_ZOOM


def test_a_radar_goes_no_closer_than_rainviewer_serves():
    with pytest.raises(ValidationError, match="less than or equal to"):
        Dashboard.model_validate(
            profiles(pb=weather_face({"radar": {"zoom": RAINVIEWER_MAX_ZOOM + 1}})) | {"weather": WEATHER}
        )


def test_a_radar_needs_a_zone_to_centre_on():
    weather = {"entity_id": WEATHER["entity_id"]}

    with pytest.raises(ValidationError, match="no `weather.zone_entity_id`"):
        Dashboard.model_validate(profiles(pb=weather_face({"radar": None})) | {"weather": weather})


def test_a_camera_among_the_weather_tiles_is_reachable_and_subscribed():
    dashboard = Dashboard.model_validate(profiles(pb=weather_face(SATELLITE)) | {"weather": WEATHER})

    assert SATELLITE in dashboard.camera_entities
    assert SATELLITE in dashboard.allowed_entities


def test_a_frame_takes_no_touches_unless_it_says_so():
    dashboard = Dashboard.model_validate(profiles(pb=weather_face(WIND)) | {"weather": WEATHER})

    assert weather_tiles(dashboard)[0]["interactive"] is False


def test_a_frame_must_be_a_web_address():
    with pytest.raises(ValidationError, match="not an http or https address"):
        Dashboard.model_validate(profiles(pb=weather_face({"url": "javascript:alert(1)"})) | {"weather": WEATHER})


def test_a_weather_face_without_tiles_is_its_own_cards_alone():
    dashboard = Dashboard.model_validate(profiles(pb=WEATHER_FACE) | {"weather": WEATHER})

    assert weather_tiles(dashboard) == []


def test_weather_brings_a_gradient_and_a_week_unless_told_otherwise():
    dashboard = Dashboard.model_validate(profiles() | {"weather": WEATHER})

    assert dashboard.weather.temperature_gradient
    assert dashboard.weather.forecast_days == DEFAULT_FORECAST_DAYS


def test_a_gust_is_worth_giving_from_the_default_unless_told_otherwise():
    dashboard = Dashboard.model_validate(profiles() | {"weather": WEATHER})

    assert dashboard.weather.wind_gust_threshold == DEFAULT_WIND_GUST_THRESHOLD


def test_a_gust_threshold_cannot_be_negative():
    with pytest.raises(ValidationError, match="wind_gust_threshold"):
        Dashboard.model_validate(profiles() | {"weather": WEATHER | {"wind_gust_threshold": -1}})


def test_a_profile_without_a_name_is_called_after_its_key():
    dashboard = Dashboard.model_validate(profiles(lr={"media_player": SPEAKER}))

    assert dashboard.profiles["lr"].name == "lr"


def test_the_default_profile_must_define_every_face():
    document = profiles()
    del document["profiles"]["default"]["faces"]["down"]

    with pytest.raises(ValidationError, match="down"):
        Dashboard.model_validate(document)


def test_the_default_profile_must_exist():
    with pytest.raises(ValidationError, match=DEFAULT_PROFILE_KEY):
        Dashboard.model_validate({"profiles": {}})


def test_the_default_profile_may_not_name_a_speaker():
    document = profiles()
    document["profiles"]["default"]["media_player"] = SPEAKER

    with pytest.raises(ValidationError, match="never inherited"):
        Dashboard.model_validate(document)


def test_the_default_profile_may_not_inherit():
    document = profiles()
    document["profiles"]["default"]["inherits"] = "lr"

    with pytest.raises(ValidationError, match="root"):
        Dashboard.model_validate(document)


def test_an_unknown_parent_is_refused():
    with pytest.raises(ValidationError, match="nowhere"):
        Dashboard.model_validate(profiles(lr={"inherits": "nowhere"}))


def test_an_inheritance_cycle_is_refused():
    with pytest.raises(ValidationError, match="inherits itself"):
        Dashboard.model_validate(profiles(lr={"inherits": "ob"}, ob={"inherits": "lr"}))


def test_a_profile_may_not_inherit_itself():
    with pytest.raises(ValidationError, match="inherits itself"):
        Dashboard.model_validate(profiles(lr={"inherits": "lr"}))


def test_a_profile_may_not_open_on_an_undeclared_floorplan():
    with pytest.raises(ValidationError, match="attic"):
        Dashboard.model_validate(profiles(lr={"floorplan": "attic"}))


def test_a_custom_face_must_name_a_page():
    with pytest.raises(ValidationError, match="no `page`"):
        Dashboard.model_validate(profiles(pb={"faces": {"front": {"content": "custom"}}}))


def test_a_custom_face_page_may_not_climb_out_of_the_resources_directory():
    with pytest.raises(ValidationError, match="plain directory name"):
        Dashboard.model_validate(profiles(pb={"faces": {"front": {"content": "custom", "page": "../../etc"}}}))


def test_a_custom_face_with_no_page_on_disk_falls_back_to_blank(tmp_path):
    dashboard = Dashboard.model_validate(
        profiles(pb={"faces": {"front": {"content": "custom", "page": "bedroom"}}}),
    )

    drop_missing_custom_faces(dashboard, tmp_path)
    front = dashboard.profiles["pb"].faces["front"]

    assert front.content == "blank"
    assert front.label == "bedroom"


def test_a_custom_face_survives_when_its_page_is_on_disk(tmp_path):
    page = tmp_path / "faces" / "bedroom"
    page.mkdir(parents=True)
    (page / "index.html").write_text("<html></html>")

    dashboard = Dashboard.model_validate(
        profiles(pb={"faces": {"front": {"content": "custom", "page": "bedroom"}}}),
    )

    drop_missing_custom_faces(dashboard, tmp_path)

    assert dashboard.profiles["pb"].faces["front"].content == "custom"


FRONT_DOOR = "camera.front_door"
DRIVEWAY = "camera.driveway"
BACK_YARD = "camera.back_yard"
GARAGE = "camera.garage"


def camera_grid(rows: list) -> dict:
    return profiles(gb={"faces": {"left": {"content": "camera-grid", "options": {"rows": rows}}}})


def camera_hero(**options) -> dict:
    return profiles(gb={"faces": {"left": {"content": "camera-hero", "options": options}}})


def test_a_camera_grid_keeps_the_shape_the_config_wrote():
    dashboard = Dashboard.model_validate(camera_grid([[FRONT_DOOR, DRIVEWAY], [BACK_YARD]]))
    rows = dashboard.profiles["gb"].faces["left"].options["rows"]

    assert [[camera["entity_id"] for camera in row] for row in rows] == [[FRONT_DOOR, DRIVEWAY], [BACK_YARD]]


def test_a_camera_named_on_its_own_arrives_as_a_whole_camera():
    dashboard = Dashboard.model_validate(camera_grid([[FRONT_DOOR]]))
    camera = dashboard.profiles["gb"].faces["left"].options["rows"][0][0]

    assert camera["entity_id"] == FRONT_DOOR
    assert camera["title"] is None
    assert camera["polling_interval"] == Camera(entity_id=FRONT_DOOR).polling_interval


def test_a_camera_may_still_be_written_out_in_full():
    title = "Back Yard"
    refresh = 30.0
    dashboard = Dashboard.model_validate(
        camera_grid([[{"entity_id": BACK_YARD, "title": title, "polling_interval": refresh}]]),
    )
    camera = dashboard.profiles["gb"].faces["left"].options["rows"][0][0]

    assert (camera["title"], camera["polling_interval"]) == (title, refresh)


def test_a_camera_hero_takes_its_hero_and_the_column_beside_it():
    dashboard = Dashboard.model_validate(camera_hero(hero=FRONT_DOOR, side=[DRIVEWAY, GARAGE]))
    options = dashboard.profiles["gb"].faces["left"].options

    assert options["hero"]["entity_id"] == FRONT_DOOR
    assert [camera["entity_id"] for camera in options["side"]] == [DRIVEWAY, GARAGE]


def test_a_camera_hero_may_stand_alone():
    dashboard = Dashboard.model_validate(camera_hero(hero=FRONT_DOOR))

    assert dashboard.profiles["gb"].faces["left"].options["side"] == []


def test_every_camera_a_face_draws_is_reachable_and_subscribed():
    dashboard = Dashboard.model_validate(camera_grid([[FRONT_DOOR, DRIVEWAY], [BACK_YARD, GARAGE]]))
    cameras = {FRONT_DOOR, DRIVEWAY, BACK_YARD, GARAGE}

    assert cameras <= dashboard.camera_entities
    assert cameras <= dashboard.allowed_entities


def test_the_dashboard_camera_stays_reachable_alongside_the_faces():
    document = camera_grid([[FRONT_DOOR]])
    document["camera"] = {"entity_id": DRIVEWAY}

    dashboard = Dashboard.model_validate(document)

    assert dashboard.camera_entities == frozenset({FRONT_DOOR, DRIVEWAY})


def test_a_face_the_config_never_names_reaches_no_camera():
    dashboard = Dashboard.model_validate(profiles(gb={"media_player": SPEAKER}))

    assert dashboard.camera_entities == frozenset()
    assert dashboard.profiles["gb"].faces["left"].cameras == []


def test_a_camera_grid_must_hold_a_camera():
    with pytest.raises(ValidationError, match="options it cannot draw with"):
        Dashboard.model_validate(camera_grid([]))


def test_a_camera_grid_row_must_hold_a_camera():
    with pytest.raises(ValidationError, match="options it cannot draw with"):
        Dashboard.model_validate(camera_grid([[]]))


def test_a_camera_hero_must_name_the_camera_it_leads_with():
    with pytest.raises(ValidationError, match="options it cannot draw with"):
        Dashboard.model_validate(camera_hero(side=[DRIVEWAY]))


def test_a_face_carries_a_label_strip_unless_it_says_otherwise():
    dashboard = Dashboard.model_validate(
        profiles(gb={"faces": {"front": {"content": "dashboard", "label_strip": False}}}),
    )
    faces = dashboard.profiles["gb"].faces

    assert faces["front"].label_strip is False
    assert faces["back"].label_strip is True



GO2RTC_URL = "http://go2rtc.example:1984"
POLLING_INTERVAL_SECONDS = 60.0


def with_go2rtc(document: dict) -> dict:
    return {**document, "go2rtc": {"url": GO2RTC_URL}}


def test_a_camera_is_polled_once_a_minute_unless_it_says_otherwise():
    camera = Camera(entity_id=FRONT_DOOR)

    assert camera.stream_type == "polling"
    assert camera.polling_interval == POLLING_INTERVAL_SECONDS
    assert camera.stream is None


def test_a_go2rtc_camera_plays_the_stream_named_after_it():
    """Frigate names its go2rtc streams after its cameras, and the entities after the same."""

    assert Camera(entity_id=FRONT_DOOR, stream_type="go2rtc").stream == "front_door"


def test_a_go2rtc_camera_may_name_a_stream_of_its_own():
    assert Camera(entity_id=FRONT_DOOR, stream_type="go2rtc", stream="porch").stream == "porch"


def test_a_camera_type_nobody_knows_is_refused():
    with pytest.raises(ValidationError):
        Camera(entity_id=FRONT_DOOR, stream_type="rtsp")


def test_a_go2rtc_camera_on_a_face_needs_somewhere_to_stream_from():
    with pytest.raises(ValidationError, match="no `go2rtc` block"):
        Dashboard.model_validate(camera_hero(hero={"entity_id": FRONT_DOOR, "stream_type": "go2rtc"}))


def test_the_dashboard_camera_needs_somewhere_to_stream_from_too():
    document = profiles()
    document["camera"] = {"entity_id": FRONT_DOOR, "stream_type": "go2rtc"}

    with pytest.raises(ValidationError, match="no `go2rtc` block"):
        Dashboard.model_validate(document)


def test_a_go2rtc_camera_loads_once_go2rtc_is_named():
    dashboard = Dashboard.model_validate(
        with_go2rtc(camera_hero(hero={"entity_id": FRONT_DOOR, "stream_type": "go2rtc"})),
    )
    hero = dashboard.profiles["gb"].faces["left"].options["hero"]

    assert dashboard.go2rtc.url == GO2RTC_URL
    assert (hero["stream_type"], hero["stream"]) == ("go2rtc", "front_door")


RTSP_URL = "rtsp://frigate.example:8554/front_door_stream"


def test_a_go2rtc_camera_with_an_rtsp_url_hands_go2rtc_the_url():
    """go2rtc takes a URL as the source directly, so it needs no stream set up for the camera."""

    assert Camera(entity_id=FRONT_DOOR, stream_type="go2rtc", rtsp=RTSP_URL).stream == RTSP_URL


def test_an_rtsp_url_wins_over_a_stream_name():
    camera = Camera(entity_id=FRONT_DOOR, stream_type="go2rtc", stream="porch", rtsp=RTSP_URL)

    assert camera.stream == RTSP_URL


def test_an_rtsp_url_on_a_polled_camera_is_refused_rather_than_ignored():
    with pytest.raises(ValidationError, match="set `stream_type: go2rtc`"):
        Camera(entity_id=FRONT_DOOR, rtsp=RTSP_URL)
