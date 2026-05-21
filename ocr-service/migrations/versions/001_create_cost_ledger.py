"""Create cost ledger tables: ocr_jobs and provider_calls

Revision ID: 001_create_cost_ledger
Revises:
Create Date: 2026-05-08
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001_create_cost_ledger"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # pgcrypto provides gen_random_uuid() used as the server-side default.
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.create_table(
        "ocr_jobs",
        sa.Column(
            "id",
            postgresql.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("request_id", postgresql.UUID(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="received"),
        sa.Column("client_app", sa.String(128), nullable=True),
        sa.Column("brand", sa.String(128), nullable=True),
        sa.Column("workflow", sa.String(128), nullable=True),
        sa.Column("external_reference_type", sa.String(64), nullable=True),
        sa.Column("external_reference_id", sa.String(256), nullable=True),
        sa.Column("caller_env", sa.String(64), nullable=True),
        sa.Column("caller_version", sa.String(64), nullable=True),
        sa.Column("user_id", sa.String(256), nullable=True),
        sa.Column("idempotency_key", sa.String(512), nullable=True),
        sa.Column("file_name", sa.String(512), nullable=True),
        sa.Column("file_content_type", sa.String(128), nullable=True),
        sa.Column("input_file_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("ocr_provider_used", sa.String(64), nullable=True),
        sa.Column("total_estimated_cost_usd", sa.Numeric(12, 8), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ocr_jobs_request_id", "ocr_jobs", ["request_id"])
    op.create_index("ix_ocr_jobs_idempotency_key", "ocr_jobs", ["idempotency_key"])

    op.create_table(
        "provider_calls",
        sa.Column(
            "id",
            postgresql.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("job_id", postgresql.UUID(), nullable=False),
        sa.Column("request_id", postgresql.UUID(), nullable=False),
        sa.Column("provider_name", sa.String(64), nullable=False),
        sa.Column("provider_type", sa.String(32), nullable=False),
        sa.Column("call_purpose", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="started"),
        sa.Column("usage_units", sa.BigInteger(), nullable=True),
        sa.Column("usage_unit_type", sa.String(32), nullable=True),
        sa.Column("estimated_cost_usd", sa.Numeric(12, 8), nullable=True),
        sa.Column("unit_price_usd", sa.Numeric(12, 8), nullable=True),
        sa.Column("pricing_unit", sa.String(32), nullable=True),
        sa.Column("pricing_source", sa.String(64), nullable=True),
        sa.Column("pricing_effective_date", sa.String(16), nullable=True),
        sa.Column("cost_basis", sa.String(64), nullable=True),
        sa.Column("raw_metadata_json", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Numeric(12, 3), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["job_id"], ["ocr_jobs.id"], name="fk_provider_calls_job_id"),
    )
    op.create_index("ix_provider_calls_job_id", "provider_calls", ["job_id"])
    op.create_index("ix_provider_calls_request_id", "provider_calls", ["request_id"])


def downgrade() -> None:
    # WARNING: dropping these tables deletes all cost history.
    # Only run downgrade with an explicit backup and approval; never in production.
    op.drop_table("provider_calls")
    op.drop_table("ocr_jobs")
