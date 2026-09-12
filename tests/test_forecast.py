"""The forecast: which day or hour each entry is for, and what reaches the panel.

Providers stamp days differently, and the one mistake worth guarding against is a panel west
of Greenwich labelling every column with the day before.
"""

from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient

from cube.api.forecast import forecast_days, forecast_hours, local_date
from cube.app import create_app
from cube.dashboard import DEFAULT_FORECAST_HOURS
from cube.hass.client import HassError

OK = 200
BAD_GATEWAY = 502

# Matches `weather.entity_id` in the sample config.
SAMPLE_WEATHER = "weather.example"

FORECAST_DOMAIN = "weather"
FORECAST_SERVICE = "get_forecasts"
TYPE = "type"
DAILY = "daily"
HOURLY = "hourly"

TODAY = date(2026, 9, 10)
YESTERDAY = TODAY - timedelta(days=1)
LIMIT = 3

NOW = datetime(2026, 9, 10, 14, 30).astimezone()


def local_midnight(day: date) -> str:
    """How most providers stamp a day: the local midnight it starts at, in the local offset."""

    return datetime(day.year, day.month, day.day).astimezone().isoformat()


def entry(day: date, high: float = 71, low: float = 54) -> dict:
    return {
        "datetime": local_midnight(day),
        "condition": "sunny",
        "temperature": high,
        "templow": low,
        "precipitation_probability": 10,
    }


def hour(offset: int, temperature: float = 62, chance: float = 0) -> dict:
    """An hourly entry for the hour `offset` hours on from two o'clock today, stamped in UTC."""

    start = NOW.replace(minute=0) + timedelta(hours=offset)

    return {
        "datetime": start.astimezone(timezone.utc).isoformat(),
        "condition": "cloudy",
        "temperature": temperature,
        "precipitation_probability": chance,
    }


def test_a_local_midnight_is_the_day_it_starts():
    assert local_date(local_midnight(TODAY)) == TODAY


def test_a_local_midnight_written_in_utc_is_still_the_local_day():
    stamped = datetime(TODAY.year, TODAY.month, TODAY.day).astimezone().astimezone(timezone.utc).isoformat()

    assert local_date(stamped) == TODAY


def test_midnight_utc_is_taken_as_the_date_itself():
    """Read as a moment instead, it is the previous evening anywhere west of Greenwich."""

    assert local_date("2026-09-10T00:00:00+00:00") == TODAY
    assert local_date("2026-09-10T00:00:00Z") == TODAY


def test_a_bare_date_is_that_date():
    assert local_date("2026-09-10") == TODAY


def test_a_missing_or_unreadable_stamp_is_no_day_at_all():
    assert local_date(None) is None
    assert local_date("") is None
    assert local_date("not a date") is None


def test_days_already_gone_are_dropped():
    days = forecast_days([entry(YESTERDAY), entry(TODAY)], TODAY, LIMIT)

    assert [day["date"] for day in days] == [TODAY.isoformat()]


def test_the_week_stops_at_the_configured_length():
    raw = [entry(TODAY + timedelta(days=offset)) for offset in range(LIMIT + 2)]

    assert len(forecast_days(raw, TODAY, LIMIT)) == LIMIT


def test_an_entry_with_no_readable_day_costs_only_itself():
    raw = [{"datetime": "garbage", "temperature": 70}, entry(TODAY)]

    assert len(forecast_days(raw, TODAY, LIMIT)) == 1


def test_a_day_carries_its_high_and_low_under_their_own_names():
    [day] = forecast_days([entry(TODAY, high=71, low=54)], TODAY, LIMIT)

    assert day == {
        "date": TODAY.isoformat(),
        "condition": "sunny",
        "high": 71,
        "low": 54,
        "precipitation_probability": 10,
    }


def test_a_day_without_a_low_keeps_its_high():
    raw = [{"datetime": local_midnight(TODAY), "condition": "cloudy", "temperature": 64}]

    [day] = forecast_days(raw, TODAY, LIMIT)

    assert day["high"] == 64
    assert day["low"] is None


def test_the_hours_open_on_the_one_under_way():
    """At half past two, two o'clock is still going; one o'clock is over."""

    hours = forecast_hours([hour(-1), hour(0), hour(1)], NOW, LIMIT)

    # Each hour keeps the offset its provider wrote it in, so it is read back in local time.
    assert [datetime.fromisoformat(h["time"]).astimezone().hour for h in hours] == [NOW.hour, NOW.hour + 1]


