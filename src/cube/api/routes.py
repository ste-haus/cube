"""Rebuild only routes currently listed by a configured travel map."""

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from cube.api.dependencies import CurrentHub
from cube.hass import protocol
from cube.hass.client import HassError

router = APIRouter(prefix="/api")

TOOLS_OPTION = "route_tools"
ENTITY_FIELD = "entity_id"
TRIPS_FIELD = "trips"
TRIP_FIELD = "trip"
LIVE_STATE = "on"
SERVICE_DOMAIN = "pyscript"
REGENERATE_SERVICE = "traffic_base_regenerate"
REGENERATE_TIMEOUT_SECONDS = 90
FORBIDDEN_DETAIL = "Route is not displayed by a configured travel map"
ERROR_FIELD = "error"
OK_FIELD = "ok"


class RegenerateRequest(BaseModel):
    entity_id: str
    trip: str


@router.post("/travel-routes/regenerate")
async def regenerate(request: RegenerateRequest, hub: CurrentHub) -> dict[str, Any]:
    allowed = any(
        face.options.get(TOOLS_OPTION, {}).get(ENTITY_FIELD) == request.entity_id
        for profile in hub.dashboard.profiles.values()
        for face in profile.faces.values()
        if face.options.get(TOOLS_OPTION)
    )
    entity = hub.client.states.get(request.entity_id) or {}
    displayed = entity.get(protocol.ATTRIBUTES, {}).get(TRIPS_FIELD, [])

    if not allowed or entity.get(protocol.STATE) != LIVE_STATE or request.trip not in displayed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=FORBIDDEN_DETAIL)

    try:
        result = await hub.client.query_service(
            SERVICE_DOMAIN,
            REGENERATE_SERVICE,
            None,
            {TRIP_FIELD: request.trip},
            timeout_seconds=REGENERATE_TIMEOUT_SECONDS,
        )
    except (HassError, TimeoutError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error

    if not result.get(OK_FIELD):
        # Empty rather than None, which FastAPI would fill with "Bad Gateway": the panel says it failed
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=result.get(ERROR_FIELD) or "")

    return result
