"""Config and state endpoints.

`/api/config` hands the browser the whole dashboard definition, so no entity id, label, or
color is duplicated in the frontend.
"""

from typing import Any

from fastapi import APIRouter, HTTPException, status

from cube.api.dependencies import CurrentHub
from cube.hass import protocol

router = APIRouter(prefix="/api")

UNKNOWN_PROFILE_DETAIL = "Unknown profile"
DEFAULT_PROFILE_KEY = "default"


@router.get("/config")
async def get_config(hub: CurrentHub, profile: str | None = None) -> dict[str, Any]:
    key = profile or hub.settings.profile
    resolved = hub.dashboard.profiles.get(key) or hub.dashboard.profiles.get(DEFAULT_PROFILE_KEY)

    if resolved is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=UNKNOWN_PROFILE_DETAIL)

    definition = hub.dashboard.model_dump(mode="json", exclude={"profiles"})
    definition["profile"] = resolved.model_dump(mode="json") | {"key": key}

    return definition


@router.get("/state")
async def get_state(hub: CurrentHub) -> dict[str, Any]:
    return {
        "connected": hub.client.connected,
        "states": protocol.public_states(hub.client.states),
    }
