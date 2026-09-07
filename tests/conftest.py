from pathlib import Path

import pytest

from cube.config import Settings

SAMPLE_CONFIG = Path("config") / "cube.dist.yaml"

TEST_HA_URL = "http://home-assistant.invalid:8123"
TEST_HA_TOKEN = "test-token"


@pytest.fixture
def settings() -> Settings:
    return Settings(ha_url=TEST_HA_URL, ha_token=TEST_HA_TOKEN, dashboard_path=SAMPLE_CONFIG)
