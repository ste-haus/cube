.PHONY: init install lock web dev stub resources run test lint format clean image

CONFIG ?= config.yaml
STUB_PORT ?= 8123
IMAGE ?= cube:local

# Creates the two files that are not tracked. Never overwrites: one holds a credential, the
# other describes your home, and neither can be recovered once clobbered.
init:
	@if [ -f .env ]; then echo ".env exists, leaving it alone"; else cp .env.dist .env; echo "created .env"; fi
	@if [ -f config.yaml ]; then echo "config.yaml exists, leaving it alone"; else cp config.yaml.dist config.yaml; echo "created config.yaml"; fi

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

# Schematic drawings for a panel whose floorplans have not been drawn yet.
resources:
	uv run python tools/stub_hass.py --config $(CONFIG) --write-floorplans resources/floorplans

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
