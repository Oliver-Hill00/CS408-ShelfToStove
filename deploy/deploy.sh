#!/usr/bin/env bash
# Deploys the latest pushed code to the server. Run FROM YOUR LAPTOP after "git push":
#   ./deploy/deploy.sh -h <PUBLIC-IP> -i ~/keys/Login.pem
# Runs the tests, then on the server: git pull, npm ci, db:init (adds new tables), restart.
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
{ [ -z "$HOST" ] || [ -z "$KEY" ]; } && usage
[ -f "$KEY" ] || { echo "ERROR: key not found: $KEY" >&2; exit 1; }
for tool in ssh curl npm git; do
  command -v "$tool" >/dev/null || { echo "ERROR: $tool is not installed on this machine." >&2; exit 1; }
done

cd "$(dirname "$0")/.."

echo "==> Checking that your commits are pushed (the server pulls from GitHub)"
git fetch --quiet origin
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "WARNING: you have uncommitted changes; they will NOT be deployed."
fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse '@{u}' 2>/dev/null || echo none)" ]; then
  echo "WARNING: your branch differs from origin; run git push first or the server gets the old code."
fi

echo "==> Running tests"
[ -d node_modules ] || npm install
npm test

echo "==> Pulling and restarting on ${REMOTE_USER}@${HOST}"
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "${REMOTE_USER}@${HOST}" \
  "cd ${APP_DIR} && git pull --ff-only && npm ci --omit=dev && npm run db:init && sudo systemctl restart ${APP_NAME}"

echo "==> Checking http://${HOST}/api/health"
for _ in 1 2 3 4 5; do
  if curl -fsS "http://${HOST}/api/health" >/dev/null; then
    echo "Deploy succeeded: http://${HOST}/"
    exit 0
  fi
  sleep 2
done
echo "ERROR: health check failed at http://${HOST}/api/health" >&2
exit 1
