from pathlib import Path

import pytest
from pydantic import ValidationError

from cube.dashboard import (
    CUBE_FACES,
    DEFAULT_ALARM_MINUTE_STEP,
    DEFAULT_CUBE_FACE,
    DEFAULT_FORECAST_DAYS,
    DEFAULT_PROFILE_KEY,
    DEFAULT_WIND_GUST_THRESHOLD,
    RAINVIEWER_MAX_ZOOM,
    Camera,
    Dashboard,
    ThresholdBand,
    ThresholdScale,
    Toggle,
    Visualizer,
    VisualizerStyle,
    drop_missing_custom_faces,
    drop_missing_demo_clip,
    load_dashboard,
)

SAMPLE_CONFIG = Path("config.yaml.dist")
VISUALIZER_MARKER = "chime_tts"

LOW_COLOR = "#999999"
MID_COLOR = "#11fcf7"
HIGH_COLOR = "#ff0000"

SPEAKER = "media_player.a_speaker"

CHIP = {"entity_id": "cover.garage_door", "label": "Garage", "icon": "mdi:garage"}


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
    assert dashboard.mcw.warning_entity_id in allowed
    assert dashboard.mcw.caution_entity_id in allowed


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


def test_a_profile_opens_on_the_front_face_unless_told_otherwise():
    dashboard = Dashboard.model_validate(profiles(lr={"media_player": SPEAKER}))

    assert dashboard.profiles["lr"].default_face == DEFAULT_CUBE_FACE


def test_a_profile_may_open_on_any_face():
    for face in CUBE_FACES:
        dashboard = Dashboard.model_validate(profiles(lr={"default_face": face}))

        assert dashboard.profiles["lr"].default_face == face


def test_the_face_a_profile_opens_on_is_inherited():
    dashboard = Dashboard.model_validate(
        profiles(pb={"default_face": "up"}, ob={"inherits": "pb"}),
    )

    assert dashboard.profiles["ob"].default_face == "up"


def test_a_child_may_open_on_a_different_face_than_its_parent():
    document = profiles(lr={"default_face": "left"})
    document["profiles"]["default"]["default_face"] = "back"
    dashboard = Dashboard.model_validate(document)

    assert dashboard.profiles["default"].default_face == "back"
    assert dashboard.profiles["lr"].default_face == "left"


def test_a_profile_may_not_open_on_a_face_the_cube_does_not_have():
    with pytest.raises(ValidationError, match="sideways"):
        Dashboard.model_validate(profiles(lr={"default_face": "sideways"}))


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


def test_the_visualizer_defaults_to_bars():
    visualizer = Visualizer.model_validate({"content_marker": VISUALIZER_MARKER})

    assert visualizer.style is VisualizerStyle.BARS


def test_the_visualizer_may_be_a_ridgeline():
    visualizer = Visualizer.model_validate({"content_marker": VISUALIZER_MARKER, "style": "ridgeline"})

    assert visualizer.style is VisualizerStyle.RIDGELINE


def test_the_visualizer_may_be_a_corona():
    visualizer = Visualizer.model_validate({"content_marker": VISUALIZER_MARKER, "style": "corona"})

    assert visualizer.style is VisualizerStyle.CORONA


def test_the_visualizer_may_be_a_halo():
    visualizer = Visualizer.model_validate({"content_marker": VISUALIZER_MARKER, "style": "halo"})

    assert visualizer.style is VisualizerStyle.HALO


def test_an_unknown_visualizer_style_is_refused():
    with pytest.raises(ValidationError, match="style"):
        Visualizer.model_validate({"content_marker": VISUALIZER_MARKER, "style": "sparkles"})


DEMO_CLIP = "sounds/demo.wav"


def visualizer_config(**visualizer) -> dict:
    return {**profiles(), "visualizer": {"content_marker": VISUALIZER_MARKER, **visualizer}}


def test_the_visualizer_demo_is_off_unless_asked_for():
    visualizer = Visualizer.model_validate({"content_marker": VISUALIZER_MARKER})

    assert visualizer.demo is False
    assert visualizer.demo_clip is None


def test_the_visualizer_demo_stays_on_when_its_clip_is_there(tmp_path):
    (tmp_path / "sounds").mkdir()
    (tmp_path / DEMO_CLIP).write_bytes(b"audio")
    dashboard = Dashboard.model_validate(visualizer_config(demo=True, demo_clip=DEMO_CLIP))

    drop_missing_demo_clip(dashboard, tmp_path)

    assert dashboard.visualizer.demo is True


