"""The radar's map: VersaTiles' style, and the icons and lettering it draws with, kept on disk.

The style names its sprites and glyphs by VersaTiles' addresses. It is rewritten as it is kept to
name cube's instead, the same paths under `/api/map/`, so a panel asks here for them and VersaTiles
never has to allow the panel's origin. Only what sits under VersaTiles' assets is rewritten or
relayed; the vector tiles still come from VersaTiles, which serves them to anyone.

The addresses are left as paths, since only the panel knows the origin it was loaded from. The
panel completes them as the style arrives, because MapLibre will not take a sprite by a path.

The style and its sprites are fetched afresh once a day, so a change VersaTiles makes arrives
within one. Lettering does not change, and is fetched once, when a panel first needs it.
"""

import asyncio
import json
import logging
import re
from pathlib import Path
from typing import Any

from cube.cache import MAP_KIND, SECONDS_PER_DAY, DiskCache
from cube.upstream import Upstream, UpstreamError

logger = logging.getLogger(__name__)

STYLE_URL = "https://tiles.versatiles.org/assets/styles/eclipse/style.json"
ASSETS_URL = "https://tiles.versatiles.org/assets/"
LOCAL_ASSETS_PATH = "/api/map/"
STYLE_FILE = "style.json"

SPRITE_KEY = "sprite"
SPRITE_URL_KEY = "url"
GLYPHS_KEY = "glyphs"

# MapLibre asks for a sprite sheet's index and picture, each at one and two pixels to the point.
SPRITE_VARIANTS = (".json", ".png", "@2x.json", "@2x.png")

# What may be relayed from under VersaTiles' assets, by the directory it sits in.
RELAYED_SUFFIXES = {"sprites": (".json", ".png"), "glyphs": (".pbf",)}
# Letters, digits, and the punctuation sprite sheets and font stacks are named with.
SEGMENT_PATTERN = re.compile(r"[\w@.,\- ]+")
UNSAFE_SEGMENTS = frozenset({".", ".."})
MIN_SEGMENTS = 2
PATH_SEPARATOR = "/"

REFRESH_SECONDS = SECONDS_PER_DAY

UNREADABLE_STYLE_MESSAGE = "{url} sent a style that is not a JSON object"


class UnknownAssetError(LookupError):
    """An address that is not a sprite sheet or glyph range under VersaTiles' assets."""


def localised(style: dict[str, Any]) -> dict[str, Any]:
    """The style, naming cube's addresses for its sprites and glyphs wherever it named VersaTiles'."""

    local = dict(style)
    sprite = style.get(SPRITE_KEY)

    if isinstance(sprite, str):
        local[SPRITE_KEY] = _local(sprite)
    elif isinstance(sprite, list):
        local[SPRITE_KEY] = [{**sheet, SPRITE_URL_KEY: _local(sheet[SPRITE_URL_KEY])} for sheet in sprite]

    glyphs = style.get(GLYPHS_KEY)
    if isinstance(glyphs, str):
        local[GLYPHS_KEY] = _local(glyphs)

    return local


def sprite_urls(style: dict[str, Any]) -> list[str]:
    """Every file of every sprite sheet under VersaTiles' assets that the style draws from."""

    sprite = style.get(SPRITE_KEY)
    sheets = [sprite] if isinstance(sprite, str) else [sheet[SPRITE_URL_KEY] for sheet in sprite or []]

    return [f"{sheet}{variant}" for sheet in sheets if sheet.startswith(ASSETS_URL) for variant in SPRITE_VARIANTS]


def _local(url: str) -> str:
    return f"{LOCAL_ASSETS_PATH}{url.removeprefix(ASSETS_URL)}" if url.startswith(ASSETS_URL) else url


class MapAssets:
    def __init__(self, cache: DiskCache, upstream: Upstream) -> None:
        self._cache = cache
        self._directory = cache.directory(MAP_KIND)
        self._upstream = upstream

    @property
    def style_path(self) -> Path:
        return self._directory / STYLE_FILE

    async def run(self) -> None:
        """Keeps the style and its sprites no more than a day old, for as long as cube runs."""

        while True:
            try:
                await self.refresh()
            except UpstreamError as error:
                logger.warning("Could not refresh the map's style: %s", error)

            await asyncio.sleep(REFRESH_SECONDS)

    async def refresh(self) -> None:
        style = await self._upstream.document(STYLE_URL)
        if not isinstance(style, dict):
            raise UpstreamError(UNREADABLE_STYLE_MESSAGE.format(url=STYLE_URL))

        # The sheets first, so the style is never on disk naming one that is not.
        for url in sprite_urls(style):
            await self._upstream.cached(url, self._path(url.removeprefix(ASSETS_URL)), refresh=True)

        self._cache.write(self.style_path, json.dumps(localised(style)).encode())

    async def asset(self, relative: str) -> Path:
        """A sprite sheet or glyph range by its path under VersaTiles' assets, fetched if not on disk."""

        segments = relative.split(PATH_SEPARATOR)
        suffixes = RELAYED_SUFFIXES.get(segments[0], ())

        if (
            len(segments) < MIN_SEGMENTS
            or not suffixes
            or not segments[-1].endswith(suffixes)
            or not all(_safe(segment) for segment in segments)
        ):
            raise UnknownAssetError(relative)

        return await self._upstream.cached(f"{ASSETS_URL}{relative}", self._path(relative))

    def _path(self, relative: str) -> Path:
        return self._directory.joinpath(*relative.split(PATH_SEPARATOR))


def _safe(segment: str) -> bool:
    return segment not in UNSAFE_SEGMENTS and SEGMENT_PATTERN.fullmatch(segment) is not None
