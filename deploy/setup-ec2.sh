#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu EC2 server. Run ON THE SERVER:
#   sudo bash deploy/setup-ec2.sh
set -euo pipefail

APP_NAME="shelftostove"
APP_DIR="/opt/${APP_NAME}"
APP_USER="ubuntu"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run with sudo: sudo bash deploy/setup-ec2.sh" >&2
  exit 1
fi

echo "==> Updating packages"
apt-get update -y

echo "==> Installing curl, rsync, nginx"
apt-get install -y curl ca-certificates rsync nginx

echo "==> Installing Node.js 22 (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> Creating app directory ${APP_DIR}"
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> Configuring nginx to forward port 80 -> 3000"
cp "$SCRIPT_DIR/nginx-shelftostove.conf" /etc/nginx/sites-available/${APP_NAME}
ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/${APP_NAME}
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "==> Installing systemd service"
cp "$SCRIPT_DIR/${APP_NAME}.service" /etc/systemd/system/${APP_NAME}.service
systemctl daemon-reload
systemctl enable ${APP_NAME}

echo "==> Allowing ${APP_USER} to restart the service without a password (used by deploy.sh)"
echo "${APP_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl restart ${APP_NAME}, /usr/bin/systemctl status ${APP_NAME}" > /etc/sudoers.d/${APP_NAME}
chmod 440 /etc/sudoers.d/${APP_NAME}

echo "Setup complete. Now run ./deploy/deploy.sh from your laptop."