def test_the_visualizer_demo_turns_off_without_its_clip(tmp_path):
    dashboard = Dashboard.model_validate(visualizer_config(demo=True, demo_clip=DEMO_CLIP))

    drop_missing_demo_clip(dashboard, tmp_path)

    assert dashboard.visualizer.demo is False


def test_the_visualizer_demo_turns_off_without_a_clip_named(tmp_path):
    dashboard = Dashboard.model_validate(visualizer_config(demo=True))

    drop_missing_demo_clip(dashboard, tmp_path)

    assert dashboard.visualizer.demo is False


def test_the_visualizer_demo_clip_cannot_escape_the_resources_directory(tmp_path):
    resources = tmp_path / "resources"
    resources.mkdir()
    (tmp_path / "secret.wav").write_bytes(b"classified")
    dashboard = Dashboard.model_validate(visualizer_config(demo=True, demo_clip="../secret.wav"))

    drop_missing_demo_clip(dashboard, resources)

    assert dashboard.visualizer.demo is False


REFERENCE_HEX = "#3d8bdc"
SHORT_HEX = "#abc"
REFERENCE_PRIMARY = "#123456"
REFERENCE_SECONDARY = "#654321"


def test_the_visualizer_keeps_its_own_palette_unless_given_a_reference_colour():
    visualizer = Visualizer.model_validate({"content_marker": VISUALIZER_MARKER})

    assert visualizer.reference_color is None


@pytest.mark.parametrize("value", ["default", "none", "None", "DEFAULT"])
def test_default_or_none_keeps_the_visualizers_own_palette(value):
    visualizer = Visualizer.model_validate({"content_marker": VISUALIZER_MARKER, "reference_color": value})

    assert visualizer.reference_color is None


@pytest.mark.parametrize("value", [REFERENCE_HEX, SHORT_HEX])
def test_the_visualizer_takes_a_hex_reference_colour(value):
    visualizer = Visualizer.model_validate({"content_marker": VISUALIZER_MARKER, "reference_color": value})

    assert visualizer.reference_color == value


@pytest.mark.parametrize(("name", "colour"), [("primary", REFERENCE_PRIMARY), ("secondary", REFERENCE_SECONDARY)])
def test_the_visualizer_reference_colour_may_name_the_palette(name, colour):
    config = visualizer_config(reference_color=name) | {"colors": {"primary": REFERENCE_PRIMARY, "secondary": REFERENCE_SECONDARY}}

    assert Dashboard.model_validate(config).visualizer.reference_color == colour


def test_the_visualizer_rings_turn_unless_told_not_to():
    visualizer = Visualizer.model_validate({"content_marker": VISUALIZER_MARKER})

    assert visualizer.rotate is True


def test_the_visualizer_rings_can_be_held_still():
    visualizer = Visualizer.model_validate({"content_marker": VISUALIZER_MARKER, "rotate": False})

    assert visualizer.rotate is False


@pytest.mark.parametrize("value", ["blue", "#12345", "3d8bdc", "tertiary"])
def test_anything_else_as_a_reference_colour_is_refused(value):
    with pytest.raises(ValidationError, match="reference_color"):
        Visualizer.model_validate({"content_marker": VISUALIZER_MARKER, "reference_color": value})


TRANSCRIPT_ENTITY = "input_text.last_announcement"
TRANSCRIPT_MARKER = "tts_proxy"


def test_the_transcript_takes_the_visualizers_marker_when_it_names_none():
    dashboard = Dashboard.model_validate({**visualizer_config(), "transcript": {"entity_id": TRANSCRIPT_ENTITY}})

    assert dashboard.transcript.content_marker == VISUALIZER_MARKER


def test_the_transcripts_own_marker_wins_over_the_visualizers():
    transcript = {"entity_id": TRANSCRIPT_ENTITY, "content_marker": TRANSCRIPT_MARKER}
    dashboard = Dashboard.model_validate({**visualizer_config(), "transcript": transcript})

    assert dashboard.transcript.content_marker == TRANSCRIPT_MARKER


def test_the_transcript_has_no_marker_without_a_visualizer_to_take_one_from():
    dashboard = Dashboard.model_validate({**profiles(), "transcript": {"entity_id": TRANSCRIPT_ENTITY}})

    assert dashboard.transcript.content_marker is None


def test_a_toggle_switches_on_a_tap_unless_it_asks_to_be_held():
    assert Toggle(**CHIP).hold_seconds is None
    assert Toggle(**CHIP, hold_seconds=1.5).hold_seconds == 1.5


