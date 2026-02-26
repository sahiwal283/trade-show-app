#!/usr/bin/env python3
"""Append Trade Show app locations to NPM proxy_host id=9. Run inside NPM container (104) with env BACKEND_IP, FRONTEND_IP, BACKEND_PORT."""
import os
import sqlite3
import json

DB = os.environ.get("NPM_DB", "/opt/npmplus/npmplus/database.sqlite")
PROXY_HOST_ID = int(os.environ.get("NPM_PROXY_HOST_ID", "9"))
APP_BASE_PATH = os.environ.get("APP_BASE_PATH", "/apps/trade-show")
BACKEND_IP = os.environ.get("BACKEND_IP", "")
FRONTEND_IP = os.environ.get("FRONTEND_IP", "")
BACKEND_PORT = int(os.environ.get("BACKEND_PORT", "3000"))

if not BACKEND_IP or not FRONTEND_IP:
    raise SystemExit("Set BACKEND_IP and FRONTEND_IP")

conn = sqlite3.connect(DB)
r = conn.execute("SELECT locations FROM proxy_host WHERE id = ?", (PROXY_HOST_ID,)).fetchone()
locations = json.loads(r[0]) if r and r[0] else []
paths = [loc.get("path") for loc in locations if isinstance(loc, dict)]

new_api = {
    "path": f"{APP_BASE_PATH}/api",
    # Strip app base path so backend receives /api/... as expected.
    "advanced_config": f"rewrite ^{APP_BASE_PATH}(/api/.*)$ $1 break;",
    "forward_scheme": "http",
    "forward_host": BACKEND_IP,
    "forward_port": BACKEND_PORT,
}
new_spa = {
    "path": APP_BASE_PATH,
    "advanced_config": "",
    "forward_scheme": "http",
    "forward_host": FRONTEND_IP,
    "forward_port": 80,
}
for obj in [new_api, new_spa]:
    if obj.get("path") not in paths:
        locations.append(obj)
        paths.append(obj.get("path"))

conn.execute("UPDATE proxy_host SET locations = ? WHERE id = ?", (json.dumps(locations), PROXY_HOST_ID))
conn.commit()
conn.close()
print("OK")
