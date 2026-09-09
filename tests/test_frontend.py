"""Serving the panel document itself: the nonce it stamps and the caching it refuses."""

import re

import pytest
from fastapi.testclient import TestClient

from cube.app import NONCE_PARAMETER, create_app
from cube.config import Settings

OK = 200
NOT_FOUND = 404
CACHE_CONTROL_HEADER = "cache-control"

INDEX_MARKUP = """<!doctype html>
<html>
  <head>
    <script type="module" crossorigin src="/assets/index-abc123.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-def456.css">
    <link rel="preconnect" href="https://fonts.example.invalid/face.css">
  </head>
  <body><div id="app"></div></body>
</html>
"""

VISUALIZER_MARKUP = """<html>
  <head><link rel="stylesheet" href="style.css" /></head>
  <body><script type="text/javascript" src="visualizer.js"></script></body>
</html>
"""

NONCE_PATTERN = re.compile(rf"\?{NONCE_PARAMETER}=([0-9a-f]{{8}})\b")


@pytest.fixture
def frontend(tmp_path, settings: Settings) -> Settings:
    """A stand-in for a built bundle: an entrypoint, an assets directory, and the overlay."""

    directory = tmp_path / "dist"
    (directory / "assets").mkdir(parents=True)
    (directory / "index.html").write_text(INDEX_MARKUP)

    visualizer = directory / "visualizer"
    visualizer.mkdir()
    (visualizer / "index.html").write_text(VISUALIZER_MARKUP)
    (visualizer / "style.css").write_text("body { background: #000; }")

    return settings.model_copy(update={"frontend_path": directory})


def test_index_stamps_every_local_asset_with_one_nonce(frontend: Settings):
    with TestClient(create_app(frontend)) as client:
        markup = client.get("/").text

    nonces = set(NONCE_PATTERN.findall(markup))

    assert len(nonces) == 1
    assert f"/assets/index-abc123.js?{NONCE_PARAMETER}={nonces.pop()}" in markup


def test_index_leaves_an_absolute_url_alone(frontend: Settings):
    with TestClient(create_app(frontend)) as client:
        markup = client.get("/").text

    assert 'href="https://fonts.example.invalid/face.css"' in markup


def test_the_overlay_page_is_stamped_too(frontend: Settings):
    with TestClient(create_app(frontend)) as client:
        markup = client.get("/visualizer/index.html").text

    assert NONCE_PATTERN.search(markup)
    assert f"style.css?{NONCE_PARAMETER}=" in markup
    assert f"visualizer.js?{NONCE_PARAMETER}=" in markup


def test_a_panel_asking_for_a_profile_carries_the_same_nonce(frontend: Settings):
    """Every panel is served the same document; only the query string tells them apart."""

    with TestClient(create_app(frontend)) as client:
        root = NONCE_PATTERN.findall(client.get("/").text)
        profile = NONCE_PATTERN.findall(client.get("/", params={"profile": "kitchen"}).text)

    assert root == profile


def test_the_old_profile_path_is_gone(frontend: Settings):
    with TestClient(create_app(frontend)) as client:
        response = client.get("/p/kitchen")

    assert response.status_code == NOT_FOUND


def test_the_document_is_never_held(frontend: Settings):
    """A cached document names cached assets, and the nonce inside it never arrives."""

    with TestClient(create_app(frontend)) as client:
        response = client.get("/")

    assert response.status_code == OK
    assert response.headers[CACHE_CONTROL_HEADER] == "no-store"
