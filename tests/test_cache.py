"""The disk cache: writes that land whole, and a sweep that keeps whatever is still asked for."""

import os
import time
from pathlib import Path

from cube.cache import MAP_KIND, RADAR_KIND, SECONDS_PER_DAY, DiskCache

NOW = 1_800_000_000.0
RETENTION_DAYS = 60.0
RADAR_RETENTION_DAYS = 1.0
RETENTION_BY_KIND = {RADAR_KIND: RADAR_RETENTION_DAYS}
NEW_KIND = "elsewhere"
CONTENT = b"tile"
FRAME_DIRECTORY = "frame"


def cached(cache: DiskCache, kind: str, name: str, days_since_served: float) -> Path:
    """A file in the cache, as though a panel last asked for it `days_since_served` ago."""

    path = cache.directory(kind) / FRAME_DIRECTORY / name
    cache.write(path, CONTENT)

    moment = NOW - days_since_served * SECONDS_PER_DAY
    os.utime(path, (moment, moment))

    return path


def test_a_write_lands_whole_and_leaves_nothing_beside_it(tmp_path):
    cache = DiskCache(tmp_path)
    path = cache.directory(RADAR_KIND) / "tiles" / "a1b2c3" / "7" / "20" / "44.png"

    cache.write(path, CONTENT)

    assert path.read_bytes() == CONTENT
    assert list(path.parent.iterdir()) == [path]


def test_the_sweep_keeps_each_kind_for_its_own_retention(tmp_path):
    cache = DiskCache(tmp_path)
    stale_tile = cached(cache, RADAR_KIND, "stale.png", 2)
    fresh_tile = cached(cache, RADAR_KIND, "fresh.png", 0.5)
    stale_glyph = cached(cache, MAP_KIND, "stale.pbf", 61)
    fresh_glyph = cached(cache, MAP_KIND, "fresh.pbf", 30)

    removed = cache.sweep(RETENTION_DAYS, RETENTION_BY_KIND, now=NOW)

    assert removed == 2
    assert not stale_tile.exists()
    assert fresh_tile.exists()
    assert not stale_glyph.exists()
    assert fresh_glyph.exists()


def test_something_new_in_the_cache_is_kept_for_the_default(tmp_path):
    cache = DiskCache(tmp_path)
    kept = cached(cache, NEW_KIND, "kept", 30)
    gone = cached(cache, NEW_KIND, "gone", 61)

    cache.sweep(RETENTION_DAYS, RETENTION_BY_KIND, now=NOW)

    assert kept.exists()
    assert not gone.exists()


def test_serving_a_file_keeps_it_from_the_sweep(tmp_path):
    cache = DiskCache(tmp_path)
    tile = cached(cache, RADAR_KIND, "served.png", 2)

    cache.touch(tile)
    cache.sweep(RETENTION_DAYS, RETENTION_BY_KIND, now=time.time())

    assert tile.exists()


def test_the_sweep_clears_the_directories_it_empties_but_keeps_the_kinds_own(tmp_path):
    cache = DiskCache(tmp_path)
    tile = cached(cache, RADAR_KIND, "stale.png", 2)

    cache.sweep(RETENTION_DAYS, RETENTION_BY_KIND, now=NOW)

    assert not tile.parent.exists()
    assert cache.directory(RADAR_KIND).is_dir()


def test_there_is_nothing_to_sweep_before_anything_is_cached(tmp_path):
    assert DiskCache(tmp_path / "absent").sweep(RETENTION_DAYS, RETENTION_BY_KIND) == 0
