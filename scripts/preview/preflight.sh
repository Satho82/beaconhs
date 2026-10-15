#!/usr/bin/env bash
set -euo pipefail

need() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "missing required variable: $name" >&2
    exit 2
  fi
}

need IMAGE
need APP_VERSION
need PREVIEW_HOST
need PREVIEW_RUNTIME_NETWORK
need PREVIEW_RUNTIME_SECRET

[[ "$IMAGE" == *@sha256:* ]] || {
  echo "IMAGE must be an immutable digest reference" >&2
  exit 2
}
[[ "$APP_VERSION" =~ ^[0-9a-f]{40}$ ]] || {
  echo "APP_VERSION must be a 40-character Git SHA" >&2
  exit 2
}
[[ "$PREVIEW_HOST" =~ ^[a-z0-9.-]+$ ]] || {
  echo "PREVIEW_HOST must be a lowercase hostname" >&2
  exit 2
}
[[ "$PREVIEW_RUNTIME_NETWORK" != *dev* && "$PREVIEW_RUNTIME_NETWORK" != *prod* ]] || {
  echo "preview network name must not reference DEV or production" >&2
  exit 2
}

docker network inspect "$PREVIEW_RUNTIME_NETWORK" >/dev/null
docker secret inspect "$PREVIEW_RUNTIME_SECRET" >/dev/null
docker network inspect dokploy-network >/dev/null

echo "preview preflight passed"
echo "image=$IMAGE"
echo "sha=$APP_VERSION"
echo "host=$PREVIEW_HOST"
echo "runtime_network=$PREVIEW_RUNTIME_NETWORK"
