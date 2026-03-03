#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${NSEMCLAW_IMAGE:-${CLAWDBOT_IMAGE:-nsemclaw:local}}"
CONFIG_DIR="${NSEMCLAW_CONFIG_DIR:-${CLAWDBOT_CONFIG_DIR:-$HOME/.nsemclaw}}"
WORKSPACE_DIR="${NSEMCLAW_WORKSPACE_DIR:-${CLAWDBOT_WORKSPACE_DIR:-$HOME/.nsemclaw/workspace}}"
PROFILE_FILE="${NSEMCLAW_PROFILE_FILE:-${CLAWDBOT_PROFILE_FILE:-$HOME/.profile}}"

PROFILE_MOUNT=()
if [[ -f "$PROFILE_FILE" ]]; then
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
fi

echo "==> Build image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

echo "==> Run gateway live model tests (profile keys)"
docker run --rm -t \
  --entrypoint bash \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
  -e NSEMCLAW_LIVE_TEST=1 \
  -e NSEMCLAW_LIVE_GATEWAY_MODELS="${NSEMCLAW_LIVE_GATEWAY_MODELS:-${CLAWDBOT_LIVE_GATEWAY_MODELS:-modern}}" \
  -e NSEMCLAW_LIVE_GATEWAY_PROVIDERS="${NSEMCLAW_LIVE_GATEWAY_PROVIDERS:-${CLAWDBOT_LIVE_GATEWAY_PROVIDERS:-}}" \
  -e NSEMCLAW_LIVE_GATEWAY_MAX_MODELS="${NSEMCLAW_LIVE_GATEWAY_MAX_MODELS:-${CLAWDBOT_LIVE_GATEWAY_MAX_MODELS:-24}}" \
  -e NSEMCLAW_LIVE_GATEWAY_MODEL_TIMEOUT_MS="${NSEMCLAW_LIVE_GATEWAY_MODEL_TIMEOUT_MS:-${CLAWDBOT_LIVE_GATEWAY_MODEL_TIMEOUT_MS:-}}" \
  -v "$CONFIG_DIR":/home/node/.nsemclaw \
  -v "$WORKSPACE_DIR":/home/node/.nsemclaw/workspace \
  "${PROFILE_MOUNT[@]}" \
  "$IMAGE_NAME" \
  -lc "set -euo pipefail; [ -f \"$HOME/.profile\" ] && source \"$HOME/.profile\" || true; cd /app && pnpm test:live"
