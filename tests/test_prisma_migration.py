"""Static checks on the initial prisma migration and DATA_MODEL.md doc.

The data-model PR's acceptance criteria require:
- an initial migration that creates every model in the schema, and
- a checked-in schema doc that documents the same models.

These tests assert both invariants without needing a live database.
"""

from __future__ import annotations

import json
import re
import shutil
import sqlite3
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / "prisma" / "schema.prisma"
MIGRATIONS_DIR = ROOT / "prisma" / "migrations"
DATA_MODEL_DOC = ROOT / "docs" / "DATA_MODEL.md"
PACKAGE_JSON = ROOT / "package.json"

# Models the scope requires to exist; mirrors test_prisma_schema.py.
REQUIRED_MODELS = {
    "Tenant",
    "User",
    "Service",
    "Staff",
    "BusinessHour",
    "Client",
    "Booking",
    "Payment",
    "AuditLog",
}


def _model_blocks(schema_text: str) -> dict[str, str]:
    pattern = re.compile(r"^model\s+(\w+)\s*\{([^}]*)\}", re.MULTILINE | re.DOTALL)
    return {m.group(1): m.group(2) for m in pattern.finditer(schema_text)}


def _initial_migration_dir() -> Path:
    candidates = [p for p in MIGRATIONS_DIR.iterdir() if (p / "migration.sql").exists()]
    assert candidates, f"no migration directories found under {MIGRATIONS_DIR}"
    # The init migration sorts first by timestamp prefix.
    return sorted(candidates)[0]


def _package_version(package: str) -> str:
    pkg = json.loads(PACKAGE_JSON.read_text())
    spec = pkg.get("dependencies", {}).get(package) or pkg.get("devDependencies", {}).get(package)
    assert spec, f"could not find {package} version in {PACKAGE_JSON}"
    return spec


def _prisma_command() -> list[str]:
    prisma_bin = ROOT / "node_modules" / ".bin" / "prisma"
    if prisma_bin.exists():
        return [str(prisma_bin)]
    return ["npx", "--yes", "--package", f"prisma@{_package_version('prisma')}", "prisma"]


def test_migration_lock_present() -> None:
    lock = MIGRATIONS_DIR / "migration_lock.toml"
    assert lock.exists(), "prisma/migrations/migration_lock.toml must be checked in"


def test_initial_migration_exists() -> None:
    init_dir = _initial_migration_dir()
    sql_file = init_dir / "migration.sql"
    assert sql_file.exists(), f"missing migration.sql in {init_dir}"


def test_prisma_migrate_dev_runs_on_clean_database(tmp_path: Path) -> None:
    """Acceptance check: `prisma migrate dev` must succeed on a clean database."""
    prisma_dir = tmp_path / "prisma"
    shutil.copytree(ROOT / "prisma", prisma_dir)

    result = subprocess.run(
        [
            *_prisma_command(),
            "migrate",
            "dev",
            "--schema",
            str(prisma_dir / "schema.prisma"),
            "--skip-seed",
            "--skip-generate",
        ],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=60,
        check=False,
    )

    assert result.returncode == 0, result.stdout
    assert (prisma_dir / "dev.db").exists(), "prisma migrate dev did not create a clean db"


def test_migration_creates_every_required_model() -> None:
    """Every model in the schema must have a CREATE TABLE in the initial migration."""
    sql = (_initial_migration_dir() / "migration.sql").read_text()
    for model in REQUIRED_MODELS:
        assert (
            f'CREATE TABLE "{model}"' in sql
        ), f"initial migration is missing CREATE TABLE for {model}"


def test_migration_indexes_tenant_id_on_scoped_tables() -> None:
    """Every tenant-scoped table needs an index on tenantId in the SQL."""
    sql = (_initial_migration_dir() / "migration.sql").read_text()
    for model in REQUIRED_MODELS - {"Tenant"}:
        # Prisma emits `CREATE INDEX "<Model>_tenantId_idx" ON "<Model>"("tenantId")`
        # (or a composite index whose first column is tenantId).
        pattern = re.compile(
            rf'CREATE INDEX\s+"{model}_tenantId[^"]*_idx"\s+ON\s+"{model}"\s*\(\s*"tenantId"',
            re.IGNORECASE,
        )
        assert pattern.search(sql), f"initial migration missing tenantId index for {model}"


def test_migration_rejects_overlapping_staff_bookings_at_db_layer() -> None:
    sql = (_initial_migration_dir() / "migration.sql").read_text()

    assert 'CREATE TRIGGER "Booking_reject_staff_overlap_insert"' in sql
    assert 'CREATE TRIGGER "Booking_reject_staff_overlap_update"' in sql
    assert "booking_staff_overlap" in sql
    assert 'existing."staffId" = NEW."staffId"' in sql
    assert 'existing."startsAt" < NEW."endsAt"' in sql
    assert 'existing."endsAt" > NEW."startsAt"' in sql


