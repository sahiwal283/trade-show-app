#!/usr/bin/env bash
set -euo pipefail

# Install and configure Trade Show App backend on Debian/Ubuntu LXC/VM
# - Installs Node.js 18
# - Clones repo and builds backend
# - Installs Tesseract OCR
# - Creates system user and directories
# - Configures systemd service
# - Runs DB migrations and optional seed

: "${REPO_URL:=https://github.com/sahiwal283/trade-show-app.git}"
: "${BRANCH:=main}"
: "${APP_USER:=trade-show-app}"
: "${APP_DIR:=/opt/trade-show-app}"
: "${BACKEND_DIR:=${APP_DIR}/backend}"
: "${ENV_DIR:=/etc/trade-show-app}"
: "${ENV_FILE:=${ENV_DIR}/backend.env}"
: "${UPLOAD_DIR:=/var/lib/trade-show-app/uploads}"
: "${RUN_SEED:=false}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg git build-essential tesseract-ocr

# Install Node.js 18 (NodeSource)
if ! command -v node >/dev/null 2>&1 || [[ $(node -v | cut -c2-3) -lt 18 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
fi

# Create app user and directories
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" "$ENV_DIR" "$UPLOAD_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR" "$UPLOAD_DIR"
chmod 750 "$APP_DIR"
chmod 750 "$UPLOAD_DIR"

# Fetch repo
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
git fetch --all --prune
git checkout "$BRANCH"
git reset --hard "origin/${BRANCH}"

# Install backend deps and build
cd "$BACKEND_DIR"
npm ci || npm install
npm run build

# Create env file if missing
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Creating ${ENV_FILE}. Please edit with secure values." >&2
  install -d -m 750 "$ENV_DIR"
  cat >"$ENV_FILE" <<'EOF'
PORT=5000
NODE_ENV=production
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=expense_app
DB_USER=expense_user
DB_PASSWORD=change_me
JWT_SECRET=replace_with_strong_random_secret
UPLOAD_DIR=/var/lib/trade-show-app/uploads
MAX_FILE_SIZE=5242880
#CORS_ORIGIN=https://your-frontend-domain
EOF
  chmod 640 "$ENV_FILE"
fi
chown -R "$APP_USER":"$APP_USER" "$ENV_DIR"

# Systemd service install
SERVICE_SRC="${APP_DIR}/deployment/backend/trade-show-app-backend.service"
SERVICE_DST="/etc/systemd/system/trade-show-app-backend.service"
if [[ -f "$SERVICE_SRC" ]]; then
  cp "$SERVICE_SRC" "$SERVICE_DST"
  systemctl daemon-reload
  systemctl enable trade-show-app-backend.service
fi

# Run DB migrations and optional seed as app user
export $(grep -v '^#' "$ENV_FILE" | xargs -d '\n' -n1)
sudo -u "$APP_USER" bash -c "cd '$BACKEND_DIR' && npm run migrate"
if [[ "$RUN_SEED" == "true" ]]; then
  sudo -u "$APP_USER" bash -c "cd '$BACKEND_DIR' && npm run seed"
fi

systemctl restart trade-show-app-backend.service || systemctl start trade-show-app-backend.service
systemctl status trade-show-app-backend.service --no-pager -l || true

echo "Backend installation complete. Edit ${ENV_FILE} and restart service if needed."


