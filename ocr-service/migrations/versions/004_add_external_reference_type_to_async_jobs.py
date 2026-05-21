"""Add external_reference_type to ocr_async_jobs

Revision ID: 004_async_jobs_ext_ref_type
Revises: 003_add_ocr_async_jobs
Create Date: 2026-05-14

Additive-only migration.  Adds external_reference_type to ocr_async_jobs so
the async worker can forward it to the cost-ledger (ocr_jobs) row on creation.
"""

from alembic import op
import sqlalchemy as sa

revision = "004_async_jobs_ext_ref_type"
down_revision = "003_add_ocr_async_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ocr_async_jobs",
        sa.Column("external_reference_type", sa.String(64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ocr_async_jobs", "external_reference_type")
