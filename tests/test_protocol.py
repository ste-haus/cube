from cube.hass import protocol

ENTITY_ID = "light.example"


def test_added_entities_become_states():
    states = {}

    touched = protocol.apply_event(states, {"a": {ENTITY_ID: {"s": "on", "a": {"brightness": 12}, "lc": 1, "lu": 1}}})

    assert touched == {ENTITY_ID}
    assert states[ENTITY_ID]["s"] == "on"
    assert states[ENTITY_ID]["a"]["brightness"] == 12


def test_changes_merge_into_existing_attributes():
    states = {ENTITY_ID: {"s": "on", "a": {"brightness": 12}}}

    protocol.apply_event(states, {"c": {ENTITY_ID: {"+": {"s": "off", "a": {"rgb_color": [1, 2, 3]}}}}})

    assert states[ENTITY_ID]["s"] == "off"
    assert states[ENTITY_ID]["a"] == {"brightness": 12, "rgb_color": [1, 2, 3]}


def test_unset_removes_only_the_named_attributes():
    states = {ENTITY_ID: {"s": "on", "a": {"brightness": 12, "rgb_color": [1, 2, 3]}}}

    protocol.apply_event(states, {"c": {ENTITY_ID: {"-": {"a": ["brightness"]}}}})

    assert states[ENTITY_ID]["a"] == {"rgb_color": [1, 2, 3]}


def test_removed_entities_leave_the_cache():
    states = {ENTITY_ID: {"s": "on", "a": {}}}

    touched = protocol.apply_event(states, {"r": [ENTITY_ID]})

    assert states == {}
    assert touched == {ENTITY_ID}


def test_public_state_uses_long_keys():
    public = protocol.public_state({"s": "on", "a": {"brightness": 12}, "lc": 1, "lu": 2})

    assert public == {"state": "on", "attributes": {"brightness": 12}, "last_changed": 1, "last_updated": 2}


def test_added_state_without_last_changed_falls_back_to_last_updated():
    """Home Assistant omits `lc` from a full state when it equals `lu`, to save bytes."""

    states = {}

    protocol.apply_event(states, {"a": {ENTITY_ID: {"s": "on", "a": {}, "lu": 1710000000.0}}})

    assert states[ENTITY_ID]["lc"] == 1710000000.0
    assert states[ENTITY_ID]["lu"] == 1710000000.0


def test_added_state_keeps_a_distinct_last_changed():
    states = {}

    protocol.apply_event(states, {"a": {ENTITY_ID: {"s": "on", "a": {}, "lc": 1, "lu": 2}}})

    assert states[ENTITY_ID]["lc"] == 1


WEATHER_ENTITY_ID = "weather.example"
DAILY = {"type": "daily"}


def test_a_service_call_asks_for_no_answer_unless_told_to():
    """Home Assistant refuses a service that returns nothing when it is asked for a response."""

    message = protocol.call_service(1, "homeassistant", "toggle", ENTITY_ID)

    assert protocol.RETURN_RESPONSE not in message
    assert protocol.SERVICE_DATA not in message


def test_a_service_call_can_ask_for_its_answer():
    message = protocol.call_service(1, "weather", "get_forecasts", WEATHER_ENTITY_ID, DAILY, return_response=True)

    assert message[protocol.RETURN_RESPONSE] is True
    assert message[protocol.SERVICE_DATA] == DAILY


def test_the_answer_is_read_out_of_the_result():
    result = {
        "id": 1,
        "type": "result",
        "success": True,
        "result": {"context": {}, "response": {WEATHER_ENTITY_ID: {}}},
    }

    assert protocol.service_response(result) == {WEATHER_ENTITY_ID: {}}


def test_a_result_with_no_answer_reads_as_empty():
    assert protocol.service_response({"success": True, "result": None}) == {}
    assert protocol.service_response({"success": True}) == {}
