"""Static checks on the initial prisma migration and DATA_MODEL.md doc.

The data-model PR's acceptance criteria require:
- an initial migration that creates every model in the schema, and
- a checked-in schema doc that documents the same models.

These tests assert both invariants without needing a live database.
"""

from __future__ import annotations

import re
import shutil
import sqlite3
import subprocess
import time
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

EXPECTED_ENUMS = {
    "UserRole": "'OWNER', 'ADMIN', 'STAFF', 'VIEWER'",
    "BookingStatus": "'PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'",
    "PaymentStatus": "'PENDING', 'PAID', 'REFUNDED', 'FAILED'",
    "PaymentMethod": "'CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'OTHER'",
    "DayOfWeek": "'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'",
}

EXPECTED_ENUM_COLUMNS = {
    "User": {"role": "UserRole"},
    "BusinessHour": {"dayOfWeek": "DayOfWeek"},
    "Booking": {"status": "BookingStatus"},
    "Payment": {"method": "PaymentMethod", "status": "PaymentStatus"},
}


def _model_blocks(schema_text: str) -> dict[str, str]:
    pattern = re.compile(r"^model\s+(\w+)\s*\{([^}]*)\}", re.MULTILINE | re.DOTALL)
    return {m.group(1): m.group(2) for m in pattern.finditer(schema_text)}


def _initial_migration_dir() -> Path:
    candidates = [p for p in MIGRATIONS_DIR.iterdir() if (p / "migration.sql").exists()]
    assert candidates, f"no migration directories found under {MIGRATIONS_DIR}"
    # The init migration sorts first by timestamp prefix.
    return sorted(candidates)[0]


def _all_migration_sql() -> str:
    migrations = sorted(MIGRATIONS_DIR.glob("*/migration.sql"))
    assert migrations, f"no migration.sql files found under {MIGRATIONS_DIR}"
    return "\n".join(path.read_text() for path in migrations)


def _package_version(package: str) -> str:
    pkg = json.loads(PACKAGE_JSON.read_text())
    spec = pkg.get("dependencies", {}).get(package) or pkg.get("devDependencies", {}).get(package)
    assert spec, f"could not find {package} version in {PACKAGE_JSON}"
    return spec


def _all_migration_sql() -> str:
    return "\n".join(
        (path / "migration.sql").read_text()
        for path in sorted(MIGRATIONS_DIR.iterdir())
        if (path / "migration.sql").exists()
    )


def _prisma_command() -> list[str]:
    prisma_bin = ROOT / "node_modules" / ".bin" / "prisma"
    if prisma_bin.exists():
        return [str(prisma_bin)]
    return ["npx", "--yes", "--package", f"prisma@{_package_version('prisma')}", "prisma"]


def test_migration_lock_present() -> None:
    lock = MIGRATIONS_DIR / "migration_lock.toml"
    assert lock.exists(), "prisma/migrations/migration_lock.toml must be checked in"
    assert 'provider = "postgresql"' in lock.read_text()


def test_initial_migration_exists() -> None:
    init_dir = _initial_migration_dir()
    sql_file = init_dir / "migration.sql"
    assert sql_file.exists(), f"missing migration.sql in {init_dir}"


def test_migration_creates_every_required_model() -> None:
    """Every model in the schema must have a CREATE TABLE in the initial migration."""
    sql = (_initial_migration_dir() / "migration.sql").read_text()
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


def test_audit_log_metadata_migrates_to_jsonb() -> None:
    sql = _all_migration_sql()
    assert re.search(
        r'ALTER TABLE\s+"AuditLog"\s+ALTER COLUMN\s+"metadata"\s+TYPE\s+JSONB',
        sql,
        re.IGNORECASE,
    )
    assert re.search(
        r'USING\s+CASE\s+WHEN\s+"metadata"\s+IS\s+NULL\s+THEN\s+NULL'
        r'\s+WHEN\s+btrim\("metadata"\)\s+=\s+\'\'\s+THEN\s+NULL'
        r'\s+WHEN\s+"metadata"\s+~\s+\'\^\\s\*\[\\\[\{\]\'\s+THEN\s+"metadata"::jsonb'
        r'\s+ELSE\s+to_jsonb\("metadata"\)\s+END',
        sql,
        re.IGNORECASE,
    )


