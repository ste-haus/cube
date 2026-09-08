"""The agenda's window and filtering.

Day boundaries are local, and one malformed event should not cost the whole day.
"""

from datetime import datetime, time, timedelta

from cube.api.agenda import _at_or_before, _hidden

SUMMARY = "summary"
ALL_DAY = "all_day"
START = "start"


def window_start() -> datetime:
    return datetime.combine(datetime.now().astimezone().date(), time.min).astimezone()


def test_a_bare_date_is_read_as_local_midnight():
    """Read as UTC instead, an all-day event ends mid-afternoon west of Greenwich."""

    start = window_start()
    today = start.date().isoformat()
    tomorrow = (start.date() + timedelta(days=1)).isoformat()

    assert _at_or_before(today, start) is True
    assert _at_or_before(tomorrow, start) is False


def test_moments_before_the_window_are_recognised():
    start = window_start()

    assert _at_or_before((start - timedelta(hours=1)).isoformat(), start) is True
    assert _at_or_before((start + timedelta(hours=1)).isoformat(), start) is False


def test_missing_and_unparseable_moments_are_not_treated_as_past():
    start = window_start()

    assert _at_or_before(None, start) is False
    assert _at_or_before("not a date", start) is False


def test_hidden_prefixes_match_regardless_of_case():
    prefixes = ("canceled", "cancelled")

    assert _hidden({SUMMARY: "Canceled: stand-up"}, prefixes) is True
    assert _hidden({SUMMARY: "CANCELLED lunch"}, prefixes) is True
    assert _hidden({SUMMARY: "Cancellation policy"}, prefixes) is False
    assert _hidden({SUMMARY: "Stand-up"}, prefixes) is False


def test_nothing_is_hidden_without_prefixes():
    assert _hidden({SUMMARY: "Canceled: stand-up"}, ()) is False


def test_an_event_missing_a_start_does_not_break_the_sort():
    """A malformed event should cost its own row, not every calendar's."""

    events = [
        {ALL_DAY: False, START: "2026-09-07T10:00:00-07:00"},
        {ALL_DAY: False, START: None},
        {ALL_DAY: True, START: "2026-09-07"},
    ]

    events.sort(key=lambda event: (not event[ALL_DAY], event[START] or ""))

    assert events[0][ALL_DAY] is True
