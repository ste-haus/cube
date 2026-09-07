"""Home Assistant websocket protocol.

Covers the handshake and the compressed payloads that `subscribe_entities` returns. That
subscription is deliberate: unlike `subscribe_events`, it asks for a named set of entities
and sends diffs rather than whole states, so one connection carries the panel's traffic
instead of the whole event bus.
"""

from typing import Any

TYPE = "type"
ID = "id"

AUTH_REQUIRED = "auth_required"
AUTH = "auth"
AUTH_OK = "auth_ok"
AUTH_INVALID = "auth_invalid"
RESULT = "result"
EVENT = "event"
PONG = "pong"

SUBSCRIBE_ENTITIES = "subscribe_entities"
CALL_SERVICE = "call_service"
PING = "ping"

ACCESS_TOKEN = "access_token"
ENTITY_IDS = "entity_ids"
SUCCESS = "success"
ERROR = "error"
MESSAGE = "message"

# Event payload sections.
ADDED = "a"
CHANGED = "c"
REMOVED = "r"

# Within a changed entity.
CHANGE_SET = "+"
CHANGE_UNSET = "-"

# Within a state.
STATE = "s"
ATTRIBUTES = "a"
LAST_CHANGED = "lc"
LAST_UPDATED = "lu"

EMPTY_STATE = {STATE: None, ATTRIBUTES: {}}


def authenticate(token: str) -> dict[str, Any]:
    return {TYPE: AUTH, ACCESS_TOKEN: token}


def subscribe(message_id: int, entity_ids: list[str]) -> dict[str, Any]:
    return {ID: message_id, TYPE: SUBSCRIBE_ENTITIES, ENTITY_IDS: entity_ids}


def call_service(message_id: int, domain: str, service: str, entity_id: str) -> dict[str, Any]:
    return {
        ID: message_id,
        TYPE: CALL_SERVICE,
        "domain": domain,
        "service": service,
        "target": {"entity_id": entity_id},
    }


def ping(message_id: int) -> dict[str, Any]:
    return {ID: message_id, TYPE: PING}


def apply_event(states: dict[str, dict[str, Any]], event: dict[str, Any]) -> set[str]:
    """Fold one `subscribe_entities` event into `states`, returning the ids it touched."""

    touched: set[str] = set()

    for entity_id, state in event.get(ADDED, {}).items():
        states[entity_id] = {
            STATE: state.get(STATE),
            ATTRIBUTES: dict(state.get(ATTRIBUTES, {})),
            LAST_CHANGED: state.get(LAST_CHANGED),
            LAST_UPDATED: state.get(LAST_UPDATED),
        }
        touched.add(entity_id)

    for entity_id, change in event.get(CHANGED, {}).items():
        current = states.setdefault(entity_id, dict(EMPTY_STATE) | {ATTRIBUTES: {}})
        _apply_change(current, change)
        touched.add(entity_id)

    for entity_id in event.get(REMOVED, []):
        states.pop(entity_id, None)
        touched.add(entity_id)

    return touched


def _apply_change(current: dict[str, Any], change: dict[str, Any]) -> None:
    unset = change.get(CHANGE_UNSET, {})
    for attribute in unset.get(ATTRIBUTES, []):
        current[ATTRIBUTES].pop(attribute, None)

    set_values = change.get(CHANGE_SET, {})
    if STATE in set_values:
        current[STATE] = set_values[STATE]
    if LAST_CHANGED in set_values:
        current[LAST_CHANGED] = set_values[LAST_CHANGED]
    if LAST_UPDATED in set_values:
        current[LAST_UPDATED] = set_values[LAST_UPDATED]

    current[ATTRIBUTES].update(set_values.get(ATTRIBUTES, {}))


PUBLIC_STATE = "state"
PUBLIC_ATTRIBUTES = "attributes"
PUBLIC_LAST_CHANGED = "last_changed"
PUBLIC_LAST_UPDATED = "last_updated"


def public_state(state: dict[str, Any] | None) -> dict[str, Any] | None:
    """Re-key a cached state into the long-form shape the browser consumes."""

    if state is None:
        return None

    return {
        PUBLIC_STATE: state.get(STATE),
        PUBLIC_ATTRIBUTES: state.get(ATTRIBUTES, {}),
        PUBLIC_LAST_CHANGED: state.get(LAST_CHANGED),
        PUBLIC_LAST_UPDATED: state.get(LAST_UPDATED),
    }


def public_states(states: dict[str, dict[str, Any] | None]) -> dict[str, Any]:
    return {entity_id: public_state(state) for entity_id, state in states.items()}
