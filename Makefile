.PHONY: install lock web dev stub run test lint format clean image

CONFIG ?= config.yaml
STUB_PORT ?= 8123
IMAGE ?= cube:local

install:
	uv venv
	uv pip install -e ".[dev]"
	npm --prefix web install

# Dependencies are declared in setup.cfg and pinned here for reproducible image builds.
lock:
	uv pip compile setup.cfg -o requirements.txt

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

image:
	docker build -t $(IMAGE) .

clean:
	rm -rf web/dist .pytest_cache .ruff_cache
