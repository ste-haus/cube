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

DEFAULT_RECONNECT_MIN_SECONDS = 1.0
DEFAULT_RECONNECT_MAX_SECONDS = 60.0
DEFAULT_RECONNECT_BACKOFF_FACTOR = 2.0

DEFAULT_REQUEST_TIMEOUT_SECONDS = 15.0
DEFAULT_ASSET_CACHE_SECONDS = 300
DEFAULT_CAMERA_CACHE_SECONDS = 5

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

    reconnect_min_seconds: float = DEFAULT_RECONNECT_MIN_SECONDS
    reconnect_max_seconds: float = DEFAULT_RECONNECT_MAX_SECONDS
    reconnect_backoff_factor: float = DEFAULT_RECONNECT_BACKOFF_FACTOR

    request_timeout_seconds: float = DEFAULT_REQUEST_TIMEOUT_SECONDS
    asset_cache_seconds: int = DEFAULT_ASSET_CACHE_SECONDS
    camera_cache_seconds: int = DEFAULT_CAMERA_CACHE_SECONDS

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
