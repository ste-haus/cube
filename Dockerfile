# The frontend is compiled in its own stage so the runtime image carries no Node toolchain,
# and the result is one image serving both the API and the built panel.
FROM node:22-alpine AS web

WORKDIR /build

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build


FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    CUBE_DASHBOARD_PATH=/app/config.yaml \
    CUBE_FRONTEND_PATH=/app/web/dist

WORKDIR /app

# Pinned dependencies first, so a source change does not re-resolve them.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY setup.cfg pyproject.toml README.md LICENSE ./
COPY src/ ./src/
COPY tools/ ./tools/
RUN pip install --no-cache-dir --no-deps -e .

COPY --from=web /build/dist ./web/dist

EXPOSE 4096

CMD ["python", "-m", "cube"]
