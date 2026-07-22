"""Static checks on the initial prisma migration and DATA_MODEL.md doc.

The data-model PR's acceptance criteria require:
- an initial migration that creates every model in the schema, and
- a checked-in schema doc that documents the same models.

These tests assert both invariants without needing a live database.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / "prisma" / "schema.prisma"
MIGRATIONS_DIR = ROOT / "prisma" / "migrations"
DATA_MODEL_DOC = ROOT / "docs" / "DATA_MODEL.md"

# Models the scope requires to exist; mirrors test_prisma_schema.py.
REQUIRED_MODELS = {
    "Tenant",
    "User",
    "Service",
    "Staff",
    "BusinessHour",
    "Blackout",
    "Client",
    "Booking",
    "Payment",
    "AuditLog",
}


def _model_blocks(schema_text: str) -> dict[str, str]:
    pattern = re.compile(r"^model\s+(\w+)\s*\{([^}]*)\}", re.MULTILINE | re.DOTALL)
    return {m.group(1): m.group(2) for m in pattern.finditer(schema_text)}


def _initial_migration_dir() -> Path:
    candidates = [p for p in MIGRATIONS_DIR.iterdir() if p.is_dir()]
    assert candidates, f"no migration directories found under {MIGRATIONS_DIR}"
    # The init migration sorts first by timestamp prefix.
    return sorted(candidates)[0]


def _all_migration_sql() -> str:
    migration_files = sorted(MIGRATIONS_DIR.glob("*/migration.sql"))
    assert migration_files, f"no migration.sql files found under {MIGRATIONS_DIR}"
    return "\n".join(path.read_text() for path in migration_files)


def test_migration_lock_present() -> None:
    lock = MIGRATIONS_DIR / "migration_lock.toml"
    assert lock.exists(), "prisma/migrations/migration_lock.toml must be checked in"


def test_initial_migration_exists() -> None:
    init_dir = _initial_migration_dir()
    sql_file = init_dir / "migration.sql"
    assert sql_file.exists(), f"missing migration.sql in {init_dir}"


def test_migrations_create_every_required_model() -> None:
    """Every model in the schema must have a CREATE TABLE in the migration history."""
    sql = _all_migration_sql()
    for model in REQUIRED_MODELS:
        assert (
            f'CREATE TABLE "{model}"' in sql
        ), f"migration history is missing CREATE TABLE for {model}"


def test_migrations_index_tenant_id_on_scoped_tables() -> None:
    """Every tenant-scoped table needs an index on tenantId in the SQL."""
    sql = _all_migration_sql()
    for model in REQUIRED_MODELS - {"Tenant"}:
        # Prisma emits `CREATE INDEX "<Model>_tenantId_idx" ON "<Model>"("tenantId")`
        # (or a composite index whose first column is tenantId).
        pattern = re.compile(
            rf'CREATE INDEX\s+"{model}_tenantId[^"]*_idx"\s+ON\s+"{model}"\s*\(\s*"tenantId"',
            re.IGNORECASE,
        )
        assert pattern.search(sql), f"migration history missing tenantId index for {model}"


def test_booking_staff_overlap_exclusion_constraint_exists() -> None:
    """Postgres must reject double-booking the same staff member at the DB layer."""
    sql = _all_migration_sql()
    assert "CREATE EXTENSION IF NOT EXISTS btree_gist" in sql
    assert 'ADD CONSTRAINT "Booking_staffId_time_overlap_excl"' in sql
    assert re.search(
        r'EXCLUDE\s+USING\s+gist\s*\([^;]*"tenantId"\s+WITH\s+='
        r'[^;]*"staffId"\s+WITH\s+='
        r"[^;]*tstzrange\("
        r'[^;]*"startsAt"\s+AT\s+TIME\s+ZONE\s+\'UTC\''
        r'[^;]*"endsAt"\s+AT\s+TIME\s+ZONE\s+\'UTC\''
        r"[^;]*'\[\)'[^;]*\)\s+WITH\s+&&",
        sql,
        re.IGNORECASE | re.DOTALL,
    ), "Booking migration history missing GiST exclusion on tenantId/staffId/tstzrange"
    assert re.search(
        r'WHERE\s*\(\s*"staffId"\s+IS\s+NOT\s+NULL\s*\)',
        sql,
        re.IGNORECASE,
    ), "Booking overlap exclusion should only apply when staffId is present"


def test_data_model_doc_exists_and_covers_every_model() -> None:
    assert DATA_MODEL_DOC.exists(), "docs/DATA_MODEL.md must be checked in"
    doc = DATA_MODEL_DOC.read_text()
    for model in REQUIRED_MODELS:
        # Each model has its own `### <Model>` section header in the doc.
        assert re.search(
            rf"^###\s+{model}\b", doc, re.MULTILINE
        ), f"docs/DATA_MODEL.md missing section for model {model}"


def test_schema_and_doc_agree_on_models() -> None:
    """Doc must not silently drift behind the schema."""
    schema_models = set(_model_blocks(SCHEMA_PATH.read_text()).keys())
    doc = DATA_MODEL_DOC.read_text()
    doc_models = set(re.findall(r"^###\s+(\w+)\s*$", doc, re.MULTILINE))
    missing_in_doc = schema_models - doc_models
    assert (
        not missing_in_doc
    ), f"docs/DATA_MODEL.md is missing sections for: {sorted(missing_in_doc)}"
