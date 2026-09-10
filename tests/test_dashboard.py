from pathlib import Path

import pytest
from pydantic import ValidationError

from cube.dashboard import (
    CUBE_FACES,
    DEFAULT_PROFILE_KEY,
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
    assert camera["refresh_seconds"] == Camera(entity_id=FRONT_DOOR).refresh_seconds


def test_a_camera_may_still_be_written_out_in_full():
    title = "Back Yard"
    refresh = 30.0
    dashboard = Dashboard.model_validate(
        camera_grid([[{"entity_id": BACK_YARD, "title": title, "refresh_seconds": refresh}]]),
    )
    camera = dashboard.profiles["gb"].faces["left"].options["rows"][0][0]

    assert (camera["title"], camera["refresh_seconds"]) == (title, refresh)


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
