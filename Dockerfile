# syntax=docker/dockerfile:1

# ── Base image ────────────────────────────────────────────────────────────────
# python:3.13-slim — latest stable slim image, keeps the image under ~200 MB.
FROM python:3.13-slim

# Prevent .pyc files and enable real-time log output inside Docker
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# ── Dependencies ──────────────────────────────────────────────────────────────
# Copy manifest first so this layer is cached when only app code changes.
# Build context is the project root (set in docker-compose.yml), so this path
# resolves to <project_root>/requirements.txt.
COPY app/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# ── Application code ──────────────────────────────────────────────────────────
COPY app ./app
COPY assets ./assets

# Create the data directory the SQLite file will be written to.
# The compose volume (../data:/app/data) overrides this at runtime,
# but the directory must exist for bare `docker run` invocations.
RUN mkdir -p /app/data

# ── Runtime ───────────────────────────────────────────────────────────────────
EXPOSE 8800

# PORT defaults to 8800; override with -e PORT=... or via env_file.
CMD ["sh", "-c", "uvicorn app.server:app --host 0.0.0.0 --port ${PORT:-8800}"]
