"""Home Assistant REST access, for everything the websocket API does not carry.

Calendars, camera frames, announcement audio, and the floorplan assets all live behind HTTP.
Proxying the assets rather than vendoring them keeps the floorplan a single source of truth —
it stays where it is drawn and deployed — and keeps a picture of somebody's house out of this
repository.
"""

import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import urlsplit

import httpx

from cube.config import Settings

logger = logging.getLogger(__name__)

CALENDAR_PATH = "/api/calendars/{entity_id}"
CAMERA_SNAPSHOT_PATH = "/api/camera_proxy/{entity_id}"
CAMERA_STREAM_PATH = "/api/camera_proxy_stream/{entity_id}"
QUERIED_PATH_TEMPLATE = "{path}?{query}"

AUTHORIZATION_HEADER = "Authorization"
BEARER_PREFIX = "Bearer"
CONTENT_TYPE_HEADER = "content-type"
RANGE_HEADER = "range"

# Enough for the browser to seek within a clip and to know how long it is. The rest of what
# Home Assistant sends describes its own caching and does not survive the relay meaningfully.
RELAYED_MEDIA_HEADERS = ("content-type", "content-length", "content-range", "accept-ranges")

START_PARAM = "start"
END_PARAM = "end"

STREAM_CHUNK_BYTES = 8192


@dataclass(frozen=True)
class MediaMetadata:
    """What a relayed media response has to carry back before any of its body is written."""

    status_code: int
    headers: dict[str, str]


class HassRest:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = httpx.AsyncClient(
            base_url=settings.rest_base_url,
            headers={AUTHORIZATION_HEADER: f"{BEARER_PREFIX} {settings.ha_token}"},
            timeout=settings.request_timeout_seconds,
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def calendar_events(self, entity_id: str, start: datetime, end: datetime) -> list[dict[str, Any]]:
        response = await self._client.get(
            CALENDAR_PATH.format(entity_id=entity_id),
            params={START_PARAM: start.isoformat(), END_PARAM: end.isoformat()},
        )
        response.raise_for_status()

        return response.json()

    async def camera_snapshot(self, entity_id: str) -> tuple[bytes, str]:
        response = await self._client.get(CAMERA_SNAPSHOT_PATH.format(entity_id=entity_id))
        response.raise_for_status()

        return response.content, response.headers.get(CONTENT_TYPE_HEADER, "")

    async def camera_stream(self, entity_id: str) -> AsyncIterator[tuple[bytes, str]]:
        """Relay a camera's MJPEG stream, yielding its content type with the first chunk."""

        path = CAMERA_STREAM_PATH.format(entity_id=entity_id)

        async with self._client.stream("GET", path) as response:
            response.raise_for_status()
            content_type = response.headers.get(CONTENT_TYPE_HEADER, "")

            async for chunk in response.aiter_bytes(STREAM_CHUNK_BYTES):
                yield chunk, content_type

    async def media_stream(
        self, url: str, range_header: str | None = None
    ) -> AsyncIterator[tuple[bytes, MediaMetadata]]:
        """Relay a media file, yielding its status and headers alongside every chunk.

        Only the path and query are taken from `url`. The address Home Assistant published may
        name a hostname the instance has since been renamed away from, and the request carries
        this process's token, so it has to reach the configured instance and nothing else.
        """

        target = urlsplit(url)
        path = QUERIED_PATH_TEMPLATE.format(path=target.path, query=target.query) if target.query else target.path
        headers = {RANGE_HEADER: range_header} if range_header else {}

        async with self._client.stream("GET", path, headers=headers) as response:
            response.raise_for_status()

            metadata = MediaMetadata(
                status_code=response.status_code,
                headers={name: response.headers[name] for name in RELAYED_MEDIA_HEADERS if name in response.headers},
            )

            async for chunk in response.aiter_bytes(STREAM_CHUNK_BYTES):
                yield chunk, metadata
