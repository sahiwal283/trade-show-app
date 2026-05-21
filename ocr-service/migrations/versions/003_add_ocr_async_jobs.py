"""Add ocr_async_jobs table for Phase 2C async job lifecycle

Revision ID: 003_add_ocr_async_jobs
Revises: 002_add_admin_audit_logs
Create Date: 2026-05-14

Additive-only migration.  Does not alter ocr_jobs, provider_calls, or
admin_audit_logs.  The ocr_async_jobs table tracks the full lifecycle of
async OCR submissions and links to ocr_jobs (cost ledger) once the worker
creates the ledger row.

Worker safety: locked_at + locked_by columns support SELECT FOR UPDATE
SKIP LOCKED in the future worker.  The table is added here regardless of
ASYNC_WORKER_ENABLED so the schema is present before the worker is activated.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "003_add_ocr_async_jobs"
down_revision = "002_add_admin_audit_logs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ocr_async_jobs",
        sa.Column(
            "id",
            postgresql.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        # Nullable: set after worker creates the cost-ledger row
        sa.Column("ocr_job_id", postgresql.UUID(), nullable=True),
        # queued | running | succeeded | failed | cancelled
        sa.Column("status", sa.String(32), nullable=False, server_default="queued"),
        sa.Column("client_app", sa.String(128), nullable=True),
        sa.Column("workflow", sa.String(128), nullable=True),
        sa.Column("external_reference_id", sa.String(256), nullable=True),
        sa.Column("original_filename", sa.String(512), nullable=True),
        sa.Column("mime_type", sa.String(128), nullable=True),
        # Path on shared ocr_uploads volume — never the raw file bytes
        sa.Column("input_file_path", sa.String(1024), nullable=True),
        # Serialised OCR response (same shape as sync /ocr/ response)
        sa.Column("result_json", sa.Text(), nullable=True),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"),
        # Worker lock fields for SELECT FOR UPDATE SKIP LOCKED
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_by", sa.String(128), nullable=True),
        sa.Column(
            "queued_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["ocr_job_id"],
            ["ocr_jobs.id"],
            name="fk_ocr_async_jobs_ocr_job_id",
        ),
    )
    op.create_index("ix_ocr_async_jobs_status", "ocr_async_jobs", ["status"])
    op.create_index("ix_ocr_async_jobs_queued_at", "ocr_async_jobs", ["queued_at"])
    op.create_index("ix_ocr_async_jobs_ocr_job_id", "ocr_async_jobs", ["ocr_job_id"])


def downgrade() -> None:
    # WARNING: drops all async job history.  Only run with an explicit backup.
    op.drop_index("ix_ocr_async_jobs_ocr_job_id", table_name="ocr_async_jobs")
    op.drop_index("ix_ocr_async_jobs_queued_at", table_name="ocr_async_jobs")
    op.drop_index("ix_ocr_async_jobs_status", table_name="ocr_async_jobs")
    op.drop_table("ocr_async_jobs")
