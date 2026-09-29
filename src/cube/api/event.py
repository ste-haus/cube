"""Firing Home Assistant events from a panel.

A panel may fire only the events the config allows. Home Assistant only fires an event over
its websocket for an admin token, so the event goes through pyscript's service instead, which
any token allowed to call services may use.
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from cube.api.dependencies import CurrentHub
from cube.hass.client import HassError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

FIRE_EVENT_DOMAIN = "pyscript"
FIRE_EVENT_SERVICE = "fire_event"
EVENT_TYPE_FIELD = "event_type"
EVENT_DATA_FIELD = "event_data"

FORBIDDEN_DETAIL = "Event is not allowed from this dashboard"


class EventRequest(BaseModel):
    event_type: str
    event_data: dict[str, Any] = Field(default_factory=dict)


@router.post("/event", status_code=status.HTTP_204_NO_CONTENT)
async def fire(request: EventRequest, hub: CurrentHub) -> None:
    if not hub.dashboard.may_fire(request.event_type):
        logger.warning("Rejected event %s", request.event_type)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=FORBIDDEN_DETAIL)

    service_data = {EVENT_TYPE_FIELD: request.event_type, EVENT_DATA_FIELD: request.event_data}

    try:
        await hub.client.call_service(FIRE_EVENT_DOMAIN, FIRE_EVENT_SERVICE, None, service_data)
    except (HassError, TimeoutError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error

    logger.info("Fired %s", request.event_type)
