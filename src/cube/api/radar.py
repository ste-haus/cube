"""The radar and its map, from cube's disk cache rather than from RainViewer and VersaTiles.

Every panel asks here, so the house fetches each tile and asset once however many panels there
are, and a public service's rate limit is spent by the house rather than by each panel. What is
fetched, and for how long it is kept, is for `cube.radar`, `cube.basemap`, and `cube.cache` to
say; this hands over what is on disk, and marks it as wanted so the sweep leaves it.
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from cube.api.dependencies import CurrentHub
from cube.basemap import UnknownAssetError
from cube.cache import SECONDS_PER_DAY
from cube.radar import UnknownTileError
from cube.upstream import UpstreamError

router = APIRouter(prefix="/api")

CACHE_CONTROL_HEADER = "cache-control"
MAX_AGE_TEMPLATE = "public, max-age={seconds}"
IMMUTABLE_TEMPLATE = "public, max-age={seconds}, immutable"
# The list changes with every new frame, so a panel asks afresh each time.
FRAMES_CACHE_CONTROL = "no-store"
# A frame's tiles never change, and RainViewer lets them be kept for two days.
TILE_MAX_AGE_SECONDS = 2 * SECONDS_PER_DAY
ASSET_MAX_AGE_SECONDS = SECONDS_PER_DAY

MEDIA_TYPES = {".json": "application/json", ".png": "image/png", ".pbf": "application/x-protobuf"}
DEFAULT_MEDIA_TYPE = "application/octet-stream"

UNKNOWN_TILE_DETAIL = "No such radar tile"
UNKNOWN_ASSET_DETAIL = "No such map asset"
RADAR_UPSTREAM_DETAIL = "RainViewer did not return the radar"
MAP_UPSTREAM_DETAIL = "VersaTiles did not return the map"


@router.get("/radar/frames")
async def radar_frames(hub: CurrentHub) -> FileResponse:
    if not hub.radar.frames_path.is_file():
        try:
            await hub.radar.refresh()
        except UpstreamError as error:
            raise _upstream_failure(error, RADAR_UPSTREAM_DETAIL) from error

    return _serve(hub, hub.radar.frames_path, FRAMES_CACHE_CONTROL)


@router.get("/radar/tiles/{frame}/{z}/{x}/{y}.png")
async def radar_tile(frame: str, z: int, x: int, y: int, hub: CurrentHub) -> FileResponse:
    try:
        path = await hub.radar.tile(frame, z, x, y)
    except UnknownTileError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=UNKNOWN_TILE_DETAIL) from error
    except UpstreamError as error:
        raise _upstream_failure(error, RADAR_UPSTREAM_DETAIL) from error

    return _serve(hub, path, IMMUTABLE_TEMPLATE.format(seconds=TILE_MAX_AGE_SECONDS))


@router.get("/map/style.json")
async def map_style(hub: CurrentHub) -> FileResponse:
    if not hub.basemap.style_path.is_file():
        try:
            await hub.basemap.refresh()
        except UpstreamError as error:
            raise _upstream_failure(error, MAP_UPSTREAM_DETAIL) from error

    return _serve(hub, hub.basemap.style_path, MAX_AGE_TEMPLATE.format(seconds=hub.settings.asset_cache_seconds))


@router.get("/map/{asset:path}")
async def map_asset(asset: str, hub: CurrentHub) -> FileResponse:
    try:
        path = await hub.basemap.asset(asset)
    except UnknownAssetError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=UNKNOWN_ASSET_DETAIL) from error
    except UpstreamError as error:
        raise _upstream_failure(error, MAP_UPSTREAM_DETAIL) from error

    return _serve(hub, path, MAX_AGE_TEMPLATE.format(seconds=ASSET_MAX_AGE_SECONDS))


def _serve(hub, path: Path, cache_control: str) -> FileResponse:
    hub.cache.touch(path)

    return FileResponse(
        path,
        media_type=MEDIA_TYPES.get(path.suffix, DEFAULT_MEDIA_TYPE),
        headers={CACHE_CONTROL_HEADER: cache_control},
    )


def _upstream_failure(error: UpstreamError, detail: str) -> HTTPException:
    """Not found when the service says there is no such thing; its fault, as a bad gateway, otherwise."""

    missing = error.status == status.HTTP_404_NOT_FOUND
    code = status.HTTP_404_NOT_FOUND if missing else status.HTTP_502_BAD_GATEWAY

    return HTTPException(status_code=code, detail=detail)