def test_the_hours_stop_at_the_configured_length():
    raw = [hour(offset) for offset in range(LIMIT + 2)]

    assert len(forecast_hours(raw, NOW, LIMIT)) == LIMIT


def test_an_hour_carries_its_temperature_and_chance_of_rain():
    [first] = forecast_hours([hour(0, temperature=63, chance=30)], NOW, LIMIT)

    assert first["temperature"] == 63
    assert first["precipitation_probability"] == 30
    assert first["condition"] == "cloudy"


def test_an_hour_with_no_readable_time_costs_only_itself():
    raw = [{"datetime": "garbage", "temperature": 70}, hour(0)]

    assert len(forecast_hours(raw, NOW, LIMIT)) == 1


def by_kind(daily: list[dict], hourly: list[dict], asked: list | None = None):
    """Stands in for Home Assistant, answering each kind of forecast with its own entries."""

    async def query_service(domain, service, entity_id, service_data=None):
        if asked is not None:
            asked.append((domain, service, entity_id, service_data))

        return {SAMPLE_WEATHER: {"forecast": daily if service_data[TYPE] == DAILY else hourly}}

    return query_service


def test_the_forecast_is_asked_of_the_configured_weather_entity_by_the_day_and_the_hour(settings):
    asked: list[tuple] = []
    today = datetime.now().astimezone().date()

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.query_service = by_kind([entry(today)], [], asked)

        response = client.get("/api/forecast")

    assert response.status_code == OK
    assert sorted(asked, key=lambda call: call[3][TYPE]) == [
        (FORECAST_DOMAIN, FORECAST_SERVICE, SAMPLE_WEATHER, {TYPE: DAILY}),
        (FORECAST_DOMAIN, FORECAST_SERVICE, SAMPLE_WEATHER, {TYPE: HOURLY}),
    ]
    assert response.json()["days"][0]["date"] == today.isoformat()


def test_the_hours_reach_the_panel_beside_the_days(settings):
    now = datetime.now().astimezone().replace(minute=0, second=0, microsecond=0)
    hourly = [{"datetime": (now + timedelta(hours=offset)).isoformat(), "temperature": 60} for offset in range(2)]

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.query_service = by_kind([], hourly)

        response = client.get("/api/forecast")

    assert [h["temperature"] for h in response.json()["hours"]] == [60, 60]


def test_the_hours_run_from_the_one_under_way_to_as_many_after_it_as_configured(settings):
    """The sample config's `forecast_hours` is the default's own value."""

    now = datetime.now().astimezone().replace(minute=0, second=0, microsecond=0)
    hourly = [{"datetime": (now + timedelta(hours=offset)).isoformat(), "temperature": 60} for offset in range(40)]

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.query_service = by_kind([], hourly)

        response = client.get("/api/forecast")

    assert len(response.json()["hours"]) == DEFAULT_FORECAST_HOURS + 1


def test_an_unreachable_home_assistant_is_a_bad_gateway(settings):
    async def query_service(*arguments, **keywords):
        raise HassError("Not connected to Home Assistant")

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.query_service = query_service

        response = client.get("/api/forecast")

    assert response.status_code == BAD_GATEWAY


def test_a_weather_that_has_no_hours_still_has_its_week(settings):
    today = datetime.now().astimezone().date()

    async def query_service(domain, service, entity_id, service_data=None):
        if service_data[TYPE] == HOURLY:
            raise HassError("Weather entity does not support 'hourly' forecast")

        return {SAMPLE_WEATHER: {"forecast": [entry(today)]}}

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.query_service = query_service

        response = client.get("/api/forecast")

    assert response.status_code == OK
    assert response.json()["hours"] == []
    assert len(response.json()["days"]) == 1


def test_a_forecast_for_some_other_entity_reads_as_nothing(settings):
    async def query_service(domain, service, entity_id, service_data=None):
        return {"weather.somewhere_else": {"forecast": [entry(TODAY)]}}

    with TestClient(create_app(settings)) as client:
        client.app.state.hub.client.query_service = query_service

        response = client.get("/api/forecast")

    assert response.json() == {"days": [], "hours": []}
