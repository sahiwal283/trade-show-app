"""
Cleanup script for async OCR job files on the shared ocr_uploads volume.

Retention policy:
  - Keep files for 7 days after a job reaches terminal status (succeeded/failed/cancelled).
  - Never delete files for jobs in queued or running status.
  - Dry-run is the default — pass --execute to actually delete.

Usage:
    python scripts/cleanup_async_job_files.py              # dry-run
    python scripts/cleanup_async_job_files.py --execute    # delete
    python scripts/cleanup_async_job_files.py --days 14   # 14-day retention, dry-run

This script must be run from the project root or inside the container.
It queries the DB directly — DATABASE_URL must be set.
Run manually or as a scheduled maintenance task; no cron is wired by default.
"""

import argparse
import asyncio
import os
import shutil
import sys
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Tuple


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Clean up async OCR job files past retention period")
    parser.add_argument(
        "--execute",
        action="store_true",
        default=False,
        help="Actually delete files (default: dry-run only)",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=7,
        help="Retention in days after terminal status (default: 7)",
    )
    return parser.parse_args()


async def _find_expired_jobs(cutoff: datetime) -> List[Tuple[str, str, str]]:
    """
    Return list of (job_id, status, completed_at_iso) for jobs eligible for cleanup.

    Eligible = terminal status (succeeded/failed/cancelled) AND completed_at < cutoff.
    """
    from app.db.session import async_session
    from app.db.models import OcrAsyncJob
    from sqlalchemy import select

    terminal = ("succeeded", "failed", "cancelled")

    async with async_session() as session:
        if session is None:
            print("ERROR: DB unavailable — cannot query job table", file=sys.stderr)
            sys.exit(1)

        rows = (
            await session.execute(
                select(OcrAsyncJob.id, OcrAsyncJob.status, OcrAsyncJob.completed_at)
                .where(OcrAsyncJob.status.in_(terminal))
                .where(OcrAsyncJob.completed_at < cutoff)
            )
        ).all()

    return [(str(r[0]), r[1], r[2].isoformat() if r[2] else "unknown") for r in rows]


def _job_dir(upload_dir: str, job_id: str) -> str:
    return os.path.join(upload_dir, "async_jobs", job_id)


async def main() -> None:
    args = _parse_args()

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL is not set", file=sys.stderr)
        sys.exit(1)

    from app.db.session import init_db
    init_db(database_url)

    upload_dir = os.getenv("UPLOAD_DIR", "/tmp/ocr_uploads")
    cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)
    mode = "EXECUTE" if args.execute else "DRY-RUN"

    print(f"[{mode}] Scanning jobs completed before {cutoff.isoformat()} (retention: {args.days}d)")

    expired = await _find_expired_jobs(cutoff)
    print(f"[{mode}] Found {len(expired)} expired job(s)")

    deleted = 0
    skipped = 0
    missing = 0

    for job_id, status, completed_at in expired:
        job_dir = _job_dir(upload_dir, job_id)

        if not os.path.exists(job_dir):
            missing += 1
            print(f"  MISSING  {job_id}  ({status}, {completed_at})")
            continue

        if args.execute:
            try:
                shutil.rmtree(job_dir)
                deleted += 1
                print(f"  DELETED  {job_id}  ({status}, {completed_at})")
            except Exception as exc:
                skipped += 1
                print(f"  ERROR    {job_id}  ({status}, {completed_at}): {exc}", file=sys.stderr)
        else:
            skipped += 1
            print(f"  WOULD DELETE  {job_id}  ({status}, {completed_at})")

    print(
        f"\n[{mode}] Done — deleted: {deleted}, would-delete: {0 if args.execute else skipped}, "
        f"already-missing: {missing}, errors: {skipped if args.execute else 0}"
    )


if __name__ == "__main__":
    asyncio.run(main())
