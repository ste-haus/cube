"""Camera frames and announcement audio from Home Assistant, and floorplan assets from disk.

The panel never holds a Home Assistant token, so camera frames come through here. Floorplans
are served from the resources directory instead: the drawings are only in Home Assistant to
support the dashboard this replaces, and a floorplan is a picture of somebody's home, so it is
mounted alongside the container rather than fetched or vendored.

Announcement audio is relayed for a different reason. The visualizer overlay reads the sound it
draws through the Web Audio API, and a browser will not hand a cross-origin recording to an
analyser without `Access-Control-Allow-Origin`, which Home Assistant does not send. Relaying it
puts the audio on the same origin as the page drawing it, which removes the question rather
than answering it, and keeps the signed media address Home Assistant published on this side.

Only the cameras, the floorplans, and the speakers named in the dashboard config are reachable.
"""

import logging
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from httpx import HTTPError

from cube.api.dependencies import CurrentHub
from cube.hass import protocol

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

ANNOUNCEMENT_AUDIO_PATH = "/announcement/{entity_id}/audio"

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

PLAYING_STATE = "playing"
MEDIA_CONTENT_ID_ATTRIBUTE = "media_content_id"

RANGE_HEADER = "range"

UNKNOWN_CAMERA_DETAIL = "Unknown camera"
UNKNOWN_FLOORPLAN_DETAIL = "Unknown floorplan"
MISSING_FLOORPLAN_DETAIL = "No drawing for this floorplan in the resources directory"
UPSTREAM_DETAIL = "Home Assistant did not return the camera frame"

NO_VISUALIZER_DETAIL = "No visualizer configured"
UNKNOWN_MEDIA_PLAYER_DETAIL = "Unknown media player"
NO_ANNOUNCEMENT_DETAIL = "No announcement playing on this media player"
ANNOUNCEMENT_UPSTREAM_DETAIL = "Home Assistant did not return the announcement audio"


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


@router.get(ANNOUNCEMENT_AUDIO_PATH)
async def announcement_audio(entity_id: str, content: str, request: Request, hub: CurrentHub) -> StreamingResponse:
    """Relay the announcement a configured speaker is playing right now.

    `content` is the path of that announcement, which the caller already knows because it came
    down the state stream. Requiring it to match makes the address unique per announcement, so
    neither the browser nor the iframe serves the previous clip out of cache, and it keeps a
    panel from asking for whatever played a moment ago.
    """

    media_content_id = _require_current_announcement(entity_id, content, hub)

    chunks = hub.rest.media_stream(media_content_id, request.headers.get(RANGE_HEADER))

    try:
        first_chunk, metadata = await anext(chunks)
    except StopAsyncIteration as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=ANNOUNCEMENT_UPSTREAM_DETAIL) from error
    except HTTPError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=ANNOUNCEMENT_UPSTREAM_DETAIL) from error

    async def body():
        yield first_chunk
        async for chunk, _ in chunks:
            yield chunk

    return StreamingResponse(body(), status_code=metadata.status_code, headers=metadata.headers)


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
    """Resolve whether a frame may be fetched at all, from the config rather than the request.

    Cameras reach a panel two ways — the dashboard's camera card, and the camera faces — so the
    set is the union of both. Anything not named in `config.yaml` is unreachable through here.
    """

    if entity_id not in hub.dashboard.camera_entities:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=UNKNOWN_CAMERA_DETAIL)


def _require_current_announcement(entity_id: str, content: str, hub) -> str:
    """Resolve what the relay is allowed to fetch, from state rather than from the request.

    The address comes out of this process's own view of Home Assistant, so the endpoint relays
    an announcement a watched speaker is playing or it relays nothing. Nothing a panel sends
    can widen that: `content` is only ever compared against what is already playing.
    """

    visualizer = hub.dashboard.visualizer
    if visualizer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NO_VISUALIZER_DETAIL)

    if entity_id not in hub.dashboard.media_players:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=UNKNOWN_MEDIA_PLAYER_DETAIL)

    state = hub.client.states.get(entity_id, {})
    media_content_id = state.get(protocol.ATTRIBUTES, {}).get(MEDIA_CONTENT_ID_ATTRIBUTE)

    playing = state.get(protocol.STATE) == PLAYING_STATE
    announcement = bool(media_content_id) and visualizer.content_marker in media_content_id

    if not playing or not announcement or urlsplit(media_content_id).path != content:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NO_ANNOUNCEMENT_DETAIL)

    return media_content_id
