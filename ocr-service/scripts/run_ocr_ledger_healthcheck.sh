#!/bin/bash
# Wrapper for the OCR ledger health check cron job.
#
# Loads alert configuration from /etc/ocr-service/alert.env (root-readable,
# mode 600) before running check_ocr_ledger_health.py.  The config file is
# kept outside the repo so credentials never appear in VCS or cron output.
#
# Crontab entry (replace previous direct invocation):
#   */2 * * * * /opt/ocr-build/scripts/run_ocr_ledger_healthcheck.sh >> /var/log/ocr-ledger-healthcheck.log 2>&1

set -euo pipefail

CONFIG_FILE="/etc/ocr-service/alert.env"
SCRIPT="/opt/ocr-build/scripts/check_ocr_ledger_health.py"

if [ -f "$CONFIG_FILE" ]; then
    # Source the config, exporting every variable defined in it.
    # The file must not contain shell-expansion characters on sensitive lines.
    set -a
    # shellcheck source=/dev/null
    . "$CONFIG_FILE"
    set +a
fi

exec /usr/bin/python3 "$SCRIPT"
