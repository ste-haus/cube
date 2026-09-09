"""Config and state endpoints.

`/api/config` hands the browser the whole dashboard definition, so no entity id, label, or
color is duplicated in the frontend.
"""

import logging
from typing import Any

from fastapi import APIRouter

from cube.api.dependencies import CurrentHub
from cube.dashboard import DEFAULT_PROFILE_KEY
from cube.hass import protocol

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

UNRESOLVED_PROFILE_MESSAGE = "No profile named %s; serving `%s`. Check the panel's `?profile=` against config.yaml."


@router.get("/config")
async def get_config(hub: CurrentHub, profile: str | None = None) -> dict[str, Any]:
    key = profile or hub.settings.profile
    resolved = hub.dashboard.profiles.get(key)

    # `default` is a template rather than a panel: it names no speaker, so an unrecognised key
    # gets a generic dashboard that raises no overlay rather than one impersonating a room.
    # The load-time validator guarantees it is there to fall back to.
    if resolved is None:
        logger.warning(UNRESOLVED_PROFILE_MESSAGE, key, DEFAULT_PROFILE_KEY)
        key = DEFAULT_PROFILE_KEY
        resolved = hub.dashboard.profiles[key]

    definition = hub.dashboard.model_dump(mode="json", exclude={"profiles"})
    definition["profile"] = resolved.model_dump(mode="json") | {"key": key}

    return definition


@router.get("/state")
async def get_state(hub: CurrentHub) -> dict[str, Any]:
    return {
        "connected": hub.client.connected,
        "states": protocol.public_states(hub.client.states),
    }
