#!/usr/bin/env bash
# Step 2 of 2: environment file, database, systemd service (start on boot), and Nginx (port 80 -> 3000).
# Run as the ubuntu user after scripts/install.sh:
#   cd /opt/shelftostove && ./scripts/configure.sh
# Safe to run again: keeps an existing .env and database (seed is skipped if recipes exist).
set -euo pipefail

APP_NAME=shelftostove
APP_DIR=/opt/shelftostove
APP_USER="$(id -un)"
PORT=3000

if [ "$(id -u)" -eq 0 ]; then
  echo "ERROR: run as the ubuntu user, not root or sudo: ./scripts/configure.sh" >&2
  exit 1
fi
cd "$APP_DIR"

echo "==> Environment variables (.env)"
if [ -f .env ]; then
  echo "    .env already exists; leaving it unchanged"
else
  cat > .env <<EOF
NODE_ENV=production
PORT=${PORT}
DB_PATH=${APP_DIR}/data/${APP_NAME}.db
EOF
  chmod 600 .env
fi

echo "==> Database: create tables and load seed data"
mkdir -p data public/uploads
npm run db:init
npm run db:seed

echo "==> systemd service (starts on boot, restarts on crash)"
sudo tee /etc/systemd/system/${APP_NAME}.service > /dev/null <<EOF
[Unit]
Description=Shelf-To-Stove Express app
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=$(command -v node) server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable ${APP_NAME}
sudo systemctl restart ${APP_NAME}

echo "==> Nginx reverse proxy: port 80 -> ${PORT}"
sudo tee /etc/nginx/sites-available/${APP_NAME} > /dev/null <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    client_max_body_size 5M;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/${APP_NAME}
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

# Remove the sudoers rule from the old deploy/setup-ec2.sh, if present (ubuntu already has sudo)
sudo rm -f /etc/sudoers.d/${APP_NAME}

echo "==> Checking http://localhost/api/health"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://localhost/api/health > /dev/null; then
    PUBLIC_IP="$(curl -fsS --max-time 2 https://checkip.amazonaws.com 2>/dev/null || echo '<public-ip>')"
    echo
    echo "Configure complete: http://${PUBLIC_IP}/"
    echo "Seeded tables:  sqlite3 ${APP_DIR}/data/${APP_NAME}.db 'SELECT COUNT(*) FROM recipes;'"
    echo "Run-on-boot:    sudo reboot, wait a minute, then reload the page"
    exit 0
  fi
  sleep 2
done
echo "ERROR: app did not respond. Check: sudo systemctl status ${APP_NAME}; journalctl -u ${APP_NAME} -n 50" >&2
exit 1
