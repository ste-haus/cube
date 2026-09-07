.PHONY: install web dev stub run test lint format clean

VENV := .venv
CONFIG ?= config/cube.yaml
STUB_PORT ?= 8123

install:
	uv sync
	npm --prefix web install

web:
	npm --prefix web run build

dev:
	npm --prefix web run dev

stub:
	uv run python tools/stub_hass.py --config $(CONFIG) --port $(STUB_PORT)

run: web
	uv run python -m cube

test:
	uv run pytest
	npm --prefix web test

lint:
	uv run ruff check .
	npm --prefix web run check

format:
	uv run ruff format .

clean:
	rm -rf web/dist .pytest_cache .ruff_cache
