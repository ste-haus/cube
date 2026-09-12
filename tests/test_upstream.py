"""Fetching upstream no faster than a service allows, and only holding back the service that asks it.

A service that refuses what is over its limit costs the panels the tiles it refused, so the limit is
waited out rather than run into.
"""

import asyncio
import time

from cube.cache import DiskCache
from cube.upstream import RateLimit, Upstream

REQUESTS = 2
WINDOW_SECONDS = 0.2
ONE_OVER = REQUESTS + 1

LIMITED_DOMAIN = "limited.example"
LIMITED_URL = "https://tiles.limited.example/{n}.png"
UNLIMITED_URL = "https://free.example/{n}.png"


async def test_requests_within_the_limit_go_at_once():
    limit = RateLimit(REQUESTS, WINDOW_SECONDS)
    start = time.monotonic()

    for _ in range(REQUESTS):
        await limit.wait()

    assert time.monotonic() - start < WINDOW_SECONDS


async def test_one_over_the_limit_waits_for_room_rather_than_being_refused():
    limit = RateLimit(REQUESTS, WINDOW_SECONDS)
    start = time.monotonic()

    for _ in range(ONE_OVER):
        await limit.wait()

    assert time.monotonic() - start >= WINDOW_SECONDS


async def test_only_the_service_named_is_held_to_its_limit(tmp_path, fake_upstream):
    cache = DiskCache(tmp_path)
    upstream = Upstream(cache, fake_upstream.client(), {LIMITED_DOMAIN: RateLimit(REQUESTS, WINDOW_SECONDS)})

    start = time.monotonic()
    await asyncio.gather(*(upstream.cached(UNLIMITED_URL.format(n=n), tmp_path / f"free-{n}") for n in range(ONE_OVER)))
    unlimited = time.monotonic() - start

    start = time.monotonic()
    await asyncio.gather(
        *(upstream.cached(LIMITED_URL.format(n=n), tmp_path / f"limited-{n}") for n in range(ONE_OVER))
    )
    limited = time.monotonic() - start

    assert unlimited < WINDOW_SECONDS
    assert limited >= WINDOW_SECONDS
