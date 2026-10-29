#!/usr/bin/env bash
# Builds and starts everything with the version number recorded, so Settings, Software updates knows which version is running.
# Use this instead of "docker compose up -d --build". Extra arguments go to docker compose, e.g. ./scripts/deploy.sh --profile https
set -euo pipefail
cd "$(dirname "$0")/.."
export APP_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
mkdir -p updates backups
exec docker compose "$@" up -d --build
