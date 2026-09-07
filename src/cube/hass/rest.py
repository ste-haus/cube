"""Home Assistant REST access, for everything the websocket API does not carry.

Calendars, camera frames, and the floorplan assets all live behind HTTP. Proxying the assets
rather than vendoring them keeps the floorplan a single source of truth — it stays where it
is drawn and deployed — and keeps a picture of somebody's house out of this repository.
"""

import logging
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

import httpx

from cube.config import Settings

logger = logging.getLogger(__name__)

CALENDAR_PATH = "/api/calendars/{entity_id}"
CAMERA_SNAPSHOT_PATH = "/api/camera_proxy/{entity_id}"
CAMERA_STREAM_PATH = "/api/camera_proxy_stream/{entity_id}"

AUTHORIZATION_HEADER = "Authorization"
BEARER_PREFIX = "Bearer"
CONTENT_TYPE_HEADER = "content-type"

START_PARAM = "start"
END_PARAM = "end"

STREAM_CHUNK_BYTES = 8192


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

    async def asset(self, path: str) -> tuple[bytes, str]:
        response = await self._client.get(path)
        response.raise_for_status()

        return response.content, response.headers.get(CONTENT_TYPE_HEADER, "")
