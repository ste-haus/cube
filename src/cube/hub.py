"""Application-wide wiring: the dashboard definition, the shared upstream connection, and
the REST client the routes reach through."""

from dataclasses import dataclass

from cube.config import Settings
from cube.dashboard import Dashboard
from cube.hass import HassClient, HassRest


@dataclass
class Hub:
    settings: Settings
    dashboard: Dashboard
    client: HassClient
    rest: HassRest

    @classmethod
    def create(cls, settings: Settings, dashboard: Dashboard) -> "Hub":
        return cls(
            settings=settings,
            dashboard=dashboard,
            client=HassClient(settings, dashboard.allowed_entities),
            rest=HassRest(settings),
        )

    async def start(self) -> None:
        await self.client.start()

    async def stop(self) -> None:
        await self.client.stop()
        await self.rest.close()
