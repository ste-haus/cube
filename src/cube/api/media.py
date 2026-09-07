"""Camera frames and floorplan assets, proxied from Home Assistant.

The panel never holds a Home Assistant token, so everything it renders has to come through
here. Only the camera and floorplans named in the dashboard config are reachable.
"""

import logging

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from httpx import HTTPError

from cube.api.dependencies import CurrentHub

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

CACHE_CONTROL_HEADER = "cache-control"
CACHE_CONTROL_TEMPLATE = "public, max-age={seconds}"

SVG_CONTENT_TYPE = "image/svg+xml"
CSS_CONTENT_TYPE = "text/css"

UNKNOWN_CAMERA_DETAIL = "Unknown camera"
UNKNOWN_FLOORPLAN_DETAIL = "Unknown floorplan"
NO_STYLESHEET_DETAIL = "No floorplan stylesheet is configured"
UPSTREAM_DETAIL = "Home Assistant did not return the asset"


@router.get("/camera/{entity_id}/snapshot")
async def camera_snapshot(entity_id: str, hub: CurrentHub) -> Response:
    _require_configured_camera(entity_id, hub)

    try:
        content, content_type = await hub.rest.camera_snapshot(entity_id)
    except HTTPError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=UPSTREAM_DETAIL) from error

    headers = {CACHE_CONTROL_HEADER: CACHE_CONTROL_TEMPLATE.format(seconds=hub.settings.camera_cache_seconds)}

    return Response(content=content, media_type=content_type, headers=headers)


@router.get("/camera/{entity_id}/stream")
async def camera_stream(entity_id: str, hub: CurrentHub) -> StreamingResponse:
    _require_configured_camera(entity_id, hub)

    frames = hub.rest.camera_stream(entity_id)

    try:
        first_chunk, content_type = await anext(frames)
    except StopAsyncIteration as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=UPSTREAM_DETAIL) from error
    except HTTPError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=UPSTREAM_DETAIL) from error

    async def body():
        yield first_chunk
        async for chunk, _ in frames:
            yield chunk

    return StreamingResponse(body(), media_type=content_type)


@router.get("/floorplan/{name}")
async def floorplan(name: str, hub: CurrentHub) -> Response:
    level = hub.dashboard.floorplans.get(name)
    if level is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=UNKNOWN_FLOORPLAN_DETAIL)

    path = hub.dashboard.assets.floorplan_path.format(image=level.image)

    return await _proxy_asset(hub, path, SVG_CONTENT_TYPE)


@router.get("/floorplan-styles.css")
async def floorplan_styles(hub: CurrentHub) -> Response:
    path = hub.dashboard.assets.stylesheet_path
    if not path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NO_STYLESHEET_DETAIL)

    return await _proxy_asset(hub, path, CSS_CONTENT_TYPE)


async def _proxy_asset(hub, path: str, fallback_content_type: str) -> Response:
    try:
        content, content_type = await hub.rest.asset(path)
    except HTTPError as error:
        logger.warning("Could not fetch %s: %s", path, error)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=UPSTREAM_DETAIL) from error

    headers = {CACHE_CONTROL_HEADER: CACHE_CONTROL_TEMPLATE.format(seconds=hub.settings.asset_cache_seconds)}

    return Response(content=content, media_type=content_type or fallback_content_type, headers=headers)


def _require_configured_camera(entity_id: str, hub) -> None:
    if hub.dashboard.camera is None or hub.dashboard.camera.entity_id != entity_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=UNKNOWN_CAMERA_DETAIL)
