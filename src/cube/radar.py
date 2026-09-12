"""The radar's pictures: RainViewer's frames and tiles, fetched once for the house and kept on disk.

RainViewer publishes a frame every ten minutes and keeps two hours of them. The list is read every
couple of minutes, and a new frame's tiles round every radar's home are fetched as soon as it
appears, newest first, so a panel turning to the weather finds them waiting. A frame's tiles never
change, so a tile on disk is served as it is for as long as the cache keeps it.

A tile is fetched only for a frame RainViewer lists, at a zoom it serves. One already on disk is
served whether its frame is still listed or not, since a panel can be a refresh behind.
"""

import asyncio
import json
import logging
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from cube.cache import RADAR_KIND, DiskCache
from cube.dashboard import RAINVIEWER_MAX_ZOOM, Dashboard
from cube.hass import protocol
from cube.hass.client import HassClient
from cube.upstream import Upstream, UpstreamError

logger = logging.getLogger(__name__)

WEATHER_MAPS_URL = "https://api.rainviewer.com/public/weather-maps.json"
HOST_KEY = "host"
RADAR_KEY = "radar"
PAST_KEY = "past"
TIME_KEY = "time"
PATH_KEY = "path"
ID_KEY = "id"
FRAMES_KEY = "frames"
PATH_SEPARATOR = "/"

# RainViewer's "Universal Blue", smoothed and without snow, as the dashboard's radar card asks.
TILE_URL_TEMPLATE = "{host}{path}/{size}/{z}/{x}/{y}/{scheme}/{options}.png"
TILE_SIZE = 256
COLOR_SCHEME = 2
TILE_OPTIONS = "1_0"

FRAMES_FILE = "frames.json"
TILES_DIRECTORY = "tiles"
TILE_SUFFIX = ".png"

REFRESH_SECONDS = 120
# Two tiles either side of the one home is in, which covers a radar up to 1024 pixels across.
PREFETCH_RADIUS = 2

# RainViewer allows an address 500 requests a minute in bursts of no more than 300, and refuses
# the rest. cube is not the only thing in a house that asks, so it keeps well inside that; an
# empty cache still fills in about a minute, newest frame first.
RAINVIEWER_DOMAIN = "rainviewer.com"
RAINVIEWER_REQUESTS = 200
RAINVIEWER_WINDOW_SECONDS = 60

MIN_ZOOM = 0
FIRST_INDEX = 0
# RainViewer names a frame by the last part of its path, a short run of letters and digits.
FRAME_ID_PATTERN = re.compile(r"[0-9a-z]+")

LATITUDE_ATTRIBUTE = "latitude"
LONGITUDE_ATTRIBUTE = "longitude"

HALF_CIRCLE_DEGREES = 180
FULL_CIRCLE_DEGREES = 360
HALF = 0.5
MERCATOR_DIVISOR = 4 * math.pi

UNREADABLE_FRAMES_MESSAGE = "{url} sent a list of frames cube cannot read"


class UnknownTileError(LookupError):
    """A tile that is not on disk and is not RainViewer's to give."""


# What a tile fetched ahead can fail with that is no fault of cube's. Anything else is a bug.
PREFETCH_FAILURES = (UpstreamError, UnknownTileError)


@dataclass(frozen=True)
class Frame:
    time: int
    id: str
    path: str


def home_tile(latitude: float, longitude: float, zoom: int) -> tuple[int, int]:
    """The column and row of the tile a point falls in, in Web Mercator at `zoom`."""

    count = 2**zoom
    sine = math.sin(math.radians(latitude))
    x = (longitude + HALF_CIRCLE_DEGREES) / FULL_CIRCLE_DEGREES * count
    y = (HALF - math.log((1 + sine) / (1 - sine)) / MERCATOR_DIVISOR) * count

    return math.floor(x) % count, min(max(math.floor(y), FIRST_INDEX), count - 1)


def tiles_around(latitude: float, longitude: float, zoom: int, radius: int) -> list[tuple[int, int]]:
    """The tiles within `radius` of the one a point falls in.

    Columns wrap round the antimeridian, because the world does; rows past either pole are left
    out, because there is nothing there to draw.
    """

    count = 2**zoom
    column, row = home_tile(latitude, longitude, zoom)
    span = range(-radius, radius + 1)

    tiles = [((column + across) % count, row + down) for down in span for across in span]

    return list(dict.fromkeys(tile for tile in tiles if FIRST_INDEX <= tile[1] < count))


def on_the_map(z: int, x: int, y: int) -> bool:
    """Whether RainViewer draws a tile: a zoom it serves, and a column and row that zoom has."""

    if not MIN_ZOOM <= z <= RAINVIEWER_MAX_ZOOM:
        return False

    count = 2**z

    return FIRST_INDEX <= x < count and FIRST_INDEX <= y < count


