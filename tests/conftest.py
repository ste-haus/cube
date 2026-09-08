from pathlib import Path

import pytest

from cube.config import Settings

SAMPLE_CONFIG = Path("config.yaml.dist")

TEST_HA_URL = "http://home-assistant.invalid:8123"
TEST_HA_TOKEN = "test-token"

# Matches `floorplans.downstairs.image` in the sample config.
SAMPLE_FLOORPLAN_IMAGE = "downstairs"
SAMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><g id="light.example_kitchen" /></svg>'


@pytest.fixture
def resources(tmp_path: Path) -> Path:
    """A resources directory holding one drawing, for the floorplan routes."""

    floorplans = tmp_path / "floorplans"
    floorplans.mkdir()
    (floorplans / f"{SAMPLE_FLOORPLAN_IMAGE}.svg").write_text(SAMPLE_SVG)

    return tmp_path


@pytest.fixture
def settings(resources: Path) -> Settings:
    return Settings(
        ha_url=TEST_HA_URL,
        ha_token=TEST_HA_TOKEN,
        dashboard_path=SAMPLE_CONFIG,
        resources_path=resources,
    )
