from functools import lru_cache
from pathlib import Path

from pydantic import Field, HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PREFIX = "CUBE_"
ENV_FILE = ".env"

DEFAULT_BIND_HOST = "0.0.0.0"
DEFAULT_BIND_PORT = 4096
DEFAULT_LOG_LEVEL = "info"
DEFAULT_PROFILE = "default"
DEFAULT_DASHBOARD_PATH = Path("config.yaml")
DEFAULT_FRONTEND_PATH = Path(__file__).resolve().parents[2] / "web" / "dist"
DEFAULT_RESOURCES_PATH = Path("resources")

DEFAULT_RECONNECT_MIN_SECONDS = 1.0
DEFAULT_RECONNECT_MAX_SECONDS = 60.0
DEFAULT_RECONNECT_BACKOFF_FACTOR = 2.0

DEFAULT_REQUEST_TIMEOUT_SECONDS = 15.0
# Short on purpose. A reverse proxy in front of Home Assistant commonly closes a websocket it
# considers idle, sometimes after only a few seconds, and the heartbeat is what keeps the
# connection looking busy. The frames are tiny, so erring low costs little.
DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 5.0
DEFAULT_ASSET_CACHE_SECONDS = 300
DEFAULT_CAMERA_CACHE_SECONDS = 5

DEFAULT_CACHE_PATH = Path("cache")
DEFAULT_CACHE_RETENTION_DAYS = 60.0
# A radar frame leaves the loop two hours after it was taken, so a day is already generous.
DEFAULT_RADAR_CACHE_RETENTION_DAYS = 1.0
DEFAULT_CACHE_SWEEP_INTERVAL_HOURS = 24.0

# Generous for a house, small enough that a script on the network cannot exhaust the process.
DEFAULT_MAX_PANELS = 16

HTTP_SCHEME = "http"
HTTPS_SCHEME = "https"
WS_SCHEME = "ws"
WSS_SCHEME = "wss"

WEBSOCKET_PATH = "/api/websocket"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix=ENV_PREFIX, env_file=ENV_FILE, extra="ignore")

    ha_url: HttpUrl = Field(description="Base URL of the Home Assistant instance")
    ha_token: str = Field(description="Long-lived access token, held server side only")

    host: str = DEFAULT_BIND_HOST
    port: int = DEFAULT_BIND_PORT
    log_level: str = DEFAULT_LOG_LEVEL

    profile: str = Field(default=DEFAULT_PROFILE, description="Panel profile served when a request names none")
    dashboard_path: Path = Field(default=DEFAULT_DASHBOARD_PATH, description="Path to the dashboard definition")
    frontend_path: Path = Field(default=DEFAULT_FRONTEND_PATH, description="Path to the built frontend bundle")
    resources_path: Path = Field(default=DEFAULT_RESOURCES_PATH, description="Directory holding floorplan SVGs and overrides")
    cache_path: Path = Field(
        default=DEFAULT_CACHE_PATH, description="Directory holding what cube fetches for the panels"
    )

    reconnect_min_seconds: float = DEFAULT_RECONNECT_MIN_SECONDS
    reconnect_max_seconds: float = DEFAULT_RECONNECT_MAX_SECONDS
    reconnect_backoff_factor: float = DEFAULT_RECONNECT_BACKOFF_FACTOR

    request_timeout_seconds: float = DEFAULT_REQUEST_TIMEOUT_SECONDS
    heartbeat_interval_seconds: float = DEFAULT_HEARTBEAT_INTERVAL_SECONDS
    asset_cache_seconds: int = DEFAULT_ASSET_CACHE_SECONDS
    camera_cache_seconds: int = DEFAULT_CAMERA_CACHE_SECONDS

    cache_retention_days: float = Field(
        default=DEFAULT_CACHE_RETENTION_DAYS,
        gt=0,
        description="How long a cached file is kept after a panel last asked for it",
    )
    radar_cache_retention_days: float = Field(
        default=DEFAULT_RADAR_CACHE_RETENTION_DAYS,
        gt=0,
        description="The same for radar tiles, which are stale within hours",
    )
    cache_sweep_interval_hours: float = Field(
        default=DEFAULT_CACHE_SWEEP_INTERVAL_HOURS, gt=0, description="How often the cache is swept"
    )
    max_panels: int = Field(default=DEFAULT_MAX_PANELS, description="Concurrent panel streams to accept")

    @property
    def rest_base_url(self) -> str:
        return str(self.ha_url).rstrip("/")

    @property
    def websocket_url(self) -> str:
        base = self.rest_base_url
        scheme, _, remainder = base.partition("://")
        websocket_scheme = WSS_SCHEME if scheme == HTTPS_SCHEME else WS_SCHEME

        return f"{websocket_scheme}://{remainder}{WEBSOCKET_PATH}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
