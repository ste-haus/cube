"""The browser-facing state stream.

One message carries the initial snapshot, then deltas as they arrive. Each connection reads
from its own bounded queue, so a panel that stops draining degrades on its own rather than
slowing the shared upstream connection.
"""

import asyncio
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from cube.api.dependencies import HUB_ATTRIBUTE
from cube.hass import protocol
from cube.hub import Hub

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# Every accepted stream costs a queue and two tasks. Panels are trusted only as far as the
# network they sit on, so the count is capped rather than left to whatever connects.
CLOSE_TRY_AGAIN_LATER = 1013

MESSAGE_TYPE = "type"
MESSAGE_INIT = "init"
MESSAGE_UPDATE = "update"
MESSAGE_STATES = "states"
MESSAGE_CONNECTED = "connected"


def get_hub_for_socket(websocket: WebSocket) -> Hub:
    return getattr(websocket.app.state, HUB_ATTRIBUTE)


SocketHub = Annotated[Hub, Depends(get_hub_for_socket)]


_panels = 0


@router.websocket("/stream")
async def stream(websocket: WebSocket, hub: SocketHub) -> None:
    global _panels

    if _panels >= hub.settings.max_panels:
        logger.warning("Refusing panel stream: %d already connected", _panels)
        await websocket.close(code=CLOSE_TRY_AGAIN_LATER)

        return

    _panels += 1
    await websocket.accept()

    try:
        await _serve(websocket, hub)
    finally:
        _panels -= 1


async def _serve(websocket: WebSocket, hub: Hub) -> None:
    async with hub.client.subscribe() as queue:
        await websocket.send_json(
            {
                MESSAGE_TYPE: MESSAGE_INIT,
                MESSAGE_CONNECTED: hub.client.connected,
                MESSAGE_STATES: protocol.public_states(hub.client.states),
            }
        )

        forwarding = asyncio.create_task(_forward(websocket, queue))
        listening = asyncio.create_task(_listen(websocket))

        done, pending = await asyncio.wait({forwarding, listening}, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()

        for task in done:
            if task.exception() is not None:
                logger.info("Panel stream ended: %s", task.exception())


async def _forward(websocket: WebSocket, queue: asyncio.Queue[dict[str, Any]]) -> None:
    while True:
        update = await queue.get()
        await websocket.send_json({MESSAGE_TYPE: MESSAGE_UPDATE, MESSAGE_STATES: protocol.public_states(update)})


async def _listen(websocket: WebSocket) -> None:
    """Consume anything the browser sends so a disconnect is noticed promptly."""

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        return
