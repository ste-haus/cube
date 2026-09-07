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
