"""Application-wide wiring: the dashboard definition, the shared upstream connection, the REST
client the routes reach through, and the disk cache the radar and its map are served from."""

import asyncio
from dataclasses import dataclass, field

from cube.basemap import MapAssets
from cube.cache import DiskCache, sweep_forever
from cube.config import Settings
from cube.dashboard import Dashboard
from cube.hass import HassClient, HassRest
from cube.radar import RAINVIEWER_DOMAIN, RAINVIEWER_REQUESTS, RAINVIEWER_WINDOW_SECONDS, RadarCache
from cube.upstream import RateLimit, Upstream, upstream_client

SWEEP_TASK = "cache-sweep"
RADAR_TASK = "radar-cache"
MAP_TASK = "map-cache"


@dataclass
class Hub:
    settings: Settings
    dashboard: Dashboard
    client: HassClient
    rest: HassRest
    cache: DiskCache
    upstream: Upstream
    radar: RadarCache
    basemap: MapAssets
    tasks: list[asyncio.Task[None]] = field(default_factory=list)

    @classmethod
    def create(cls, settings: Settings, dashboard: Dashboard) -> "Hub":
        client = HassClient(settings, dashboard.allowed_entities)
        cache = DiskCache(settings.cache_path)
        rate_limits = {RAINVIEWER_DOMAIN: RateLimit(RAINVIEWER_REQUESTS, RAINVIEWER_WINDOW_SECONDS)}
        upstream = Upstream(cache, upstream_client(settings), rate_limits)

        return cls(
            settings=settings,
            dashboard=dashboard,
            client=client,
            rest=HassRest(settings),
            cache=cache,
            upstream=upstream,
            radar=RadarCache(cache, upstream, dashboard, client),
            basemap=MapAssets(cache, upstream),
        )

    async def start(self) -> None:
        await self.client.start()

        self.tasks.append(asyncio.create_task(sweep_forever(self.cache, self.settings), name=SWEEP_TASK))

        if self.dashboard.radars:
            self.tasks.append(asyncio.create_task(self.radar.run(), name=RADAR_TASK))
            self.tasks.append(asyncio.create_task(self.basemap.run(), name=MAP_TASK))

    async def stop(self) -> None:
        for task in self.tasks:
            task.cancel()

        await asyncio.gather(*self.tasks, return_exceptions=True)
        self.tasks.clear()

        await self.client.stop()
        await self.rest.close()
        await self.upstream.close()
