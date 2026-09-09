from pathlib import Path

import pytest

from cube.config import Settings

SAMPLE_CONFIG = Path("config.yaml.dist")

TEST_HA_URL = "http://home-assistant.invalid:8123"
TEST_HA_TOKEN = "test-token"

# Matches `floorplans.downstairs.image` in the sample config.
SAMPLE_FLOORPLAN_IMAGE = "downstairs"
SAMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><g id="light.example_kitchen" /></svg>'

# Matches `profiles.example-bedroom.faces.front.page` in the sample config.
SAMPLE_FACE_PAGE = "bedroom"
SAMPLE_FACE_MARKUP = '<html><head><link href="face.css" /></head><body>bedroom</body></html>'


@pytest.fixture
def resources(tmp_path: Path) -> Path:
    """A resources directory holding one drawing and one custom face, for the asset routes."""

    floorplans = tmp_path / "floorplans"
    floorplans.mkdir()
    (floorplans / f"{SAMPLE_FLOORPLAN_IMAGE}.svg").write_text(SAMPLE_SVG)

    page = tmp_path / "faces" / SAMPLE_FACE_PAGE
    page.mkdir(parents=True)
    (page / "index.html").write_text(SAMPLE_FACE_MARKUP)

    return tmp_path


@pytest.fixture
def settings(resources: Path) -> Settings:
    return Settings(
        ha_url=TEST_HA_URL,
        ha_token=TEST_HA_TOKEN,
        dashboard_path=SAMPLE_CONFIG,
        resources_path=resources,
    )
