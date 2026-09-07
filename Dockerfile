# The frontend is built separately so the runtime image carries no toolchain.
FROM node:22-alpine AS web

WORKDIR /build
COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build


FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev --frozen || uv sync --no-dev

COPY src/ ./src/
COPY tools/ ./tools/
COPY --from=web /build/dist ./web/dist

EXPOSE 4096

CMD ["uv", "run", "python", "-m", "cube"]
