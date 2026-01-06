#!/usr/bin/env bash
set -euo pipefail

# Install and serve the Trade Show App frontend in an LXC/VM
# - Installs Node.js 18
# - Builds the React app
# - Serves static files with 'serve' on port 8080 via systemd

: "${REPO_URL:=https://github.com/sahiwal283/trade-show-app.git}"
: "${BRANCH:=main}"
: "${APP_USER:=trade-show-app}"
: "${APP_DIR:=/opt/trade-show-app}"
: "${WEB_DIR:=/opt/trade-show-app/frontend}"
: "${PORT:=8080}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg git

# Install Node.js 18 (NodeSource)
if ! command -v node >/dev/null 2>&1 || [[ $(node -v | cut -c2-3) -lt 18 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
fi

id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" "$WEB_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# Fetch repo
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
git fetch --all --prune
git checkout "$BRANCH"
git reset --hard "origin/${BRANCH}"

# Build frontend (repo root)
npm ci || npm install
npm run build

rm -rf "$WEB_DIR"/*
cp -r dist "$WEB_DIR"
chown -R "$APP_USER":"$APP_USER" "$WEB_DIR"

npm install -g serve

SERVICE_SRC="${APP_DIR}/deployment/frontend/trade-show-app-frontend.service"
SERVICE_DST="/etc/systemd/system/trade-show-app-frontend.service"
if [[ -f "$SERVICE_SRC" ]]; then
  sed "s|__WEB_DIR__|$WEB_DIR|g; s|__PORT__|$PORT|g; s|__USER__|$APP_USER|g" "$SERVICE_SRC" > "$SERVICE_DST"
  systemctl daemon-reload
  systemctl enable --now trade-show-app-frontend.service
fi

echo "Frontend installed and serving on port ${PORT}."


