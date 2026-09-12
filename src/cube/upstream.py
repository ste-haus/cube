"""Fetching from the public services behind the radar, once for the whole house.

A file is fetched only when the cache does not have it, and a request for one already on its way
waits for that fetch instead of starting another, so any number of panels asking for the same
tile at once cost the service a single request. No more than a handful are in flight at a time,
which is as many as a browser would open, and a service with a rate limit of its own is held to
one of cube's, which waits for room rather than being refused.
"""

import asyncio
import time
from collections import deque
from collections.abc import Mapping
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx

from cube.cache import DiskCache
from cube.config import Settings

# What MapLibre caps its own image requests at, and about what a browser opens to one host.
MAX_CONCURRENT_FETCHES = 16

USER_AGENT_HEADER = "user-agent"
USER_AGENT = "cube (+https://github.com/ste-haus/cube)"

NO_ANSWER_MESSAGE = "{url} did not answer: {error}"
STATUS_MESSAGE = "{url} answered {status}"
UNREADABLE_MESSAGE = "{url} sent something that is not JSON"

DOMAIN_SEPARATOR = "."
NO_HOST = ""


class RateLimit:
    """No more than `requests` in any `seconds`, waiting for room rather than being refused."""

    def __init__(self, requests: int, seconds: float) -> None:
        self._requests = requests
        self._seconds = seconds
        self._sent: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def wait(self) -> None:
        # Held while waiting, so whoever is behind waits their turn in the order they came.
        async with self._lock:
            self._forget(time.monotonic())

            if len(self._sent) >= self._requests:
                await asyncio.sleep(self._sent[0] + self._seconds - time.monotonic())
                self._forget(time.monotonic())

            self._sent.append(time.monotonic())

    def _forget(self, now: float) -> None:
        while self._sent and self._sent[0] <= now - self._seconds:
            self._sent.popleft()


class UpstreamError(Exception):
    """A service did not hand over what it was asked for. `status` is None when it never answered."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


def upstream_client(settings: Settings) -> httpx.AsyncClient:
    """The client for everything that is not Home Assistant, which is why it carries no token."""

    return httpx.AsyncClient(timeout=settings.request_timeout_seconds, headers={USER_AGENT_HEADER: USER_AGENT})


class Upstream:
    def __init__(
        self, cache: DiskCache, client: httpx.AsyncClient, rate_limits: Mapping[str, RateLimit] | None = None
    ) -> None:
        """`rate_limits` holds each domain named, and every host under it, to its limit."""

        self._cache = cache
        self._client = client
        self._limit = asyncio.Semaphore(MAX_CONCURRENT_FETCHES)
        self._rate_limits = dict(rate_limits or {})
        self._pending: dict[Path, asyncio.Task[Path]] = {}

    async def close(self) -> None:
        pending = list(self._pending.values())
        for task in pending:
            task.cancel()

        await asyncio.gather(*pending, return_exceptions=True)
        await self._client.aclose()

    async def document(self, url: str) -> Any:
        """A JSON document, fetched fresh, for a caller that keeps something made from it."""

        response = await self._get(url)

        try:
            return response.json()
        except ValueError as error:
            raise UpstreamError(UNREADABLE_MESSAGE.format(url=url), response.status_code) from error

    async def cached(self, url: str, path: Path, refresh: bool = False) -> Path:
        """`path`, fetched from `url` first when the cache does not have it or `refresh` asks."""

        if not refresh and path.is_file():
            return path

        task = self._pending.get(path)
        if task is None:
            task = asyncio.create_task(self._fetch(url, path))
            self._pending[path] = task
            task.add_done_callback(lambda done: self._settle(path, done))

        # Shielded, so one panel giving up on a tile does not take it from the others waiting.
        return await asyncio.shield(task)

    async def _fetch(self, url: str, path: Path) -> Path:
        response = await self._get(url)
        self._cache.write(path, response.content)

        return path

    async def _get(self, url: str) -> httpx.Response:
        # Waited out before taking a place in flight, so a limited service does not hold up the rest.
        await self._wait_for_room(url)

        async with self._limit:
            try:
                response = await self._client.get(url)
            except httpx.HTTPError as error:
                raise UpstreamError(NO_ANSWER_MESSAGE.format(url=url, error=error)) from error

        if response.status_code != httpx.codes.OK:
            raise UpstreamError(STATUS_MESSAGE.format(url=url, status=response.status_code), response.status_code)

        return response

    async def _wait_for_room(self, url: str) -> None:
        host = urlsplit(url).hostname or NO_HOST

        for domain, limit in self._rate_limits.items():
            if host == domain or host.endswith(f"{DOMAIN_SEPARATOR}{domain}"):
                await limit.wait()

    def _settle(self, path: Path, task: asyncio.Task[Path]) -> None:
        self._pending.pop(path, None)

        # Read here, so a failure nobody was left waiting on is not reported as never retrieved.
        if not task.cancelled():
            task.exception()
