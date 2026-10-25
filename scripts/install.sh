#!/usr/bin/env bash
# Step 1 of 2 on a fresh Ubuntu 24.04 EC2 instance: system packages, Node.js 24, and the app code.
# Run as the ubuntu user (not with sudo; the script calls sudo where it needs to):
#   curl -O https://raw.githubusercontent.com/Oliver-Hill00/CS408-ShelfToStove/main/scripts/install.sh
#   chmod +x install.sh && ./install.sh
# Then run step 2:
#   cd /opt/shelftostove && ./scripts/configure.sh
# Safe to run again: it pulls the latest code instead of cloning.
set -euo pipefail

APP_DIR=/opt/shelftostove
REPO_URL=https://github.com/Oliver-Hill00/CS408-ShelfToStove.git
NODE_MAJOR=24
APT=(sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get -y
     -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

if [ "$(id -u)" -eq 0 ]; then
  echo "ERROR: run as the ubuntu user, not root or sudo: ./install.sh" >&2
  exit 1
fi

echo "==> System updates and base packages"
sudo apt-get update
"${APT[@]}" upgrade
"${APT[@]}" install curl git sqlite3 nginx build-essential

echo "==> Node.js ${NODE_MAJOR} LTS from NodeSource"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  "${APT[@]}" install nodejs
fi
echo "    node $(node -v), npm $(npm -v)"

echo "==> Application code in ${APP_DIR}"
sudo mkdir -p "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  sudo chown -R "$USER:$USER" "$APP_DIR"
  git -C "$APP_DIR" pull --ff-only
else
  if [ -n "$(ls -A "$APP_DIR")" ]; then
    # Left over from an older non-git deploy: keep it, but out of the way
    BACKUP="${APP_DIR}.bak-$(date +%Y%m%d%H%M%S)"
    echo "    ${APP_DIR} is not a git checkout; moving its contents to ${BACKUP}"
    sudo mv "$APP_DIR" "$BACKUP"
    sudo mkdir -p "$APP_DIR"
  fi
  sudo chown "$USER:$USER" "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

echo "==> Installing npm dependencies"
cd "$APP_DIR"
npm ci --omit=dev

echo
echo "Install complete. Next: cd ${APP_DIR} && ./scripts/configure.sh"