class RadarCache:
    def __init__(self, cache: DiskCache, upstream: Upstream, dashboard: Dashboard, client: HassClient) -> None:
        self._cache = cache
        self._directory = cache.directory(RADAR_KIND)
        self._upstream = upstream
        self._dashboard = dashboard
        self._client = client

        self._host: str | None = None
        self._frames: dict[str, Frame] = {}

    @property
    def frames_path(self) -> Path:
        return self._directory / FRAMES_FILE

    def tile_path(self, frame_id: str, z: int, x: int, y: int) -> Path:
        return self._directory / TILES_DIRECTORY / frame_id / str(z) / str(x) / f"{y}{TILE_SUFFIX}"

    async def run(self) -> None:
        """Keeps the frames current and their tiles fetched ahead, for as long as cube runs."""

        while True:
            try:
                await self.prefetch(await self.refresh())
            except UpstreamError as error:
                logger.warning("Could not refresh the radar: %s", error)

            await asyncio.sleep(REFRESH_SECONDS)

    async def refresh(self) -> list[Frame]:
        """Reads RainViewer's frames, oldest first, and writes the panels' copy of the list.

        The panels' copy names each frame and nothing else. Where its tiles come from is this
        module's business, so a panel can only ever ask cube for them.
        """

        body = await self._upstream.document(WEATHER_MAPS_URL)

        try:
            host = body[HOST_KEY]
            frames = [frame for entry in body[RADAR_KEY][PAST_KEY] if (frame := _frame(entry))]
        except (KeyError, TypeError, ValueError) as error:
            raise UpstreamError(UNREADABLE_FRAMES_MESSAGE.format(url=WEATHER_MAPS_URL)) from error

        self._host = host
        self._frames = {frame.id: frame for frame in frames}

        listing = {FRAMES_KEY: [{TIME_KEY: frame.time, ID_KEY: frame.id} for frame in frames]}
        self._cache.write(self.frames_path, json.dumps(listing).encode())

        return frames

    async def prefetch(self, frames: list[Frame]) -> None:
        """Fetches the tiles round home for every frame, newest first, skipping those on disk."""

        home = self._home()
        if home is None:
            return

        latitude, longitude = home
        addresses = sorted(
            {
                (radar.zoom, x, y)
                for radar in self._dashboard.radars
                for x, y in tiles_around(latitude, longitude, radar.zoom, PREFETCH_RADIUS)
            }
        )

        for frame in reversed(frames):
            results = await asyncio.gather(
                *(self.tile(frame.id, z, x, y) for z, x, y in addresses), return_exceptions=True
            )
            failures = [result for result in results if isinstance(result, BaseException)]

            for failure in failures:
                if not isinstance(failure, PREFETCH_FAILURES):
                    raise failure

            if failures:
                logger.warning(
                    "Could not fetch %d of %d tiles for radar frame %s: %s",
                    len(failures),
                    len(results),
                    frame.id,
                    failures[0],
                )

    async def tile(self, frame_id: str, z: int, x: int, y: int) -> Path:
        """A tile from disk, fetched from RainViewer first if it is not there and is RainViewer's to give."""

        if not FRAME_ID_PATTERN.fullmatch(frame_id) or not on_the_map(z, x, y):
            raise UnknownTileError(frame_id)

        path = self.tile_path(frame_id, z, x, y)
        if path.is_file():
            return path

        # Asked for before the list has been read, which only happens just after a start.
        if not self._frames:
            await self.refresh()

        frame = self._frames.get(frame_id)
        if frame is None or self._host is None:
            raise UnknownTileError(frame_id)

        url = TILE_URL_TEMPLATE.format(
            host=self._host,
            path=frame.path,
            size=TILE_SIZE,
            z=z,
            x=x,
            y=y,
            scheme=COLOR_SCHEME,
            options=TILE_OPTIONS,
        )

        return await self._upstream.cached(url, path)

    def _home(self) -> tuple[float, float] | None:
        weather = self._dashboard.weather
        if weather is None or weather.zone_entity_id is None:
            return None

        attributes = self._client.states.get(weather.zone_entity_id, {}).get(protocol.ATTRIBUTES, {})
        latitude = attributes.get(LATITUDE_ATTRIBUTE)
        longitude = attributes.get(LONGITUDE_ATTRIBUTE)

        return None if latitude is None or longitude is None else (latitude, longitude)


def _frame(entry: dict[str, Any]) -> Frame | None:
    path = entry[PATH_KEY]
    frame_id = path.rsplit(PATH_SEPARATOR, 1)[-1]

    return Frame(time=int(entry[TIME_KEY]), id=frame_id, path=path) if FRAME_ID_PATTERN.fullmatch(frame_id) else None
