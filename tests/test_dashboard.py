from pathlib import Path

import pytest

from cube.dashboard import ThresholdBand, ThresholdScale, load_dashboard

SAMPLE_CONFIG = Path("config.yaml.dist")

LOW_COLOR = "#999999"
MID_COLOR = "#11fcf7"
HIGH_COLOR = "#ff0000"


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
