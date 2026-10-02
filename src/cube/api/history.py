"""An entity's recent states, as Home Assistant recorded them.

A panel sees each entity only as it is now; what it read a while ago lives in Home Assistant's
history. Only the entities the panel already subscribes to may be asked about, so this reaches
no further into the house than the state stream does, and no more than a day back.
"""

import logging
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from httpx import HTTPError

from cube.api.dependencies import CurrentHub

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

STATE_KEY = "state"
LAST_CHANGED_KEY = "last_changed"

DEFAULT_HISTORY_HOURS = 6
MAX_HISTORY_HOURS = 24

UNKNOWN_ENTITY_DETAIL = "Entity is not on this dashboard"
UPSTREAM_DETAIL = "Home Assistant did not give the history"


@router.get("/history/{entity_id}")
async def get_history(
    entity_id: str,
    hub: CurrentHub,
    hours: int = Query(default=DEFAULT_HISTORY_HOURS, ge=1, le=MAX_HISTORY_HOURS),
) -> dict[str, Any]:
    if entity_id not in hub.dashboard.allowed_entities:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=UNKNOWN_ENTITY_DETAIL)

    start = datetime.now().astimezone() - timedelta(hours=hours)

    try:
        series = await hub.rest.history(entity_id, start)
    except (HTTPError, TimeoutError) as error:
        logger.warning("Could not read the history of %s: %s", entity_id, error)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=UPSTREAM_DETAIL) from error

    return {"states": [{STATE_KEY: entry.get(STATE_KEY), LAST_CHANGED_KEY: entry.get(LAST_CHANGED_KEY)} for entry in series]}
