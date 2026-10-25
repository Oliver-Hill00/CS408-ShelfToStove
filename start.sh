#!/usr/bin/env bash
# Installs every dependency and starts the app. Safe to run again.
set -euo pipefail
cd "$(dirname "$0")"

REQUIRED_NODE_MAJOR=20
PORT="${PORT:-3000}"

# 1. Check required tools
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed. Install Node.js ${REQUIRED_NODE_MAJOR}+ from https://nodejs.org" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is not installed. It ships with Node.js: https://nodejs.org" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]; then
  echo "ERROR: Node.js ${REQUIRED_NODE_MAJOR}+ required, found $(node -v)." >&2
  exit 1
fi

# 2. Install project dependencies
echo "Installing dependencies..."
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

# 3. First-run setup: create the SQLite tables and seed data (skipped if already seeded)
npm run db:init
npm run db:seed

# 4. Start the app and print the URL
echo "Starting app at http://localhost:${PORT}"
PORT="$PORT" exec node server.js
