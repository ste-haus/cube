"""The map's style, sprites and glyphs, relayed from VersaTiles through cube's cache.

The rewrite is the point of it: a panel is never sent to VersaTiles for anything but the vector
tiles, and the relay can never be steered anywhere but VersaTiles' sprites and glyphs.
"""

import json

import pytest
from fastapi.testclient import TestClient

from cube.app import create_app
from cube.basemap import ASSETS_URL, MapAssets, UnknownAssetError, localised
from cube.cache import MAP_KIND, DiskCache
from cube.upstream import Upstream

LOCAL_SPRITE = "/api/map/sprites/basics/sprites"
LOCAL_GLYPHS = "/api/map/glyphs/{fontstack}/{range}.pbf"
SPRITE_FILES = ["sprites.json", "sprites.png", "sprites@2x.json", "sprites@2x.png"]
FOREIGN_SPRITE = "https://elsewhere.example/sprite"

STYLE_ROUTE = "/api/map/style.json"
GLYPH_ROUTE = "/api/map/glyphs/noto_sans_regular/0-255.pbf"
GLYPH_URL = f"{ASSETS_URL}glyphs/noto_sans_regular/0-255.pbf"
STYLE_OUTSIDE_THE_RELAY_ROUTE = "/api/map/styles/eclipse/style.json"

OK = 200
NOT_FOUND = 404
PROTOBUF_CONTENT_TYPE = "application/x-protobuf"


@pytest.fixture
def assets(tmp_path, fake_upstream) -> MapAssets:
    cache = DiskCache(tmp_path)

    return MapAssets(cache, Upstream(cache, fake_upstream.client()))


def test_the_style_sends_a_panel_to_cube_for_its_sprites_and_glyphs(fake_upstream):
    style = localised(fake_upstream.style)

    assert style["sprite"] == [{"id": "basics", "url": LOCAL_SPRITE}]
    assert style["glyphs"] == LOCAL_GLYPHS
    assert style["sources"] == fake_upstream.style["sources"]


def test_an_address_outside_versatiles_assets_is_left_alone():
    assert localised({"sprite": FOREIGN_SPRITE})["sprite"] == FOREIGN_SPRITE


async def test_a_refresh_keeps_the_sprite_sheets_and_the_style_that_names_them(assets, tmp_path):
    await assets.refresh()

    sheets = tmp_path / MAP_KIND / "sprites" / "basics"
    assert sorted(path.name for path in sheets.iterdir()) == sorted(SPRITE_FILES)
    assert json.loads(assets.style_path.read_text())["glyphs"] == LOCAL_GLYPHS


@pytest.mark.parametrize(
    "relative",
    [
        "glyphs/../../secret.pbf",
        "glyphs/noto_sans_regular/..",
        "styles/eclipse/style.json",
        "sprites/basics/sprites.txt",
        "tiles/osm/1/2/3",
        "glyphs",
    ],
)
async def test_only_sprites_and_glyphs_are_relayed(assets, fake_upstream, relative):
    with pytest.raises(UnknownAssetError):
        await assets.asset(relative)

    assert fake_upstream.requests == []


def test_a_panel_is_handed_the_map_from_the_cache(settings, fake_upstream):
    with TestClient(create_app(settings)) as client:
        style = client.get(STYLE_ROUTE)
        first = client.get(GLYPH_ROUTE)
        second = client.get(GLYPH_ROUTE)

    assert style.status_code == OK
    assert style.json()["glyphs"] == LOCAL_GLYPHS
    assert first.content == second.content == GLYPH_URL.encode()
    assert first.headers["content-type"] == PROTOBUF_CONTENT_TYPE
    assert fake_upstream.requests.count(GLYPH_URL) == 1


def test_a_panel_cannot_steer_the_relay_elsewhere(settings):
    with TestClient(create_app(settings)) as client:
        response = client.get(STYLE_OUTSIDE_THE_RELAY_ROUTE)

    assert response.status_code == NOT_FOUND
