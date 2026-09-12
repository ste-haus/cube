"""The disk cache: what cube fetches from elsewhere on the panels' behalf, kept so it is fetched once.

Everything lives under one root, in a directory for each kind of thing, so each kind can be kept
for as long as it is worth keeping and something new can move in beside the rest. A file's
modified time is the last time a panel was handed it rather than when it was fetched, since
serving a file touches it; the sweep removes whatever nobody has asked for in longer than its
kind is kept, and any directory that leaves empty.

Files are written whole or not at all, through a temporary file beside them that is renamed into
place, so a panel never reads half a picture. A write cut short by a crash leaves only the
temporary file, which ages out like anything else.

`python -m cube.cache sweep` runs the same sweep by hand.
"""

import argparse
import asyncio
import contextlib
import logging
import os
import tempfile
import time
from collections.abc import Mapping
from pathlib import Path

from cube.config import Settings, get_settings

logger = logging.getLogger(__name__)

RADAR_KIND = "radar"
MAP_KIND = "map"

SECONDS_PER_HOUR = 60 * 60
SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR

TEMPORARY_PREFIX = "."
TEMPORARY_SUFFIX = ".partial"

SWEEP_COMMAND = "sweep"
PROGRAM_NAME = "python -m cube.cache"
SWEPT_MESSAGE = "Swept %d stale files from the cache at %s"


class DiskCache:
    def __init__(self, root: Path) -> None:
        self.root = root

    def directory(self, kind: str) -> Path:
        return self.root / kind

    def touch(self, path: Path) -> None:
        """Marks a file as just served, which is what keeps it from the sweep."""

        # A file swept since it was found is simply fetched again the next time it is asked for.
        with contextlib.suppress(FileNotFoundError):
            os.utime(path)

    def write(self, path: Path, content: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(
            dir=path.parent, prefix=f"{TEMPORARY_PREFIX}{path.name}", suffix=TEMPORARY_SUFFIX
        )

        try:
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(content)

            os.replace(temporary, path)
        except BaseException:
            Path(temporary).unlink(missing_ok=True)
            raise

    def sweep(
        self, retention_days: float, retention_days_by_kind: Mapping[str, float], now: float | None = None
    ) -> int:
        """Removes every file not served within its kind's retention, and says how many went.

        A kind with no retention of its own is kept for `retention_days`, which is what lets
        something new move into the cache without the sweep having to be told about it.
        """

        if not self.root.is_dir():
            return 0

        moment = time.time() if now is None else now
        removed = 0

        for kind in self.root.iterdir():
            cutoff = moment - retention_days_by_kind.get(kind.name, retention_days) * SECONDS_PER_DAY
            removed += _sweep_directory(kind, cutoff) if kind.is_dir() else _remove_if_stale(kind, cutoff)

        return removed


def retention_days_by_kind(settings: Settings) -> dict[str, float]:
    return {RADAR_KIND: settings.radar_cache_retention_days}


async def sweep_forever(cache: DiskCache, settings: Settings) -> None:
    """Sweeps on start, then every `cache_sweep_interval_hours`, for as long as cube runs."""

    while True:
        try:
            removed = await asyncio.to_thread(
                cache.sweep, settings.cache_retention_days, retention_days_by_kind(settings)
            )
            logger.info(SWEPT_MESSAGE, removed, cache.root)
        except OSError as error:
            logger.warning("Could not sweep the cache at %s: %s", cache.root, error)

        await asyncio.sleep(settings.cache_sweep_interval_hours * SECONDS_PER_HOUR)


def _sweep_directory(directory: Path, cutoff: float) -> int:
    removed = 0

    for current, _, names in os.walk(directory, topdown=False):
        folder = Path(current)
        removed += sum(_remove_if_stale(folder / name, cutoff) for name in names)

        # Only a directory the sweep emptied goes, and never the kind's own.
        if folder != directory:
            with contextlib.suppress(OSError):
                folder.rmdir()

    return removed


def _remove_if_stale(path: Path, cutoff: float) -> int:
    try:
        if path.stat().st_mtime >= cutoff:
            return 0

        path.unlink()
    except FileNotFoundError:
        return 0

    return 1


def main() -> None:
    parser = argparse.ArgumentParser(prog=PROGRAM_NAME, description="Look after cube's disk cache.")
    parser.add_argument("command", choices=[SWEEP_COMMAND], help="remove whatever has outlived its retention")
    parser.parse_args()

    settings = get_settings()
    logging.basicConfig(level=settings.log_level.upper())

    cache = DiskCache(settings.cache_path)
    removed = cache.sweep(settings.cache_retention_days, retention_days_by_kind(settings))
    logger.info(SWEPT_MESSAGE, removed, cache.root)


if __name__ == "__main__":
    main()