def test_a_chip_is_the_primary_colour_when_on_and_grey_when_off_unless_told_otherwise():
    chip = Toggle(**CHIP)

    # Unset is the primary colour, which the panel resolves.
    assert (chip.active_color, chip.inactive_color) == (None, "#999999")


def test_a_chip_colour_may_name_the_palette():
    dashboard = Dashboard.model_validate(
        profiles() | {"colors": {"primary": "#123456"}, "toggles": [CHIP | {"active_color": "primary"}]}
    )

    assert dashboard.toggles[0].active_color == "#123456"


def test_a_chip_colour_the_panel_cannot_draw_is_refused():
    with pytest.raises(ValidationError, match="must be a palette name"):
        Toggle(**CHIP, active_color="amber")


def test_a_toggle_cannot_be_held_for_no_time_at_all():
    with pytest.raises(ValidationError, match="greater than 0"):
        Toggle(**CHIP, hold_seconds=0)


GUEST_LIGHT = "light.guest_room"
GUEST_BLINDS = "cover.guest_blinds"
GUEST_FAN = "switch.guest_fan"
ALARM_SWITCH = "input_boolean.guest_alarm"
ALARM_TIME = "input_datetime.guest_alarm"
WIFI_SSID = "sensor.guest_ssid"
WIFI_PASSWORD = "input_text.guest_password"
SEASON = "input_boolean.season"


def guest_face(**options) -> dict:
    return profiles(gb={"faces": {"front": {"content": "guest", "options": options}}})


def guest_room() -> Dashboard:
    return Dashboard.model_validate(
        guest_face(
            wifi={"ssid_entity_id": WIFI_SSID, "password_entity_id": WIFI_PASSWORD, "hidden": True},
            sliders=[
                {"entity_id": GUEST_LIGHT, "label": "Light", "icon": "mdi:ceiling-light"},
                {"entity_id": GUEST_BLINDS, "label": "Blinds", "icon": "mdi:blinds"},
            ],
            toggles=[{"entity_id": GUEST_FAN, "label": "Fan", "icon": "mdi:fan", "visible_when": SEASON}],
            alarm={"enabled_entity_id": ALARM_SWITCH, "time_entity_id": ALARM_TIME},
        )
    )


def test_everything_a_guest_face_draws_is_subscribed():
    allowed = guest_room().allowed_entities

    assert {GUEST_LIGHT, GUEST_BLINDS, GUEST_FAN, SEASON, ALARM_SWITCH, ALARM_TIME, WIFI_SSID, WIFI_PASSWORD} <= allowed


def test_a_guest_face_switches_its_controls_and_nothing_it_only_shows():
    dashboard = guest_room()

    for entity_id in (GUEST_LIGHT, GUEST_BLINDS, GUEST_FAN, ALARM_SWITCH):
        assert dashboard.may_toggle(entity_id)

    for entity_id in (WIFI_PASSWORD, SEASON, ALARM_TIME):
        assert not dashboard.may_toggle(entity_id)


def test_a_guest_face_sets_a_light_a_cover_and_the_alarm_time():
    dashboard = guest_room()

    for entity_id in (GUEST_LIGHT, GUEST_BLINDS, ALARM_TIME):
        assert dashboard.may_set(entity_id)

    for entity_id in (GUEST_FAN, ALARM_SWITCH, WIFI_SSID):
        assert not dashboard.may_set(entity_id)


def test_a_floorplan_light_may_be_set_as_well_as_switched(dashboard):
    light = dashboard.floorplans["downstairs"].groups["lights"][0]

    assert dashboard.may_set(light)


def test_an_entity_only_shown_is_never_settable(dashboard):
    for notice in dashboard.notices:
        assert not dashboard.may_set(notice.entity_id)

    assert not dashboard.may_set("light.not_in_the_config")


BLINDS_BAR = {"entity_id": GUEST_BLINDS, "label": "Blinds", "icon": "mdi:blinds"}


def test_a_slider_toggles_unless_it_opens_to_a_position():
    plain = Dashboard.model_validate(guest_face(sliders=[BLINDS_BAR]))
    slats = Dashboard.model_validate(guest_face(sliders=[BLINDS_BAR | {"toggle_position": 50}]))

    assert plain.profiles["gb"].faces["front"].options["sliders"][0]["toggle_position"] is None
    assert slats.profiles["gb"].faces["front"].options["sliders"][0]["toggle_position"] == 50


