# syntax=docker/dockerfile:1

# ── Base image ────────────────────────────────────────────────────────────────
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# ── Dependencies ──────────────────────────────────────────────────────────────
# Build context is the repository root (same directory as this Dockerfile).
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# ── Application code ──────────────────────────────────────────────────────────
# Copy source into /app/app/ so the 'app' package resolves correctly.
# uvicorn app.server:app expects the package at /app/app/ when run from /app.
COPY . ./app

# ── pytest path fix ───────────────────────────────────────────────────────────
# pytest.ini in the repo has testpaths = tests (correct for local dev).
# Inside the container code lives at /app/app/tests/, so override here.
RUN printf '[pytest]\nasyncio_mode = auto\ntestpaths = app/tests\npythonpath = .\n' > /app/pytest.ini

# Create the data directory the SQLite file will be written to.
RUN mkdir -p /app/data

# ── Runtime ───────────────────────────────────────────────────────────────────
EXPOSE 8800

CMD ["sh", "-c", "uvicorn app.server:app --host 0.0.0.0 --port ${PORT:-8800}"]
