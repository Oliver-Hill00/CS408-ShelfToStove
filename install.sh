#!/usr/bin/env bash
# Installs and starts ShelfToStove on a fresh Ubuntu EC2 server. Run ON THE SERVER from a clone of the repo:
#   git clone https://github.com/Oliver-Hill00/CS408-ShelfToStove.git
#   cd CS408-ShelfToStove
#   sudo ./install.sh
# Safe to run again: it re-copies the code and restarts the service.
set -euo pipefail

APP_NAME="shelftostove"
APP_DIR="/opt/${APP_NAME}"
APP_USER="ubuntu"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run with sudo: sudo ./install.sh" >&2
  exit 1
fi

# 1. Server setup: Node.js, nginx (port 80 -> 3000), systemd service
bash "$REPO_DIR/deploy/setup-ec2.sh"

# 2. Copy the app into place (skip the repo's own app dir if run from there)
if [ "$REPO_DIR" != "$APP_DIR" ]; then
  echo "==> Copying code to ${APP_DIR}"
  rsync -a --delete --exclude=node_modules --exclude=.git --exclude='*.pem' --exclude=.env --exclude='.env.*' \
    "$REPO_DIR/" "$APP_DIR/"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# 3. Install dependencies and start the app
echo "==> Installing dependencies"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm ci --omit=dev"

echo "==> Starting ${APP_NAME}"
systemctl restart "$APP_NAME"

# 4. Confirm it is reachable through nginx
echo "==> Checking http://localhost/api/health"
for i in 1 2 3 4 5; do
  if curl -fsS http://localhost/api/health >/dev/null; then
    PUBLIC_IP="$(curl -fsS --max-time 2 https://checkip.amazonaws.com 2>/dev/null || echo '<PUBLIC-IP>')"
    echo "Install complete: http://${PUBLIC_IP}/"
    exit 0
  fi
  sleep 2
done
echo "ERROR: health check failed. See: sudo journalctl -u ${APP_NAME} -n 50" >&2
exit 1
