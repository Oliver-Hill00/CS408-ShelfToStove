#!/usr/bin/env bash
# Copies the code to the server and restarts it. Run FROM YOUR LAPTOP:
#   ./deploy/deploy.sh -h <PUBLIC-IP> -i ~/keys/mykey.pem
set -euo pipefail

APP_NAME="shelftostove"
APP_DIR="/opt/${APP_NAME}"
REMOTE_USER="ubuntu"
HOST=""
KEY=""

usage() { echo "Usage: $0 -h <PUBLIC-IP> -i <path-to-key.pem>" >&2; exit 1; }

while getopts "h:i:" opt; do
  case "$opt" in
    h) HOST="$OPTARG" ;;
    i) KEY="$OPTARG" ;;
    *) usage ;;
  esac
done
[ -z "$HOST" ] || [ -z "$KEY" ] && usage
[ -f "$KEY" ] || { echo "ERROR: key not found: $KEY" >&2; exit 1; }
for tool in ssh tar curl npm; do
  command -v "$tool" >/dev/null || { echo "ERROR: $tool is not installed on this machine." >&2; exit 1; }
done

cd "$(dirname "$0")/.."
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new)

echo "==> Running tests"
[ -d node_modules ] || npm install
npm test

echo "==> Copying code to ${REMOTE_USER}@${HOST}:${APP_DIR}"
EXCLUDES=(--exclude=node_modules --exclude=.git --exclude='*.pem' --exclude=.env --exclude='.env.*')
if command -v rsync >/dev/null 2>&1; then
  rsync -az --delete "${EXCLUDES[@]}" -e "ssh ${SSH_OPTS[*]}" ./ "${REMOTE_USER}@${HOST}:${APP_DIR}/"
else
  # Git Bash on Windows has no rsync: clear old files (keep node_modules), then stream a tarball over ssh
  echo "    (rsync not found, using tar over ssh)"
  ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${HOST}" \
    "find ${APP_DIR} -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +"
  tar -czf - "${EXCLUDES[@]}" . | ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${HOST}" "tar -xzf - -C ${APP_DIR}"
fi

echo "==> Installing dependencies and restarting service"
ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${HOST}" \
  "cd ${APP_DIR} && npm ci --omit=dev && sudo systemctl restart ${APP_NAME}"

echo "==> Checking http://${HOST}/api/health"
for i in 1 2 3 4 5; do
  if curl -fsS "http://${HOST}/api/health" >/dev/null; then
    echo "Deploy succeeded: http://${HOST}/"
    exit 0
  fi
  sleep 2
done
echo "ERROR: health check failed at http://${HOST}/api/health" >&2
exit 1
