#!/usr/bin/env bash
set -euo pipefail

cd /repo

export NSEMCLAW_STATE_DIR="/tmp/nsemclaw-test"
export NSEMCLAW_CONFIG_PATH="${NSEMCLAW_STATE_DIR}/nsemclaw.json"

echo "==> Build"
pnpm build

echo "==> Seed state"
mkdir -p "${NSEMCLAW_STATE_DIR}/credentials"
mkdir -p "${NSEMCLAW_STATE_DIR}/agents/main/sessions"
echo '{}' >"${NSEMCLAW_CONFIG_PATH}"
echo 'creds' >"${NSEMCLAW_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${NSEMCLAW_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
pnpm nsemclaw reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${NSEMCLAW_CONFIG_PATH}"
test ! -d "${NSEMCLAW_STATE_DIR}/credentials"
test ! -d "${NSEMCLAW_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${NSEMCLAW_STATE_DIR}/credentials"
echo '{}' >"${NSEMCLAW_CONFIG_PATH}"

echo "==> Uninstall (state only)"
pnpm nsemclaw uninstall --state --yes --non-interactive

test ! -d "${NSEMCLAW_STATE_DIR}"

echo "OK"
