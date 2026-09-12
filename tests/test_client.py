"""The websocket client against a stand-in Home Assistant.

Covers the handshake and the compressed-diff path end to end, which is the part that would
otherwise only be exercised against a live instance.
"""

import asyncio
import json

import pytest
import websockets

from cube.config import Settings
from cube.hass import protocol
from cube.hass.client import HassClient

ENTITY_ID = "light.example"
OTHER_ENTITY_ID = "sensor.example"

TOKEN = "test-token"
READY_TIMEOUT_SECONDS = 5.0
RECONNECT_TIMEOUT_SECONDS = 15.0
UPDATE_TIMEOUT_SECONDS = 5.0

LOCALHOST = "127.0.0.1"
EPHEMERAL_PORT = 0

TOGGLE_DOMAIN = "homeassistant"
TOGGLE_SERVICE = "toggle"


class StubHomeAssistant:
    """Speaks just enough of the protocol to drive the client."""

    def __init__(self) -> None:
        self.url = ""
        self.connections = 0
        self.initial_states: dict[str, dict] = {}
        self.subscribed: list[str] = []
        self.calls: list[dict] = []
        self.response: dict = {}
        self._connection = None
        self._subscription_id = 0
        self._ready = asyncio.Event()

    async def handle(self, connection) -> None:
        self._connection = connection
        self.connections += 1

        await connection.send(json.dumps({protocol.TYPE: protocol.AUTH_REQUIRED}))

        auth = json.loads(await connection.recv())
        if auth.get(protocol.ACCESS_TOKEN) != TOKEN:
            await connection.send(json.dumps({protocol.TYPE: protocol.AUTH_INVALID}))

            return

        await connection.send(json.dumps({protocol.TYPE: protocol.AUTH_OK}))

        async for raw in connection:
            await self._dispatch(connection, json.loads(raw))

    async def _dispatch(self, connection, message: dict) -> None:
        message_type = message.get(protocol.TYPE)
        message_id = message.get(protocol.ID)

        if message_type == protocol.SUBSCRIBE_ENTITIES:
            self.subscribed = message.get(protocol.ENTITY_IDS, [])
            self._subscription_id = message_id
            await self._result(connection, message_id)

            # Real Home Assistant sends the initial states immediately behind the result.
            await connection.send(
                json.dumps(
                    {
                        protocol.ID: message_id,
                        protocol.TYPE: protocol.EVENT,
                        protocol.EVENT: {protocol.ADDED: self.initial_states},
                    }
                )
            )
            self._ready.set()
        elif message_type == protocol.CALL_SERVICE:
            self.calls.append(message)

            if message.get(protocol.RETURN_RESPONSE):
                await connection.send(
                    json.dumps(
                        {
                            protocol.ID: message_id,
                            protocol.TYPE: protocol.RESULT,
                            protocol.SUCCESS: True,
                            protocol.RESULT_PAYLOAD: {protocol.RESPONSE: self.response},
                        }
                    )
                )
            else:
                await self._result(connection, message_id)

    async def _result(self, connection, message_id: int) -> None:
        await connection.send(
            json.dumps({protocol.ID: message_id, protocol.TYPE: protocol.RESULT, protocol.SUCCESS: True})
        )

    async def drop(self) -> None:
        """Close the connection the way a network does: without warning."""

        self._ready.clear()
        await self._connection.close()

    async def send_event(self, event: dict) -> None:
        await self._ready.wait()
        await self._connection.send(
            json.dumps({protocol.ID: self._subscription_id, protocol.TYPE: protocol.EVENT, protocol.EVENT: event})
        )


@pytest.fixture
async def stub():
    upstream = StubHomeAssistant()

    async with websockets.serve(upstream.handle, LOCALHOST, EPHEMERAL_PORT) as server:
        port = server.sockets[0].getsockname()[1]
        upstream.url = f"http://{LOCALHOST}:{port}"

        yield upstream


