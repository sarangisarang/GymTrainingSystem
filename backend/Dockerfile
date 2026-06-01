# syntax=docker/dockerfile:1
#
# Backend image — FastAPI served by uvicorn.
#
# Goals:
#   - small, reproducible image (slim base, no build toolchain in the final layer)
#   - fast rebuilds (dependencies cached separately from app code)
#   - safe defaults (runs as a non-root user)
#
# Build:  docker build -t gymtracker-backend ./backend
# Run:    docker run --rm -p 8000:8000 --env-file backend/.env gymtracker-backend

FROM python:3.12-slim

# - PYTHONDONTWRITEBYTECODE: no .pyc files (smaller, cleaner container fs)
# - PYTHONUNBUFFERED: stream logs straight to stdout so `docker logs` is live
# - PIP_NO_CACHE_DIR: don't keep the pip download cache in the image layer
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies first, in their own layer. This layer is only rebuilt
# when requirements.txt changes, so day-to-day code edits stay fast.
# The pinned deps (argon2-cffi, cryptography, reportlab, …) all ship manylinux
# wheels, so no compiler is needed — keeping the image slim.
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy the application code last (changes most often → cheapest layer to rebuild).
COPY . .

# Run as an unprivileged user instead of root (defense in depth).
RUN useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

# FastAPI/uvicorn listens here; docker-compose / ECS map this port.
EXPOSE 8000

# Container-level liveness probe hitting the public root route.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/').status==200 else 1)"

# 0.0.0.0 so the server is reachable from outside the container.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
