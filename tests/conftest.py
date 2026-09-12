from pathlib import Path

import httpx
import pytest

from cube import hub
from cube.basemap import ASSETS_URL, STYLE_URL
from cube.config import Settings
from cube.radar import WEATHER_MAPS_URL

SAMPLE_CONFIG = Path("config.yaml.dist")

TEST_HA_URL = "http://home-assistant.invalid:8123"
TEST_HA_TOKEN = "test-token"

# Matches `floorplans.downstairs.image` in the sample config.
SAMPLE_FLOORPLAN_IMAGE = "downstairs"
SAMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><g id="light.example_kitchen" /></svg>'

# Matches `profiles.example-bedroom.faces.front.page` in the sample config.
SAMPLE_FACE_PAGE = "bedroom"
SAMPLE_FACE_MARKUP = '<html><head><link href="face.css" /></head><body>bedroom</body></html>'

CACHE_DIRECTORY = "cache"

OK = 200

# What the stand-in for RainViewer lists, oldest first, and where it says the tiles are.
FAKE_RAINVIEWER_HOST = "https://tilecache.rainviewer.invalid"
FAKE_RADAR_FRAMES = [{"time": 1_800_000_000, "id": "a1b2c3"}, {"time": 1_800_000_600, "id": "d4e5f6"}]
FAKE_RADAR_PATH = "/v2/radar/{id}"
FAKE_TILE_URL = "{host}/v2/radar/{id}/256/{z}/{x}/{y}/2/1_0.png"

# The shape of VersaTiles' style, with only the parts the relay reads.
FAKE_STYLE = {
    "version": 8,
    "sprite": [{"id": "basics", "url": f"{ASSETS_URL}sprites/basics/sprites"}],
    "glyphs": f"{ASSETS_URL}glyphs/{{fontstack}}/{{range}}.pbf",
    "sources": {"shortbread": {"type": "vector", "tiles": ["https://tiles.versatiles.org/tiles/osm/{z}/{x}/{y}"]}},
    "layers": [],
}


class FakeUpstream:
    """Stands in for RainViewer and VersaTiles, recording every address asked of them.

    Anything it has no document for comes back as its own address, so a test can tell which file
    it was handed.
    """

    def __init__(self) -> None:
        self.requests: list[str] = []
        self.host = FAKE_RAINVIEWER_HOST
        self.frames = FAKE_RADAR_FRAMES
        self.style = FAKE_STYLE

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self._handle))

    def tile_url(self, frame_id: str, z: int, x: int, y: int) -> str:
        return FAKE_TILE_URL.format(host=self.host, id=frame_id, z=z, x=x, y=y)

    def _handle(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        self.requests.append(url)

        if url == WEATHER_MAPS_URL:
            past = [{"time": frame["time"], "path": FAKE_RADAR_PATH.format(id=frame["id"])} for frame in self.frames]

            return httpx.Response(OK, json={"host": self.host, "radar": {"past": past}})

        if url == STYLE_URL:
            return httpx.Response(OK, json=self.style)

        return httpx.Response(OK, content=url.encode())


@pytest.fixture(autouse=True)
def fake_upstream(monkeypatch: pytest.MonkeyPatch) -> FakeUpstream:
    """Every test's stand-in for the internet, so nothing under test reaches RainViewer or VersaTiles."""

    fake = FakeUpstream()
    monkeypatch.setattr(hub, "upstream_client", lambda _settings: fake.client())

    return fake


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
def settings(resources: Path, tmp_path: Path) -> Settings:
    return Settings(
        ha_url=TEST_HA_URL,
        ha_token=TEST_HA_TOKEN,
        dashboard_path=SAMPLE_CONFIG,
        resources_path=resources,
        cache_path=tmp_path / CACHE_DIRECTORY,
    )
