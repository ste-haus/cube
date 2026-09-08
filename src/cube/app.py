import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from cube.api import router
from cube.api.dependencies import HUB_ATTRIBUTE
from cube.config import Settings, get_settings
from cube.dashboard import load_dashboard
from cube.hub import Hub

logger = logging.getLogger(__name__)

APP_TITLE = "cube"

FRONTEND_ENTRYPOINT = "index.html"
FRONTEND_ASSETS_DIRECTORY = "assets"
FRONTEND_ASSETS_MOUNT = "/assets"

# The announcement overlay is a standalone page rather than part of the bundle: it draws with
# its own Web Audio graph and canvas, and it is served from here so the audio it analyses can
# come from this origin too.
VISUALIZER_DIRECTORY = "visualizer"
VISUALIZER_MOUNT = "/visualizer"

MISSING_FRONTEND_MESSAGE = (
    "Frontend bundle not found at %s. Run `make web` (or `npm --prefix web run build`) to build it."
)
MISSING_VISUALIZER_MESSAGE = (
    "No visualizer page at %s; the announcement overlay will not render. Rebuild the frontend to pick it up."
)


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or get_settings()
    dashboard = load_dashboard(resolved.dashboard_path)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        hub = Hub.create(resolved, dashboard)
        setattr(app.state, HUB_ATTRIBUTE, hub)

        await hub.start()
        try:
            yield
        finally:
            await hub.stop()

    app = FastAPI(title=APP_TITLE, lifespan=lifespan)
    app.include_router(router)

    _mount_frontend(app, resolved.frontend_path)

    return app


def _mount_frontend(app: FastAPI, directory: Path) -> None:
    assets = directory / FRONTEND_ASSETS_DIRECTORY
    entrypoint = directory / FRONTEND_ENTRYPOINT

    if not entrypoint.exists():
        logger.warning(MISSING_FRONTEND_MESSAGE, directory)

        return

    app.mount(FRONTEND_ASSETS_MOUNT, StaticFiles(directory=assets), name=FRONTEND_ASSETS_DIRECTORY)

    # An older bundle predates the overlay, and a panel missing one page is worth a line in the
    # log rather than a process that will not start.
    visualizer = directory / VISUALIZER_DIRECTORY
    if visualizer.is_dir():
        app.mount(VISUALIZER_MOUNT, StaticFiles(directory=visualizer, html=True), name=VISUALIZER_DIRECTORY)
    else:
        logger.warning(MISSING_VISUALIZER_MESSAGE, visualizer)

    # Every panel route renders the same bundle; the profile is read from the path in the browser.
    @app.get("/")
    @app.get("/p/{profile}")
    async def index(profile: str | None = None) -> FileResponse:
        return FileResponse(entrypoint)