@pytest.mark.parametrize("position", [0, 101])
def test_a_slider_opens_to_somewhere_between_shut_and_all_the_way(position):
    with pytest.raises(ValidationError, match="toggle_position"):
        Dashboard.model_validate(guest_face(sliders=[BLINDS_BAR | {"toggle_position": position}]))


def test_a_slider_must_be_a_light_or_a_cover():
    with pytest.raises(ValidationError, match="not a light or a cover"):
        Dashboard.model_validate(guest_face(sliders=[{"entity_id": GUEST_FAN, "label": "Fan", "icon": "mdi:fan"}]))


def test_the_alarm_moves_a_quarter_hour_at_a_time_unless_told_otherwise():
    dashboard = Dashboard.model_validate(
        guest_face(alarm={"enabled_entity_id": ALARM_SWITCH, "time_entity_id": ALARM_TIME})
    )

    assert dashboard.profiles["gb"].faces["front"].options["alarm"]["minute_step"] == DEFAULT_ALARM_MINUTE_STEP


def test_the_alarm_cannot_step_more_than_an_hour():
    with pytest.raises(ValidationError, match="less than or equal to 60"):
        Dashboard.model_validate(
            guest_face(alarm={"enabled_entity_id": ALARM_SWITCH, "time_entity_id": ALARM_TIME, "minute_step": 90})
        )


def test_a_network_is_wpa_and_shows_its_name_unless_told_otherwise():
    dashboard = Dashboard.model_validate(
        guest_face(wifi={"ssid_entity_id": WIFI_SSID, "password_entity_id": WIFI_PASSWORD})
    )

    wifi = dashboard.profiles["gb"].faces["front"].options["wifi"]

    assert wifi["security"] == "WPA"
    assert wifi["hidden"] is False


def test_a_network_security_nobody_knows_is_refused():
    with pytest.raises(ValidationError, match="security"):
        Dashboard.model_validate(
            guest_face(wifi={"ssid_entity_id": WIFI_SSID, "password_entity_id": WIFI_PASSWORD, "security": "WPA9"})
        )


def test_a_guest_face_with_no_options_draws_only_the_shared_cards():
    dashboard = Dashboard.model_validate(guest_face())

    assert dashboard.profiles["gb"].faces["front"].controls == []


QR_URL = "https://qr.example/?data={data}&size={size}"


def test_the_rooms_light_is_switched_and_dimmed():
    dashboard = Dashboard.model_validate(guest_face(light={"entity_id": GUEST_LIGHT}))

    assert dashboard.may_toggle(GUEST_LIGHT)
    assert dashboard.may_set(GUEST_LIGHT)
    assert GUEST_LIGHT in dashboard.allowed_entities


def test_the_rooms_light_defaults_to_the_full_profiles_warm_white():
    dashboard = Dashboard.model_validate(guest_face(light={"entity_id": GUEST_LIGHT}))

    assert dashboard.profiles["gb"].faces["front"].options["light"]["default_xy"] == [0.469, 0.403]


@pytest.mark.parametrize("xy", [[0.5], [0.5, 0.4, 0.3], [1.2, 0.4]])
def test_the_rooms_default_colour_must_be_a_point_on_the_chart(xy):
    with pytest.raises(ValidationError, match="default_xy"):
        Dashboard.model_validate(guest_face(light={"entity_id": GUEST_LIGHT, "default_xy": xy}))


def test_the_rooms_light_must_be_a_light():
    with pytest.raises(ValidationError, match="is not a light"):
        Dashboard.model_validate(guest_face(light={"entity_id": GUEST_BLINDS}))


def test_a_network_may_name_a_page_to_draw_its_code():
    wifi = {"ssid_entity_id": WIFI_SSID, "password_entity_id": WIFI_PASSWORD, "qr_url": QR_URL}

    dashboard = Dashboard.model_validate(guest_face(wifi=wifi))

    assert dashboard.profiles["gb"].faces["front"].options["wifi"]["qr_url"] == QR_URL


def test_a_code_page_needs_somewhere_to_put_the_network():
    wifi = {"ssid_entity_id": WIFI_SSID, "password_entity_id": WIFI_PASSWORD, "qr_url": "https://qr.example/"}

    with pytest.raises(ValidationError, match="nowhere to put the network"):
        Dashboard.model_validate(guest_face(wifi=wifi))


def test_a_code_page_must_be_a_web_address():
    wifi = {"ssid_entity_id": WIFI_SSID, "password_entity_id": WIFI_PASSWORD, "qr_url": "file:///qr?data={data}"}

    with pytest.raises(ValidationError, match="not an http or https address"):
        Dashboard.model_validate(guest_face(wifi=wifi))