def test_migration_creates_expected_enums() -> None:
    sql = (_initial_migration_dir() / "migration.sql").read_text()
    for enum_name, values in EXPECTED_ENUMS.items():
        assert (
            f'CREATE TYPE "{enum_name}" AS ENUM ({values});' in sql
        ), f"initial migration missing enum {enum_name}"


def test_migration_columns_use_enum_types() -> None:
    sql = (_initial_migration_dir() / "migration.sql").read_text()
    for table, columns in EXPECTED_ENUM_COLUMNS.items():
        for column, enum_name in columns.items():
            pattern = re.compile(
                rf'"{column}"\s+"{enum_name}"\s+NOT NULL',
                re.IGNORECASE,
            )
            assert pattern.search(sql), f"{table}.{column} must use enum type {enum_name}"


def test_migrations_add_client_search_indexes() -> None:
    """Client list search must have compound indexes before large tenant rosters."""
    sql = _all_migration_sql()
    expected_indexes = {
        "Client_tenantId_name_idx": '"Client"("tenantId", "name")',
        "Client_tenantId_phone_idx": '"Client"("tenantId", "phone")',
    }

    for index_name, indexed_columns in expected_indexes.items():
        assert (
            f'CREATE INDEX "{index_name}" ON {indexed_columns}' in sql
        ), f"migrations missing {index_name}"


def test_client_search_returns_under_300ms_for_10k_clients() -> None:
    """Acceptance check: tenant-scoped name/phone search stays fast at 10k clients."""
    connection = sqlite3.connect(":memory:")
    connection.executescript(_all_migration_sql())
    now = "2026-07-30 00:00:00"

    connection.execute(
        """
        INSERT INTO "Tenant" ("id", "name", "slug", "timezone", "currency", "createdAt", "updatedAt")
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        ("tenant-1", "Demo Salon", "demo", "Africa/Lagos", "NGN", now, now),
    )
    connection.executemany(
        """
        INSERT INTO "Client" ("id", "tenantId", "name", "phone", "createdAt", "updatedAt")
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (
                f"client-{index}",
                "tenant-1",
                "Target Client" if index == 9876 else f"Client {index:05d}",
                "+2348001234567" if index == 9876 else f"+23480{index:06d}",
                now,
                now,
            )
            for index in range(10_000)
        ],
    )
    connection.commit()

    # Warm the in-memory SQLite connection before measuring the query budget.
    search_pattern = "%Target%"
    query_args = ("tenant-1", search_pattern, search_pattern)
    connection.execute(
        """
        SELECT COUNT(*) FROM "Client"
        WHERE "tenantId" = ? AND ("name" LIKE ? OR "phone" LIKE ?)
        """,
        query_args,
    ).fetchone()

    started = time.perf_counter()
    total = connection.execute(
        """
        SELECT COUNT(*) FROM "Client"
        WHERE "tenantId" = ? AND ("name" LIKE ? OR "phone" LIKE ?)
        """,
        query_args,
    ).fetchone()[0]
    rows = connection.execute(
        """
        SELECT "id", "name", "phone" FROM "Client"
        WHERE "tenantId" = ? AND ("name" LIKE ? OR "phone" LIKE ?)
        ORDER BY "name" ASC, "createdAt" DESC
        LIMIT 25
        """,
        query_args,
    ).fetchall()
    elapsed_ms = (time.perf_counter() - started) * 1000

    assert total == 1
    assert rows == [("client-9876", "Target Client", "+2348001234567")]
    assert elapsed_ms < 300, f"client search took {elapsed_ms:.2f}ms for 10k clients"


def test_client_search_indexes_exist_in_migrations() -> None:
    """The client API search path relies on tenant-prefixed name and phone indexes."""
    sql = _all_migration_sql()
    for field in ("name", "phone"):
        pattern = re.compile(
            rf"CREATE\s+(?:UNIQUE\s+)?INDEX\s+\"Client_[^\"]*\"\s+ON\s+\"Client\"\s*"
            rf"\(\s*\"tenantId\"\s*,\s*\"{field}\"\s*\)",
            re.IGNORECASE,
        )
        assert pattern.search(sql), f"migrations missing tenant-prefixed Client.{field} index"


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
