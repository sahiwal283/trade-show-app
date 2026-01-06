#!/usr/bin/env bash
set -euo pipefail

# Build the React frontend and publish to a web root (on Nginx host)
# Usage: WEB_ROOT=/var/www/trade-show-app/current ./build-and-deploy.sh

: "${WEB_ROOT:=/var/www/trade-show-app/current}"

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

echo "Building frontend..."
npm ci || npm install
npm run build

echo "Publishing to $WEB_ROOT..."
sudo mkdir -p "$WEB_ROOT"
sudo rm -rf "$WEB_ROOT"/*
sudo cp -r dist/* "$WEB_ROOT"/

sudo chown -R www-data:www-data "$(dirname "$WEB_ROOT")"
sudo find "$WEB_ROOT" -type d -exec chmod 755 {} +
sudo find "$WEB_ROOT" -type f -exec chmod 644 {} +

echo "Frontend published to $WEB_ROOT"


