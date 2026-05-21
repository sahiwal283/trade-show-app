#!/usr/bin/env python3
"""
OCR Ledger Alert Receiver.

Minimal stdlib-only HTTP server that accepts JSON alert POSTs from the OCR
ledger watchdog.  Runs as a systemd service on the OCR app host, bound to localhost.

Endpoints:
  POST /alert   — receive an alert event, log it, return 200
  GET  /health  — liveness probe for systemd / monitoring

Alert log: /var/log/ocr-ledger-alerts.log
Bind:      127.0.0.1:9001 (override via env ALERT_RECEIVER_HOST / ALERT_RECEIVER_PORT)

Authentication (optional):
  Set ALERT_RECEIVER_TOKEN.  If set, every POST must carry
  Authorization: Bearer <token>.  The token is never logged.

This service is Alfred-independent.  It is designed to be replaced once
Alfred's ocr_service app onboarding is complete by simply pointing
OCR_LEDGER_ALERT_WEBHOOK_URL at Alfred instead.
"""

import json
import os
import socket
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

LISTEN_HOST: str = os.environ.get("ALERT_RECEIVER_HOST", "127.0.0.1")
LISTEN_PORT: int = int(os.environ.get("ALERT_RECEIVER_PORT", "9001"))
ALERT_LOG: str = "/var/log/ocr-ledger-alerts.log"
RECEIVER_TOKEN: str = os.environ.get("ALERT_RECEIVER_TOKEN", "")
MAX_BODY_BYTES: int = 64 * 1024  # guard against oversized payloads


# ---------------------------------------------------------------------------
# Pure helpers (testable without HTTP machinery)
# ---------------------------------------------------------------------------

def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _log(line: str) -> None:
    stamped = f"{_ts()} {line}"
    print(stamped, flush=True)
    try:
        with open(ALERT_LOG, "a") as fh:
            fh.write(stamped + "\n")
    except OSError:
        pass


def process_alert_payload(payload: dict, peer_ip: str = "") -> tuple:
    """
    Validate and format an alert payload dict.

    Returns (http_status: int, log_line: str).
    http_status 400 means the payload is missing required fields.
    """
    event_type = str(payload.get("event_type", "")).strip()
    if not event_type:
        return 400, "WARN  received alert with missing event_type"

    service = str(payload.get("service", "unknown"))[:64]
    reason = str(payload.get("reason", ""))[:500]
    version = str(payload.get("version", "unknown"))[:32]
    source = str(payload.get("source", "unknown"))[:64]
    timestamp = str(payload.get("timestamp", ""))[:32]

    # Redact anything that looks like a credential URL (contains @)
    safe_reason = reason.split("@")[-1] if "@" in reason else reason

    severity = "CRITICAL" if "unhealthy" in event_type else "INFO"
    log_line = (
        f"[{severity}] event_type={event_type} service={service} "
        f"version={version} source={source} "
        f"reason={safe_reason!r} ts={timestamp or _ts()} peer={peer_ip}"
    )
    return 200, log_line


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

class _AlertHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress default access log output

    def _send_json(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"status": "ok", "service": "ocr-alert-receiver"})
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/alert":
            self._send_json(404, {"error": "not found"})
            return

        # Token auth
        if RECEIVER_TOKEN:
            auth = self.headers.get("Authorization", "")
            provided = auth.removeprefix("Bearer ").strip()
            if provided != RECEIVER_TOKEN:
                self._send_json(401, {"error": "unauthorized"})
                return

        # Read body
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > MAX_BODY_BYTES:
                self._send_json(413, {"error": "payload too large"})
                return
            body = self.rfile.read(length)
            payload = json.loads(body)
        except (ValueError, json.JSONDecodeError):
            self._send_json(400, {"error": "invalid JSON"})
            return
        except Exception:
            self._send_json(400, {"error": "bad request"})
            return

        peer_ip = self.client_address[0] if self.client_address else ""
        status, log_line = process_alert_payload(payload, peer_ip=peer_ip)

        _log(log_line)

        if status != 200:
            self._send_json(status, {"error": "missing required fields"})
            return

        event_type = str(payload.get("event_type", ""))
        self._send_json(200, {"status": "received", "event_type": event_type})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def make_server(host: str = LISTEN_HOST, port: int = LISTEN_PORT) -> HTTPServer:
    return HTTPServer((host, port), _AlertHandler)


if __name__ == "__main__":
    _log(f"INFO  alert receiver starting on {LISTEN_HOST}:{LISTEN_PORT}")
    server = make_server()
    actual_port = server.server_address[1]
    if actual_port != LISTEN_PORT:
        _log(f"INFO  bound to port {actual_port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        _log("INFO  alert receiver shutting down")
        server.server_close()
        sys.exit(0)
