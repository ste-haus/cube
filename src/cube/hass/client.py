"""A single, shared Home Assistant websocket connection.

Every panel is served from this one upstream connection rather than opening its own. Home
Assistant fans each state change out to every subscriber it has, so N panels subscribed
directly cost N serializations of every event; collapsing them to one connection with an
entity allowlist makes that cost independent of how many panels are on the wall.
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import websockets
from websockets.asyncio.client import ClientConnection

from cube.config import Settings
from cube.hass import protocol

logger = logging.getLogger(__name__)

FIRST_MESSAGE_ID = 1

# A browser that stops reading must not be able to stall the upstream connection, so each
# subscriber gets a bounded queue and loses its oldest pending update rather than blocking.
SUBSCRIBER_QUEUE_SIZE = 32

# Liveness is kept with Home Assistant's own ping command rather than websocket ping frames.
# A reverse proxy in front of Home Assistant may not forward control frames, which reads to the
# client as an unanswered ping and tears down an otherwise healthy connection; an application
# ping is an ordinary data frame and survives the trip.
PROTOCOL_PING_INTERVAL = None


class HassError(Exception):
    pass


class HassClient:
    def __init__(self, settings: Settings, entity_ids: frozenset[str]) -> None:
        self._settings = settings
        self._entity_ids = sorted(entity_ids)

        self._states: dict[str, dict[str, Any]] = {}
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()

        self._connection: ClientConnection | None = None
        self._task: asyncio.Task[None] | None = None
        self._message_id = FIRST_MESSAGE_ID
        self._results: dict[int, asyncio.Future[dict[str, Any]]] = {}
        self._ready = asyncio.Event()

    @property
    def states(self) -> dict[str, dict[str, Any]]:
        return self._states

    @property
    def connected(self) -> bool:
        return self._ready.is_set()

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="hass-client")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    @asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue[dict[str, Any]]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=SUBSCRIBER_QUEUE_SIZE)
        self._subscribers.add(queue)
        try:
            yield queue
        finally:
            self._subscribers.discard(queue)

    async def call_service(self, domain: str, service: str, entity_id: str) -> None:
        message_id = self._next_message_id()
        result = await self._send_awaiting_result(protocol.call_service(message_id, domain, service, entity_id))

        if not result.get(protocol.SUCCESS, False):
            error = result.get(protocol.ERROR, {})
            raise HassError(error.get(protocol.MESSAGE, "service call failed"))

    async def _run(self) -> None:
        delay = self._settings.reconnect_min_seconds

        while True:
            try:
                await self._connect_and_listen()
                delay = self._settings.reconnect_min_seconds
            except asyncio.CancelledError:
                raise
            except Exception as error:  # noqa: BLE001 - any failure here is a reconnect, not a crash
                logger.warning("Home Assistant connection lost (%s); retrying in %.1fs", error, delay)

            self._ready.clear()
            self._connection = None
            self._fail_pending_results()

            await asyncio.sleep(delay)
            delay = min(delay * self._settings.reconnect_backoff_factor, self._settings.reconnect_max_seconds)

    async def _connect_and_listen(self) -> None:
        logger.info("Connecting to Home Assistant at %s", self._settings.websocket_url)

        async with websockets.connect(self._settings.websocket_url, ping_interval=PROTOCOL_PING_INTERVAL) as connection:
            self._connection = connection

            await self._authenticate(connection)

            # The reader has to be running before anything awaits a result, because it is what
            # resolves them.
            reader = asyncio.create_task(self._read(connection), name="hass-reader")
            heartbeat = asyncio.create_task(self._heartbeat(), name="hass-heartbeat")
            try:
                await self._subscribe_entities()

                logger.info("Subscribed to %d entities", len(self._entity_ids))
                self._ready.set()

                # Either finishing means the connection is done; a heartbeat that goes
                # unanswered has to bring the reader down with it.
                done, _ = await asyncio.wait({reader, heartbeat}, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
            finally:
                reader.cancel()
                heartbeat.cancel()

    async def _read(self, connection: ClientConnection) -> None:
        async for raw in connection:
            self._handle(json.loads(raw))

    async def _heartbeat(self) -> None:
        while True:
            await asyncio.sleep(self._settings.heartbeat_interval_seconds)
            await self._send_awaiting_result(protocol.ping(self._next_message_id()))

    async def _authenticate(self, connection: ClientConnection) -> None:
        greeting = json.loads(await connection.recv())
        if greeting.get(protocol.TYPE) != protocol.AUTH_REQUIRED:
            raise HassError(f"Unexpected greeting: {greeting.get(protocol.TYPE)}")

        await connection.send(json.dumps(protocol.authenticate(self._settings.ha_token)))

        response = json.loads(await connection.recv())
        if response.get(protocol.TYPE) != protocol.AUTH_OK:
            raise HassError(response.get(protocol.MESSAGE, "authentication rejected"))

    async def _subscribe_entities(self) -> None:
        # Cleared before subscribing, not after: Home Assistant sends the initial states
        # immediately behind the subscription result, and clearing afterwards races them.
        self._states.clear()

        message_id = self._next_message_id()
        result = await self._send_awaiting_result(protocol.subscribe(message_id, self._entity_ids))

        if not result.get(protocol.SUCCESS, False):
            raise HassError(result.get(protocol.ERROR, {}).get(protocol.MESSAGE, "subscription rejected"))

    def _handle(self, message: dict[str, Any]) -> None:
        message_type = message.get(protocol.TYPE)

        if message_type == protocol.EVENT:
            touched = protocol.apply_event(self._states, message.get(protocol.EVENT, {}))
            self._publish(touched)
        elif message_type in (protocol.RESULT, protocol.PONG):
            pending = self._results.pop(message.get(protocol.ID, 0), None)
            if pending and not pending.done():
                pending.set_result(message)

    def _publish(self, entity_ids: set[str]) -> None:
        if not entity_ids:
            return

        update = {entity_id: self._states.get(entity_id) for entity_id in entity_ids}

        for queue in self._subscribers:
            if queue.full():
                # Drop this subscriber's oldest update rather than let it slow the upstream.
                queue.get_nowait()

            queue.put_nowait(update)

    async def _send_awaiting_result(self, message: dict[str, Any]) -> dict[str, Any]:
        connection = self._connection
        if connection is None:
            raise HassError("Not connected to Home Assistant")

        message_id = message[protocol.ID]
        pending: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._results[message_id] = pending

        await connection.send(json.dumps(message))

        return await asyncio.wait_for(pending, timeout=self._settings.request_timeout_seconds)

    def _fail_pending_results(self) -> None:
        for pending in self._results.values():
            if not pending.done():
                pending.set_exception(HassError("Connection closed"))

        self._results.clear()

    def _next_message_id(self) -> int:
        self._message_id += 1

        return self._message_id
