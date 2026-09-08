"""The panel's only write path.

A request has to name an entity the dashboard actually renders as a control, in a domain the
config allows, before it reaches Home Assistant.
"""

import logging

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from cube.api.dependencies import CurrentHub
from cube.hass.client import HassError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

TOGGLE_DOMAIN = "homeassistant"
TOGGLE_SERVICE = "toggle"

FORBIDDEN_DETAIL = "Entity is not controllable from this dashboard"


class ToggleRequest(BaseModel):
    entity_id: str


@router.post("/toggle", status_code=status.HTTP_204_NO_CONTENT)
async def toggle(request: ToggleRequest, hub: CurrentHub) -> None:
    if not hub.dashboard.may_toggle(request.entity_id):
        logger.warning("Rejected toggle of %s", request.entity_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=FORBIDDEN_DETAIL)

    try:
        await hub.client.call_service(TOGGLE_DOMAIN, TOGGLE_SERVICE, request.entity_id)
    except (HassError, TimeoutError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
