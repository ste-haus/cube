import logging
import re
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, status
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from cube.api import router
from cube.api.dependencies import HUB_ATTRIBUTE
from cube.config import Settings, get_settings
from cube.dashboard import FACE_DIRECTORY, drop_missing_custom_faces, is_safe_page_name, load_dashboard
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

# An installation's own faces, from the mounted resources directory. These are additive: the
# built-in faces ship in the bundle, and anything here sits beside them without a rebuild, the
# way an installation's `floorplan.css` is served over the bundled stylesheets.
FACE_MOUNT = "/faces"
UNKNOWN_FACE_DETAIL = "No such face"

# Eight hex characters, drawn once per process and worn by every stylesheet and script the
# panel loads. The build already content-hashes its assets, so this is not for them: it is for
# the panels, which cache what they are given and cannot be told to reload. A wall panel is not
# a browser somebody is sitting at, and an image rolled out while one is holding a stale
# document is invisible to it. A fresh nonce on every start is a reload nobody has to ask for.
NONCE_BYTES = 4
NONCE_PARAMETER = "v"
ASSET_NONCE = secrets.token_hex(NONCE_BYTES)

# Local scripts and stylesheets only. An absolute URL is somebody else's cache to manage.
LOCAL_ASSET_PATTERN = re.compile(r'\b(src|href)="(?!\w+:|//)([^"?#]+\.(?:js|css))"')

CACHE_CONTROL_HEADER = "cache-control"
# The document naming the assets must never be held, or the nonce it carries never arrives.
DOCUMENT_CACHE_CONTROL = "no-store"

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

    drop_missing_custom_faces(dashboard, resolved.resources_path)

    app = FastAPI(title=APP_TITLE, lifespan=lifespan)
    app.include_router(router)

    _mount_frontend(app, resolved.frontend_path)
    _mount_faces(app, resolved.resources_path)

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
        # Registered ahead of the mount, which would otherwise serve the page unrewritten.
        @app.get(VISUALIZER_MOUNT)
        @app.get(f"{VISUALIZER_MOUNT}/")
        @app.get(f"{VISUALIZER_MOUNT}/{FRONTEND_ENTRYPOINT}")
        async def overlay() -> HTMLResponse:
            return _document(visualizer / FRONTEND_ENTRYPOINT)

        app.mount(VISUALIZER_MOUNT, StaticFiles(directory=visualizer, html=True), name=VISUALIZER_DIRECTORY)
    else:
        logger.warning(MISSING_VISUALIZER_MESSAGE, visualizer)

    # One bundle serves every panel; the browser reads `?profile=` off its own URL to find out
    # which one it is.
    @app.get("/")
    async def index() -> HTMLResponse:
        return _document(entrypoint)


def _mount_faces(app: FastAPI, directory: Path) -> None:
    faces = directory / FACE_DIRECTORY
    if not faces.is_dir():
        return

    # Registered ahead of the mount, which would otherwise serve the page unrewritten, and so
    # a face would keep whatever a panel first cached.
    @app.get(f"{FACE_MOUNT}/{{name}}")
    @app.get(f"{FACE_MOUNT}/{{name}}/")
    @app.get(f"{FACE_MOUNT}/{{name}}/{FRONTEND_ENTRYPOINT}")
    async def face(name: str) -> HTMLResponse:
        page = faces / name / FRONTEND_ENTRYPOINT
        if not is_safe_page_name(name) or not page.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=UNKNOWN_FACE_DETAIL)

        return _document(page)

    app.mount(FACE_MOUNT, StaticFiles(directory=faces), name=FACE_DIRECTORY)

def _document(path: Path) -> HTMLResponse:
    """An HTML page with this process's nonce on everything local it pulls in.

    Read per request rather than at startup, so a rebuilt bundle under a mounted frontend path
    is picked up without a restart.
    """

    markup = LOCAL_ASSET_PATTERN.sub(_bust, path.read_text())

    return HTMLResponse(content=markup, headers={CACHE_CONTROL_HEADER: DOCUMENT_CACHE_CONTROL})


def _bust(match: re.Match[str]) -> str:
    attribute, url = match.group(1), match.group(2)

    return f'{attribute}="{url}?{NONCE_PARAMETER}={ASSET_NONCE}"'
