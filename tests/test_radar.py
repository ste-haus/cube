"""The radar cache: which tiles are fetched, how many times, and what a panel is handed.

RainViewer limits how much one address may fetch, and every panel in a house shares one, so the
counts are the point: a tile is fetched once whoever asks for it, and never for a frame RainViewer
does not list or a place it does not draw.
"""

import asyncio
import json
import os
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from cube.app import create_app
from cube.cache import DiskCache
from cube.dashboard import load_dashboard
from cube.hass import protocol
from cube.radar import PREFETCH_RADIUS, RadarCache, UnknownTileError, home_tile, tiles_around
from cube.upstream import Upstream

SAMPLE_CONFIG = Path("config.yaml.dist")

ZOOM = 7
HOME = {"latitude": 48.8, "longitude": -122.5}
HOME_TILE = (20, 44)
TILES_PER_FRAME = (2 * PREFETCH_RADIUS + 1) ** 2

NEAR_THE_POLE_AND_THE_ANTIMERIDIAN = (85.0, 179.9)
SMALL_ZOOM = 3

UNLISTED_FRAME = "f00d42"
PANELS_AT_ONCE = 5
OLD_RAIN = b"old rain"
LONG_AGO = 1_000_000_000

OK = 200
NOT_FOUND = 404
PNG_CONTENT_TYPE = "image/png"
IMMUTABLE = "immutable"
FRAMES_ROUTE = "/api/radar/frames"
TILE_ROUTE = "/api/radar/tiles/{frame}/{z}/{x}/{y}.png"


@pytest.fixture
def states() -> dict:
    zone = load_dashboard(SAMPLE_CONFIG).weather.zone_entity_id

    return {zone: {protocol.ATTRIBUTES: dict(HOME)}}


@pytest.fixture
def radar(tmp_path, fake_upstream, states) -> RadarCache:
    cache = DiskCache(tmp_path)
    upstream = Upstream(cache, fake_upstream.client())

    return RadarCache(cache, upstream, load_dashboard(SAMPLE_CONFIG), SimpleNamespace(states=states))


def tile_requests(fake_upstream) -> list[str]:
    return [url for url in fake_upstream.requests if url.startswith(fake_upstream.host)]


def tile_route(frame: str) -> str:
    column, row = HOME_TILE

    return TILE_ROUTE.format(frame=frame, z=ZOOM, x=column, y=row)


def test_home_is_in_the_tile_a_panel_draws_it_in():
    assert home_tile(HOME["latitude"], HOME["longitude"], ZOOM) == HOME_TILE


def test_the_tiles_fetched_ahead_are_a_square_round_home():
    tiles = tiles_around(HOME["latitude"], HOME["longitude"], ZOOM, PREFETCH_RADIUS)

    assert len(tiles) == TILES_PER_FRAME
    assert HOME_TILE in tiles


def test_the_square_wraps_round_the_antimeridian_and_stops_at_the_pole():
    latitude, longitude = NEAR_THE_POLE_AND_THE_ANTIMERIDIAN
    count = 2**SMALL_ZOOM

    tiles = tiles_around(latitude, longitude, SMALL_ZOOM, PREFETCH_RADIUS)

    assert all(0 <= x < count and 0 <= y < count for x, y in tiles)
    assert len(tiles) < TILES_PER_FRAME


async def test_the_panels_copy_of_the_frames_names_them_and_nothing_else(radar, fake_upstream):
    await radar.refresh()

    assert json.loads(radar.frames_path.read_text()) == {"frames": fake_upstream.frames}


async def test_each_frame_is_fetched_ahead_newest_first(radar, fake_upstream):
    frames = await radar.refresh()

    await radar.prefetch(frames)

    requests = tile_requests(fake_upstream)
    assert len(requests) == TILES_PER_FRAME * len(frames)
    assert f"/{frames[-1].id}/" in requests[0]