@pytest.fixture
async def client(stub, tmp_path):
    stub.initial_states = {
        ENTITY_ID: {protocol.STATE: "on", protocol.ATTRIBUTES: {"brightness": 5}},
        OTHER_ENTITY_ID: {protocol.STATE: "42", protocol.ATTRIBUTES: {}},
    }

    settings = Settings(ha_url=stub.url, ha_token=TOKEN, dashboard_path=tmp_path / "unused.yaml")
    connection = HassClient(settings, frozenset({ENTITY_ID, OTHER_ENTITY_ID}))

    await connection.start()
    try:
        yield connection
    finally:
        await connection.stop()


async def wait_for(predicate, timeout: float) -> None:
    async def poll():
        while not predicate():
            await asyncio.sleep(0)

    await asyncio.wait_for(poll(), timeout=timeout)


async def test_client_authenticates_and_subscribes_to_the_allowlist(stub, client):
    await wait_for(lambda: client.connected, READY_TIMEOUT_SECONDS)

    assert sorted(stub.subscribed) == sorted([ENTITY_ID, OTHER_ENTITY_ID])


async def test_initial_states_survive_the_subscription(client):
    """The states arriving behind the subscription result must not be cleared by it."""

    await wait_for(lambda: ENTITY_ID in client.states, READY_TIMEOUT_SECONDS)

    assert client.states[ENTITY_ID][protocol.STATE] == "on"
    assert client.states[ENTITY_ID][protocol.ATTRIBUTES]["brightness"] == 5
    assert client.states[OTHER_ENTITY_ID][protocol.STATE] == "42"


async def test_subscribers_receive_deltas(stub, client):
    # Wait out the initial states so the queue only carries the deltas under test.
    await wait_for(lambda: ENTITY_ID in client.states, READY_TIMEOUT_SECONDS)

    async with client.subscribe() as queue:
        await stub.send_event({protocol.ADDED: {ENTITY_ID: {protocol.STATE: "off", protocol.ATTRIBUTES: {}}}})
        update = await asyncio.wait_for(queue.get(), timeout=UPDATE_TIMEOUT_SECONDS)

        assert update[ENTITY_ID][protocol.STATE] == "off"

        await stub.send_event({protocol.CHANGED: {ENTITY_ID: {protocol.CHANGE_SET: {protocol.STATE: "on"}}}})
        update = await asyncio.wait_for(queue.get(), timeout=UPDATE_TIMEOUT_SECONDS)

        assert update[ENTITY_ID][protocol.STATE] == "on"


async def test_stopping_clears_the_connected_flag(client):
    """A stopped client must not go on claiming a connection it no longer has."""

    await wait_for(lambda: client.connected, READY_TIMEOUT_SECONDS)

    await client.stop()

    assert client.connected is False


async def test_the_client_comes_back_after_the_connection_drops(stub, client):
    """The one thing this client must never stop doing."""

    await wait_for(lambda: ENTITY_ID in client.states, READY_TIMEOUT_SECONDS)
    first = stub.connections

    await stub.drop()
    await wait_for(lambda: client.connected, RECONNECT_TIMEOUT_SECONDS)
    await wait_for(lambda: ENTITY_ID in client.states, RECONNECT_TIMEOUT_SECONDS)

    assert stub.connections > first


async def test_service_calls_reach_home_assistant(stub, client):
    await wait_for(lambda: client.connected, READY_TIMEOUT_SECONDS)

    await client.call_service(TOGGLE_DOMAIN, TOGGLE_SERVICE, ENTITY_ID)

    assert stub.calls[0]["service"] == TOGGLE_SERVICE
    assert stub.calls[0]["target"]["entity_id"] == ENTITY_ID
    assert protocol.RETURN_RESPONSE not in stub.calls[0]


FORECAST_DOMAIN = "weather"
FORECAST_SERVICE = "get_forecasts"
FORECAST_ENTITY_ID = "weather.example"
DAILY = {"type": "daily"}


async def test_a_service_can_be_asked_for_its_answer(stub, client):
    stub.response = {FORECAST_ENTITY_ID: {"forecast": [{"temperature": 71}]}}
    await wait_for(lambda: client.connected, READY_TIMEOUT_SECONDS)

    answer = await client.query_service(FORECAST_DOMAIN, FORECAST_SERVICE, FORECAST_ENTITY_ID, DAILY)

    assert answer == stub.response
    assert stub.calls[0][protocol.RETURN_RESPONSE] is True
    assert stub.calls[0][protocol.SERVICE_DATA] == DAILY
