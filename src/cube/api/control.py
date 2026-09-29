"""The panel's write paths.

A request has to name an entity some panel actually draws as a control, in a domain that
allows what is being asked, before it reaches Home Assistant.
"""

import logging
import re
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from cube.api.dependencies import CurrentHub
from cube.dashboard import domain_of
from cube.hass.client import HassError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

TOGGLE_DOMAIN = "homeassistant"
TOGGLE_SERVICE = "toggle"

FORBIDDEN_DETAIL = "Entity is not controllable from this dashboard"
INVALID_VALUE_DETAIL = "`{value}` is not something {entity_id} can be set to"

PERCENT_MIN = 0
PERCENT_MAX = 100
HUE_MAX = 360
# A time of day, to the minute or the second.
TIME_OF_DAY = re.compile(r"^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$")


class ToggleRequest(BaseModel):
    entity_id: str


class HueSaturation(BaseModel):
    """A light's colour: its hue round the wheel, and how far from white it is."""

    hue: float = Field(ge=0, le=HUE_MAX)
    saturation: float = Field(ge=PERCENT_MIN, le=PERCENT_MAX)


class XyPoint(BaseModel):
    """A light's colour as a point on the CIE chart, the way a light profile gives one."""

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


Value = int | str | HueSaturation | XyPoint


class SetRequest(BaseModel):
    entity_id: str
    value: Value


def _percent(value: Value) -> int | None:
    if isinstance(value, int) and PERCENT_MIN <= value <= PERCENT_MAX:
        return value

    return None


def _time_of_day(value: Value) -> str | None:
    if isinstance(value, str) and TIME_OF_DAY.match(value):
        return value

    return None


def _hue_saturation(value: Value) -> list[float] | None:
    if isinstance(value, HueSaturation):
        return [value.hue, value.saturation]

    return None


def _xy(value: Value) -> list[float] | None:
    if isinstance(value, XyPoint):
        return [value.x, value.y]

    return None


# By domain, each way a value can be set: the service it goes through, the field it is sent as,
# and what it has to be. The first that will take the value is the one used, so a light is dimmed
# by a percentage and coloured by a hue and saturation or by a point on the CIE chart.
SETTERS = {
    "light": (
        ("light", "turn_on", "brightness_pct", _percent),
        ("light", "turn_on", "hs_color", _hue_saturation),
        ("light", "turn_on", "xy_color", _xy),
    ),
    "cover": (("cover", "set_cover_position", "position", _percent),),
    "input_datetime": (("input_datetime", "set_datetime", "time", _time_of_day),),
}


@router.post("/toggle", status_code=status.HTTP_204_NO_CONTENT)
async def toggle(request: ToggleRequest, hub: CurrentHub) -> None:
    if not hub.dashboard.may_toggle(request.entity_id):
        logger.warning("Rejected toggle of %s", request.entity_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=FORBIDDEN_DETAIL)

    await _call(hub, TOGGLE_DOMAIN, TOGGLE_SERVICE, request.entity_id)


@router.post("/set", status_code=status.HTTP_204_NO_CONTENT)
async def set_value(request: SetRequest, hub: CurrentHub) -> None:
    """Sets a light's brightness or colour, a cover's position, or the time an `input_datetime` holds."""

    setters = SETTERS.get(domain_of(request.entity_id))
    if setters is None or not hub.dashboard.may_set(request.entity_id):
        logger.warning("Rejected setting %s", request.entity_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=FORBIDDEN_DETAIL)

    for domain, service, field, read in setters:
        value = read(request.value)
        if value is not None:
            await _call(hub, domain, service, request.entity_id, {field: value})
            return

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=INVALID_VALUE_DETAIL.format(value=request.value, entity_id=request.entity_id),
    )


async def _call(hub, domain: str, service: str, entity_id: str, service_data: dict[str, Any] | None = None) -> None:
    try:
        await hub.client.call_service(domain, service, entity_id, service_data)
    except (HassError, TimeoutError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