async def test_a_frame_already_on_disk_is_not_fetched_again(radar, fake_upstream):
    frames = await radar.refresh()
    await radar.prefetch(frames)
    fetched = len(tile_requests(fake_upstream))

    await radar.prefetch(frames)

    assert len(tile_requests(fake_upstream)) == fetched


async def test_nothing_is_fetched_ahead_until_home_is_known(radar, fake_upstream, states):
    states.clear()

    await radar.prefetch(await radar.refresh())

    assert tile_requests(fake_upstream) == []


async def test_panels_asking_for_a_tile_at_once_cost_rainviewer_one_fetch(radar, fake_upstream):
    newest = (await radar.refresh())[-1].id
    upstream = fake_upstream.tile_url(newest, ZOOM, *HOME_TILE)

    paths = await asyncio.gather(*(radar.tile(newest, ZOOM, *HOME_TILE) for _ in range(PANELS_AT_ONCE)))

    assert len(set(paths)) == 1
    assert paths[0].read_bytes() == upstream.encode()
    assert tile_requests(fake_upstream) == [upstream]


async def test_a_tile_on_disk_is_served_after_its_frame_leaves_the_list(radar, fake_upstream):
    path = radar.tile_path(UNLISTED_FRAME, ZOOM, *HOME_TILE)
    path.parent.mkdir(parents=True)
    path.write_bytes(OLD_RAIN)

    assert await radar.tile(UNLISTED_FRAME, ZOOM, *HOME_TILE) == path
    assert tile_requests(fake_upstream) == []


async def test_nothing_is_fetched_for_a_frame_rainviewer_does_not_list(radar, fake_upstream):
    with pytest.raises(UnknownTileError):
        await radar.tile(UNLISTED_FRAME, ZOOM, *HOME_TILE)

    assert tile_requests(fake_upstream) == []


@pytest.mark.parametrize(("z", "x", "y"), [(ZOOM + 1, 0, 0), (-1, 0, 0), (ZOOM, 2**ZOOM, 0), (ZOOM, 0, -1)])
async def test_nothing_is_fetched_off_the_map(radar, fake_upstream, z, x, y):
    newest = (await radar.refresh())[-1].id

    with pytest.raises(UnknownTileError):
        await radar.tile(newest, z, x, y)

    assert tile_requests(fake_upstream) == []


async def test_a_frame_name_cannot_step_outside_the_cache(radar):
    with pytest.raises(UnknownTileError):
        await radar.tile("..", ZOOM, *HOME_TILE)


def test_a_panel_is_handed_its_tiles_from_the_cache(settings, fake_upstream):
    with TestClient(create_app(settings)) as client:
        newest = client.get(FRAMES_ROUTE).json()["frames"][-1]["id"]
        first = client.get(tile_route(newest))
        second = client.get(tile_route(newest))

    upstream = fake_upstream.tile_url(newest, ZOOM, *HOME_TILE)

    assert first.status_code == second.status_code == OK
    assert first.content == upstream.encode()
    assert first.headers["content-type"] == PNG_CONTENT_TYPE
    assert IMMUTABLE in first.headers["cache-control"]
    assert fake_upstream.requests.count(upstream) == 1


def test_serving_a_tile_keeps_it_from_the_sweep(settings):
    with TestClient(create_app(settings)) as client:
        newest = client.get(FRAMES_ROUTE).json()["frames"][-1]["id"]
        client.get(tile_route(newest))

        path = client.app.state.hub.radar.tile_path(newest, ZOOM, *HOME_TILE)
        os.utime(path, (LONG_AGO, LONG_AGO))
        client.get(tile_route(newest))

    assert path.stat().st_mtime > LONG_AGO


def test_a_tile_rainviewer_does_not_list_is_not_found(settings):
    with TestClient(create_app(settings)) as client:
        client.get(FRAMES_ROUTE)
        response = client.get(tile_route(UNLISTED_FRAME))

    assert response.status_code == NOT_FOUND
