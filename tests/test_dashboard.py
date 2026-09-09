from pathlib import Path

import pytest
from pydantic import ValidationError

from cube.dashboard import (
    CUBE_FACES,
    DEFAULT_PROFILE_KEY,
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
