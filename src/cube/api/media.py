"""Camera frames from Home Assistant, and floorplan assets from disk.

The panel never holds a Home Assistant token, so camera frames come through here. Floorplans
are served from the resources directory instead: the drawings are only in Home Assistant to
support the dashboard this replaces, and a floorplan is a picture of somebody's home, so it is
mounted alongside the container rather than fetched or vendored.

Only the camera and floorplans named in the dashboard config are reachable either way.
"""

import logging
from pathlib import Path

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

FLOORPLAN_DIRECTORY = "floorplans"
SVG_SUFFIX = ".svg"
STYLESHEET_NAME = "floorplan.css"
ICONS_NAME = "icons.json"

JSON_CONTENT_TYPE = "application/json"
EMPTY_JSON_OBJECT = "{}"

UNKNOWN_CAMERA_DETAIL = "Unknown camera"
UNKNOWN_FLOORPLAN_DETAIL = "Unknown floorplan"
MISSING_FLOORPLAN_DETAIL = "No drawing for this floorplan in the resources directory"
UPSTREAM_DETAIL = "Home Assistant did not return the camera frame"


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

    path = hub.settings.resources_path / FLOORPLAN_DIRECTORY / f"{level.image}{SVG_SUFFIX}"
    if not _within_resources(path, hub) or not path.is_file():
        logger.warning("No floorplan drawing at %s", path)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=MISSING_FLOORPLAN_DETAIL)

    return _serve(path, SVG_CONTENT_TYPE, hub)


@router.get("/floorplan-styles.css")
async def floorplan_styles(hub: CurrentHub) -> Response:
    """Installation-specific floorplan rules.

    The generic class contract ships with the bundle; this is only the overrides an
    installation adds for its own rooms and fixtures, and is empty when there are none.
    """

    path = hub.settings.resources_path / STYLESHEET_NAME
    if not path.is_file():
        return Response(content="", media_type=CSS_CONTENT_TYPE)

    return _serve(path, CSS_CONTENT_TYPE, hub)


@router.get("/icons")
async def icons(hub: CurrentHub) -> Response:
    """An installation's own icon set, as a map of name to SVG path.

    Home Assistant setups often carry a custom iconset for things no standard set covers. It
    lives in the resources directory because it is theirs, not the panel's, and may hold marks
    that have no business in a published image.
    """

    path = hub.settings.resources_path / ICONS_NAME
    if not path.is_file():
        return Response(content=EMPTY_JSON_OBJECT, media_type=JSON_CONTENT_TYPE)

    return _serve(path, JSON_CONTENT_TYPE, hub)


def _serve(path: Path, content_type: str, hub) -> Response:
    headers = {CACHE_CONTROL_HEADER: CACHE_CONTROL_TEMPLATE.format(seconds=hub.settings.asset_cache_seconds)}

    return Response(content=path.read_bytes(), media_type=content_type, headers=headers)


def _within_resources(path: Path, hub) -> bool:
    """Guards against a configured image name escaping the resources directory."""

    return hub.settings.resources_path.resolve() in path.resolve().parents


def _require_configured_camera(entity_id: str, hub) -> None:
    if hub.dashboard.camera is None or hub.dashboard.camera.entity_id != entity_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=UNKNOWN_CAMERA_DETAIL)
