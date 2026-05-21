#!/usr/bin/env python3
"""
OCR Ledger DB health check script.

Run on the OCR app host every 2 minutes via cron.

Usage:
    python3 /opt/ocr-build/scripts/check_ocr_ledger_health.py

Checks (via the running service's /health/ledger endpoint):
  - App is reachable
  - DB connected
  - Required tables exist
  - alembic_version present
  - Write capability confirmed (transaction-rollback, no committed rows)

Exit codes:
  0  all checks passed
  1  one or more checks failed or app unreachable

Logs to:  /var/log/ocr-ledger-healthcheck.log
Marker:   /var/run/ocr-ledger-healthcheck.failed  (created on failure, removed on recovery)

Alerting (disabled by default — set OCR_LEDGER_ALERT_ENABLED=true to activate):
  Sends a webhook POST on first failure and again on recovery.
  Duplicate-suppressed: at most one alert per OCR_LEDGER_ALERT_MIN_INTERVAL_SECONDS (default 1800).
  State file: /var/run/ocr-ledger-healthcheck.alerted

  Required env vars when enabled:
    OCR_LEDGER_ALERT_WEBHOOK_URL  — HTTP(S) endpoint to POST (Alfred /v1/events/publish or any webhook)

  Optional env vars:
    OCR_LEDGER_ALERT_APP_SLUG     — value for X-App-Slug header (Alfred auth)
    OCR_LEDGER_ALERT_TOKEN        — value for X-Internal-Token header (Alfred auth)
    OCR_LEDGER_ALERT_MIN_INTERVAL_SECONDS  — minimum seconds between repeated failure alerts (default 1800)
    OCR_LEDGER_ALERT_RECOVERY_ENABLED      — send recovery notification (default true)

  Alfred onboarding required to activate Alfred routing:
    1. Create an "ocr_service" app in Alfred (requires admin CRUD implementation or seed script)
    2. Define events: ocr.ledger.unhealthy (priority high) and ocr.ledger.recovered (priority normal)
    3. Create a Telegram message template for each event
    4. Add a destination for the ops/infra Telegram chat
    5. Create routing rules: ocr_service + event_type → destination + template
    Until then, point OCR_LEDGER_ALERT_WEBHOOK_URL at any HTTP endpoint that accepts a JSON POST.

No secrets are printed in logs or stdout.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
APP_URL = os.environ.get("OCR_APP_URL", "http://localhost:8000")
ENDPOINT = f"{APP_URL}/health/ledger"
TIMEOUT_SECONDS = 10
LOG_FILE = "/var/log/ocr-ledger-healthcheck.log"
FAILURE_MARKER = "/var/run/ocr-ledger-healthcheck.failed"

# Alerting config
ALERT_ENABLED = os.environ.get("OCR_LEDGER_ALERT_ENABLED", "false").lower() == "true"
ALERT_WEBHOOK_URL = os.environ.get("OCR_LEDGER_ALERT_WEBHOOK_URL", "")
ALERT_APP_SLUG = os.environ.get("OCR_LEDGER_ALERT_APP_SLUG", "")
ALERT_TOKEN = os.environ.get("OCR_LEDGER_ALERT_TOKEN", "")
ALERT_MIN_INTERVAL = int(os.environ.get("OCR_LEDGER_ALERT_MIN_INTERVAL_SECONDS", "1800"))
ALERT_RECOVERY_ENABLED = os.environ.get("OCR_LEDGER_ALERT_RECOVERY_ENABLED", "true").lower() == "true"
ALERT_STATE_FILE = "/var/run/ocr-ledger-healthcheck.alerted"
ALERT_TIMEOUT_SECONDS = 8


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _log(msg: str) -> None:
    line = f"{_ts()} {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a") as fh:
            fh.write(line + "\n")
    except OSError:
        pass  # log file may not be writable in all envs; stdout is enough


def _set_failed(reason: str) -> None:
    try:
        with open(FAILURE_MARKER, "w") as fh:
            fh.write(f"{_ts()} {reason}\n")
    except OSError:
        pass


def _clear_failed() -> None:
    try:
        if os.path.exists(FAILURE_MARKER):
            os.remove(FAILURE_MARKER)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Alert state (duplicate suppression)
# ---------------------------------------------------------------------------
def _read_alert_state() -> dict:
    """Return persisted alert state or empty dict."""
    try:
        with open(ALERT_STATE_FILE) as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}


def _write_alert_state(state: dict) -> None:
    try:
        with open(ALERT_STATE_FILE, "w") as fh:
            json.dump(state, fh)
    except OSError:
        pass


def _clear_alert_state() -> None:
    try:
        if os.path.exists(ALERT_STATE_FILE):
            os.remove(ALERT_STATE_FILE)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Webhook dispatch
# ---------------------------------------------------------------------------
def _send_webhook(event_type: str, payload: dict) -> bool:
    """
    POST a JSON body to ALERT_WEBHOOK_URL.

    For Alfred: include X-App-Slug + X-Internal-Token headers and wrap
    payload in Alfred's events/publish contract.
    Returns True on HTTP 2xx, False otherwise.
    """
    if not ALERT_WEBHOOK_URL:
        _log("WARN  alert enabled but OCR_LEDGER_ALERT_WEBHOOK_URL not set; skipping")
        return False

    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "ocr-ledger-watchdog/1.0",
    }
    if ALERT_APP_SLUG:
        headers["X-App-Slug"] = ALERT_APP_SLUG
    if ALERT_TOKEN:
        headers["X-Internal-Token"] = ALERT_TOKEN

    try:
        req = urllib.request.Request(ALERT_WEBHOOK_URL, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=ALERT_TIMEOUT_SECONDS) as resp:
            status_code = resp.status
        if 200 <= status_code < 300:
            _log(f"INFO  alert dispatched event_type={event_type} http={status_code}")
            return True
        _log(f"WARN  alert endpoint returned http={status_code} for event_type={event_type}")
        return False
    except urllib.error.URLError as exc:
        _log(f"WARN  alert dispatch failed (URLError): {exc.reason}")
        return False
    except Exception as exc:
        _log(f"WARN  alert dispatch failed ({type(exc).__name__}); will retry next cycle")
        return False


def _build_payload(event_type: str, reason: str = "", version: str = "unknown") -> dict:
    """Build the webhook POST body."""
    return {
        "event_type": event_type,
        "source": "ocr-ledger-watchdog",
        "service": "ocr-service",
        "version": version,
        "timestamp": _ts(),
        "reason": reason,
    }


# ---------------------------------------------------------------------------
# Alert dispatch with suppression
# ---------------------------------------------------------------------------
def maybe_send_failure_alert(reason: str, version: str) -> None:
    if not ALERT_ENABLED:
        return

    state = _read_alert_state()
    now = time.time()
    last_alerted = state.get("alerted_at_epoch", 0)

    if now - last_alerted < ALERT_MIN_INTERVAL:
        remaining = int(ALERT_MIN_INTERVAL - (now - last_alerted))
        _log(f"INFO  alert suppressed (duplicate within interval; next eligible in {remaining}s)")
        return

    payload = _build_payload("ocr.ledger.unhealthy", reason=reason, version=version)
    sent = _send_webhook("ocr.ledger.unhealthy", payload)
    if sent:
        _write_alert_state({
            "alerted_at_epoch": now,
            "alerted_at": _ts(),
            "reason": reason,
        })


def maybe_send_recovery_alert(version: str) -> None:
    if not ALERT_ENABLED or not ALERT_RECOVERY_ENABLED:
        return

    state = _read_alert_state()
    if not state:
        return  # never entered alerted state; no recovery needed

    payload = _build_payload("ocr.ledger.recovered", version=version)
    _send_webhook("ocr.ledger.recovered", payload)
    _clear_alert_state()


# ---------------------------------------------------------------------------
# Main check
# ---------------------------------------------------------------------------
def run_check() -> int:
    _log(f"INFO  check started → {ENDPOINT}")

    # 1. HTTP request to /health/ledger
    try:
        req = urllib.request.Request(ENDPOINT, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            raw = resp.read().decode("utf-8")
            payload = json.loads(raw)
    except urllib.error.URLError as exc:
        reason = f"app unreachable: {exc.reason}"
        _log(f"ERROR {reason}")
        _set_failed(reason)
        maybe_send_failure_alert(reason, version="unknown")
        return 1
    except Exception as exc:
        reason = f"unexpected: {type(exc).__name__}"
        _log(f"ERROR unexpected error reaching app: {type(exc).__name__}")
        _set_failed(reason)
        maybe_send_failure_alert(reason, version="unknown")
        return 1

    # 2. Parse response
    ledger = payload.get("ledger_db", {})
    overall = payload.get("status", "unknown")
    version = payload.get("version", "unknown")
    connected = ledger.get("connected", False)
    tables_ok = ledger.get("tables_ok", False)
    alembic_ok = ledger.get("alembic_ok", False)
    alembic_ver = ledger.get("alembic_version", "?")
    write_ok = ledger.get("write_ok", False)
    db_error = ledger.get("error")

    _log(
        f"INFO  version={version} status={overall} "
        f"connected={connected} tables={tables_ok} "
        f"alembic={alembic_ok}({alembic_ver}) write={write_ok}"
    )

    if db_error:
        # Truncate error to avoid leaking credentials (URLs may contain passwords)
        safe_err = str(db_error)[:120].split("@")[-1] if "@" in str(db_error) else str(db_error)[:120]
        _log(f"WARN  db_error (truncated): {safe_err}")

    # 3. Evaluate
    checks_failed = []
    if not connected:
        checks_failed.append("db_not_connected")
    if not tables_ok:
        checks_failed.append("tables_missing")
    if not alembic_ok:
        checks_failed.append("alembic_version_missing")
    if not write_ok:
        checks_failed.append("write_check_failed")

    if checks_failed:
        reason = ",".join(checks_failed)
        _log(f"FAIL  checks failed: {reason}")
        _set_failed(reason)
        maybe_send_failure_alert(reason, version=version)
        return 1

    _log("OK    all ledger health checks passed")
    _clear_failed()
    maybe_send_recovery_alert(version=version)
    return 0


if __name__ == "__main__":
    sys.exit(run_check())
