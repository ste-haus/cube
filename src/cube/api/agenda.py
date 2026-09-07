"""The agenda.

Home Assistant exposes one endpoint per calendar, so the merge, the blocklist filter, and the
sort happen here rather than in the browser.
"""

import logging
import re
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter
from httpx import HTTPError

from cube.api.dependencies import CurrentHub
from cube.dashboard import Calendar

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

SUMMARY_KEY = "summary"
START_KEY = "start"
END_KEY = "end"
LOCATION_KEY = "location"
DATE_KEY = "date"
DATE_TIME_KEY = "dateTime"

CALENDAR_KEY = "calendar"
COLOR_KEY = "color"
ALL_DAY_KEY = "all_day"

MIDNIGHT = {"hour": 0, "minute": 0, "second": 0, "microsecond": 0}


@router.get("/agenda")
async def get_agenda(hub: CurrentHub) -> dict[str, Any]:
    start = datetime.now().astimezone().replace(**MIDNIGHT)
    end = start + timedelta(days=hub.dashboard.agenda.days)

    events: list[dict[str, Any]] = []
    for calendar in hub.dashboard.agenda.calendars:
        events.extend(await _events_for(hub, calendar, start, end))

    events.sort(key=lambda event: (not event[ALL_DAY_KEY], event[START_KEY]))

    return {"events": events}


async def _events_for(hub, calendar: Calendar, start: datetime, end: datetime) -> list[dict[str, Any]]:
    try:
        raw = await hub.rest.calendar_events(calendar.entity_id, start, end)
    except HTTPError as error:
        # One unreachable calendar should cost its own events, not the whole agenda.
        logger.warning("Could not load %s: %s", calendar.entity_id, error)

        return []

    blocked = re.compile(calendar.blocklist, re.IGNORECASE) if calendar.blocklist else None

    events = []
    for event in raw:
        summary = event.get(SUMMARY_KEY, "")
        if blocked and blocked.search(summary):
            continue

        starts_at = event.get(START_KEY, {})
        ends_at = event.get(END_KEY, {})
        all_day = DATE_KEY in starts_at

        events.append(
            {
                SUMMARY_KEY: summary,
                LOCATION_KEY: event.get(LOCATION_KEY),
                START_KEY: starts_at.get(DATE_TIME_KEY) or starts_at.get(DATE_KEY),
                END_KEY: ends_at.get(DATE_TIME_KEY) or ends_at.get(DATE_KEY),
                ALL_DAY_KEY: all_day,
                CALENDAR_KEY: calendar.name,
                COLOR_KEY: calendar.color,
            }
        )

    return events
