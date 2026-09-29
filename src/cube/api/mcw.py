"""Clearing the master warning and master caution lights.

The panel names a tier and nothing else. The event and the service that fires it are fixed
here and in the config, so this cannot be turned into a way to fire any event Home Assistant
would accept from cube's token.
"""

import logging

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from cube.api.dependencies import CurrentHub
from cube.dashboard import AlertTier
from cube.hass.client import HassError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# Home Assistant only fires an event over its websocket for an admin token; pyscript's service
# fires one for any token allowed to call services.
FIRE_EVENT_DOMAIN = "pyscript"
FIRE_EVENT_SERVICE = "fire_event"
EVENT_TYPE_FIELD = "event_type"
EVENT_DATA_FIELD = "event_data"
TIER_FIELD = "tier"

NOT_CONFIGURED_DETAIL = "This dashboard has no master caution and warning"


class ClearRequest(BaseModel):
    tier: AlertTier


@router.post("/mcw/clear", status_code=status.HTTP_204_NO_CONTENT)
async def clear(request: ClearRequest, hub: CurrentHub) -> None:
    mcw = hub.dashboard.mcw
    if mcw is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_CONFIGURED_DETAIL)

    service_data = {EVENT_TYPE_FIELD: mcw.clear_event, EVENT_DATA_FIELD: {TIER_FIELD: request.tier.value}}

    try:
        await hub.client.call_service(FIRE_EVENT_DOMAIN, FIRE_EVENT_SERVICE, None, service_data)
    except (HassError, TimeoutError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error

    logger.info("Cleared master %s", request.tier.value)