def test_staff_booking_overlap_trigger_blocks_conflicting_insert(tmp_path: Path) -> None:
    sql = (_initial_migration_dir() / "migration.sql").read_text()
    db_path = tmp_path / "booking-overlap.db"

    with sqlite3.connect(db_path) as connection:
        connection.executescript(sql)
        connection.executescript("""
            INSERT INTO "Tenant" ("id", "name", "slug", "updatedAt")
            VALUES ('tenant-1', 'Demo', 'demo', '2026-07-27T09:00:00.000Z');
            INSERT INTO "Service" (
              "id", "tenantId", "name", "durationMinutes", "priceCents", "updatedAt"
            )
            VALUES ('service-1', 'tenant-1', 'Haircut', 30, 5000, '2026-07-27T09:00:00.000Z');
            INSERT INTO "Client" ("id", "tenantId", "name", "phone", "updatedAt")
            VALUES ('client-1', 'tenant-1', 'Ada', '+2348000000000', '2026-07-27T09:00:00.000Z');
            INSERT INTO "Staff" ("id", "tenantId", "name", "updatedAt")
            VALUES ('staff-1', 'tenant-1', 'Kay', '2026-07-27T09:00:00.000Z');
            INSERT INTO "Booking" (
              "id", "tenantId", "clientId", "serviceId", "staffId", "startsAt", "endsAt",
              "updatedAt"
            )
            VALUES (
              'booking-1', 'tenant-1', 'client-1', 'service-1', 'staff-1',
              '2026-07-27T10:00:00.000Z', '2026-07-27T11:00:00.000Z',
              '2026-07-27T09:00:00.000Z'
            );
            """)

        connection.execute(
            """
            INSERT INTO "Booking" (
              "id", "tenantId", "clientId", "serviceId", "staffId", "startsAt", "endsAt",
              "updatedAt"
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "booking-2",
                "tenant-1",
                "client-1",
                "service-1",
                "staff-1",
                "2026-07-27T11:00:00.000Z",
                "2026-07-27T11:30:00.000Z",
                "2026-07-27T09:00:00.000Z",
            ),
        )

        try:
            connection.execute(
                """
                INSERT INTO "Booking" (
                  "id", "tenantId", "clientId", "serviceId", "staffId", "startsAt", "endsAt",
                  "updatedAt"
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "booking-3",
                    "tenant-1",
                    "client-1",
                    "service-1",
                    "staff-1",
                    "2026-07-27T10:30:00.000Z",
                    "2026-07-27T11:30:00.000Z",
                    "2026-07-27T09:00:00.000Z",
                ),
            )
        except sqlite3.IntegrityError as error:
            assert "booking_staff_overlap" in str(error)
        else:
            raise AssertionError("overlapping same-staff booking insert should be rejected")


def test_staff_booking_overlap_trigger_blocks_conflicting_update(tmp_path: Path) -> None:
    sql = (_initial_migration_dir() / "migration.sql").read_text()
    db_path = tmp_path / "booking-overlap-update.db"

    with sqlite3.connect(db_path) as connection:
        connection.executescript(sql)
        connection.executescript("""
            INSERT INTO "Tenant" ("id", "name", "slug", "updatedAt")
            VALUES ('tenant-1', 'Demo', 'demo', '2026-07-27T09:00:00.000Z');
            INSERT INTO "Service" (
              "id", "tenantId", "name", "durationMinutes", "priceCents", "updatedAt"
            )
            VALUES ('service-1', 'tenant-1', 'Haircut', 30, 5000, '2026-07-27T09:00:00.000Z');
            INSERT INTO "Client" ("id", "tenantId", "name", "phone", "updatedAt")
            VALUES ('client-1', 'tenant-1', 'Ada', '+2348000000000', '2026-07-27T09:00:00.000Z');
            INSERT INTO "Staff" ("id", "tenantId", "name", "updatedAt")
            VALUES ('staff-1', 'tenant-1', 'Kay', '2026-07-27T09:00:00.000Z');
            INSERT INTO "Booking" (
              "id", "tenantId", "clientId", "serviceId", "staffId", "startsAt", "endsAt",
              "updatedAt"
            )
            VALUES
              (
                'booking-1', 'tenant-1', 'client-1', 'service-1', 'staff-1',
                '2026-07-27T10:00:00.000Z', '2026-07-27T11:00:00.000Z',
                '2026-07-27T09:00:00.000Z'
              ),
              (
                'booking-2', 'tenant-1', 'client-1', 'service-1', 'staff-1',
                '2026-07-27T12:00:00.000Z', '2026-07-27T13:00:00.000Z',
                '2026-07-27T09:00:00.000Z'
              );
            """)

        try:
            connection.execute(
                """
                UPDATE "Booking"
                SET "startsAt" = ?, "endsAt" = ?, "updatedAt" = ?
                WHERE "id" = ?
                """,
                (
                    "2026-07-27T10:30:00.000Z",
                    "2026-07-27T11:30:00.000Z",
                    "2026-07-27T09:30:00.000Z",
                    "booking-2",
                ),
            )
        except sqlite3.IntegrityError as error:
            assert "booking_staff_overlap" in str(error)
        else:
            raise AssertionError("overlapping same-staff booking update should be rejected")


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
