"""The forecast, by the day and by the hour.

Home Assistant stopped carrying forecasts in entity state, so they are not in anything the
subscription sees; they are asked for with `weather.get_forecasts` instead. The dates are
settled here rather than in the browser, alongside the agenda's, because the provider decides
how a day is stamped and that is not something every panel should have to know.
"""

import asyncio
import logging
from datetime import date, datetime, time, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, status

from cube.api.dependencies import CurrentHub
from cube.hass.client import HassError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

FORECAST_DOMAIN = "weather"
FORECAST_SERVICE = "get_forecasts"
FORECAST_TYPE_KEY = "type"
DAILY_FORECAST = "daily"
HOURLY_FORECAST = "hourly"
FORECAST_KEY = "forecast"

DATETIME_KEY = "datetime"
CONDITION_KEY = "condition"
TEMPERATURE_KEY = "temperature"
TEMPLOW_KEY = "templow"
PRECIPITATION_PROBABILITY_KEY = "precipitation_probability"

DATE_KEY = "date"
TIME_KEY = "time"
HIGH_KEY = "high"
LOW_KEY = "low"

NO_WEATHER_DETAIL = "No weather is configured"

UTC_OFFSET = timedelta(0)
ONE_HOUR = timedelta(hours=1)

# What a forecast that Home Assistant could not give looks like from here. Anything else is a bug,
# and is left to surface as one rather than passed off as the upstream's fault.
UPSTREAM_ERRORS = (HassError, TimeoutError)


@router.get("/forecast")
async def get_forecast(hub: CurrentHub) -> dict[str, Any]:
    weather = hub.dashboard.weather
    if weather is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NO_WEATHER_DETAIL)

    daily, hourly = await asyncio.gather(
        _forecast(hub, weather.entity_id, DAILY_FORECAST),
        _forecast(hub, weather.entity_id, HOURLY_FORECAST),
        return_exceptions=True,
    )

    if isinstance(daily, BaseException):
        if not isinstance(daily, UPSTREAM_ERRORS):
            raise daily

        logger.warning("Could not load the forecast for %s: %s", weather.entity_id, daily)

        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(daily)) from daily

    if isinstance(hourly, BaseException):
        if not isinstance(hourly, UPSTREAM_ERRORS):
            raise hourly

        # Not every weather integration forecasts by the hour, and the week stands without it.
        logger.warning("No hourly forecast for %s: %s", weather.entity_id, hourly)
        hourly = []

    now = datetime.now().astimezone()

    return {
        "days": forecast_days(daily, now.date(), weather.forecast_days),
        # The hour under way, and as many after it as the forecast runs to.
        "hours": forecast_hours(hourly, now, weather.forecast_hours + 1),
    }


async def _forecast(hub, entity_id: str, kind: str) -> list[dict[str, Any]]:
    response = await hub.client.query_service(
        FORECAST_DOMAIN,
        FORECAST_SERVICE,
        entity_id,
        {FORECAST_TYPE_KEY: kind},
    )

    return response.get(entity_id, {}).get(FORECAST_KEY, [])


def forecast_days(raw: list[dict[str, Any]], today: date, limit: int) -> list[dict[str, Any]]:
    """The days from today on, each settled to the local date it forecasts."""

    days = []
    for entry in raw:
        day = local_date(entry.get(DATETIME_KEY))

        # Some providers lead with yesterday until their next run; it has no place in a week ahead.
        if day is None or day < today:
            continue

        days.append(
            {
                DATE_KEY: day.isoformat(),
                CONDITION_KEY: entry.get(CONDITION_KEY),
                HIGH_KEY: entry.get(TEMPERATURE_KEY),
                LOW_KEY: entry.get(TEMPLOW_KEY),
                PRECIPITATION_PROBABILITY_KEY: entry.get(PRECIPITATION_PROBABILITY_KEY),
            }
        )

        if len(days) == limit:
            break

    return days


def forecast_hours(raw: list[dict[str, Any]], now: datetime, limit: int) -> list[dict[str, Any]]:
    """The hours from the one under way on.

    An hour counts until it is over, so at half past two the forecast still opens on two o'clock;
    a forecast that opened on three would say nothing about the rest of this one.
    """

    hours = []
    for entry in raw:
        moment = local_moment(entry.get(DATETIME_KEY))
        if moment is None or moment + ONE_HOUR <= now:
            continue

        hours.append(
            {
                TIME_KEY: moment.isoformat(),
                CONDITION_KEY: entry.get(CONDITION_KEY),
                TEMPERATURE_KEY: entry.get(TEMPERATURE_KEY),
                PRECIPITATION_PROBABILITY_KEY: entry.get(PRECIPITATION_PROBABILITY_KEY),
            }
        )

        if len(hours) == limit:
            break

    return hours


def local_moment(moment: str | None) -> datetime | None:
    """A forecast entry's moment, with a timezone; a stamp that names none is read as local."""

    if not moment:
        return None

    try:
        parsed = datetime.fromisoformat(moment)
    except ValueError:
        return None

    return parsed if parsed.tzinfo is not None else parsed.astimezone()


def local_date(moment: str | None) -> date | None:
    """The day a forecast entry is for, where the panel is.

    Providers disagree about how to stamp a day. Most give the local midnight it starts at, in
    whatever offset, and converting that to local time is the answer. Some give midnight UTC
    and mean the date itself, which read the same way is the evening before anywhere west of
    Greenwich — so exactly midnight UTC is taken at its word.
    """

    if not moment:
        return None

    try:
        parsed = datetime.fromisoformat(moment)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.date()

    if parsed.utcoffset() == UTC_OFFSET and parsed.time() == time.min:
        return parsed.date()

    return parsed.astimezone().date()
