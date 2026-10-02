"""add_course_material_topic_columns

Revision ID: a1b2c3d4e5f6
Revises: 031b54f51af7
Create Date: 2026-10-02 12:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '031b54f51af7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('course_materials', schema=None) as batch_op:
        batch_op.add_column(sa.Column('detected_subject', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('detected_category', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('detected_topics', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('document_summary', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('confidence_score', sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('course_materials', schema=None) as batch_op:
        batch_op.drop_column('confidence_score')
        batch_op.drop_column('document_summary')
        batch_op.drop_column('detected_topics')
        batch_op.drop_column('detected_category')
        batch_op.drop_column('detected_subject')
