"""Static checks on the initial prisma migration and DATA_MODEL.md doc.

The data-model PR's acceptance criteria require:
- an initial migration that creates every model in the schema, and
- a checked-in schema doc that documents the same models.

These tests assert both invariants without needing a live database.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

import pytest

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


@pytest.mark.xdist_group("prisma-cli")
def test_prisma_schema_validates_offline() -> None:
    """Acceptance check: `prisma validate` accepts the current schema.

    Runs offline (no DB required). Prisma still needs a DATABASE_URL to
    resolve the datasource block; we set a syntactically-valid postgres URL
    so validation focuses on the schema itself.
    """
    result = subprocess.run(
        [
            *_prisma_command(),
            "validate",
            "--schema",
            str(SCHEMA_PATH),
        ],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=60,
        env={**os.environ, "DATABASE_URL": "postgresql://user:pass@localhost:5432/bukay"},
        check=False,
    )

    assert result.returncode == 0, f"prisma validate failed:\n{result.stdout}"


@pytest.mark.xdist_group("prisma-cli")
def test_initial_migration_matches_prisma_diff_output() -> None:
    """The checked-in initial migration must match Prisma's generated Postgres SQL.

    Uses `prisma migrate diff --from-empty --to-schema-datamodel --script`
    which runs offline (no DB needed). Guards against hand-edited migrations
    drifting from the schema.
    """
    result = subprocess.run(
        [
            *_prisma_command(),
            "migrate",
            "diff",
            "--from-empty",
            "--to-schema-datamodel",
            str(SCHEMA_PATH),
            "--script",
        ],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=60,
        env={**os.environ, "DATABASE_URL": "postgresql://user:pass@localhost:5432/bukay"},
        check=False,
    )

    assert result.returncode == 0, f"prisma migrate diff failed:\n{result.stdout}"

    generated = result.stdout
    # Prisma's CLI sometimes prints an upgrade banner after the SQL; strip
    # anything past the last "AddForeignKey" block if present.
    marker = "-- CreateTable"
    assert marker in generated, f"expected CREATE TABLE marker in prisma output:\n{generated}"

    checked_in = (_initial_migration_dir() / "migration.sql").read_text()
    # Compare the salient DDL — every CREATE TABLE / CREATE INDEX / ADD CONSTRAINT
    # emitted by Prisma must be present in the checked-in migration.
    ddl_pattern = re.compile(
        r"^\s*(CREATE (?:UNIQUE )?INDEX|CREATE TABLE|ALTER TABLE .* ADD CONSTRAINT).*?;",
        re.MULTILINE | re.DOTALL,
    )
    for match in ddl_pattern.finditer(generated):
        stmt = re.sub(r"\s+", " ", match.group(0)).strip()
        checked_in_normalized = re.sub(r"\s+", " ", checked_in)
        assert (
            stmt in checked_in_normalized
        ), f"checked-in migration missing DDL statement produced by prisma diff:\n{stmt}"


def test_migration_lock_provider_is_postgres() -> None:
    lock_text = (MIGRATIONS_DIR / "migration_lock.toml").read_text()
    assert (
        'provider = "postgresql"' in lock_text
    ), 'prisma/migrations/migration_lock.toml must pin provider = "postgresql"'


def test_schema_uses_postgres_datasource() -> None:
    schema_text = SCHEMA_PATH.read_text()
    assert re.search(
        r'provider\s*=\s*"postgresql"', schema_text
    ), "prisma/schema.prisma datasource must use postgresql provider"


def test_migration_declares_foreign_key_constraints() -> None:
    """All FK relations in the schema must be present in the migration SQL."""
    sql = (_initial_migration_dir() / "migration.sql").read_text()
    required_fks = {
        # Tenant fan-out (Cascade)
        ("User", "tenantId", "Tenant"),
        ("Service", "tenantId", "Tenant"),
        ("Staff", "tenantId", "Tenant"),
        ("BusinessHour", "tenantId", "Tenant"),
        ("Client", "tenantId", "Tenant"),
        ("Booking", "tenantId", "Tenant"),
        ("Payment", "tenantId", "Tenant"),
        ("AuditLog", "tenantId", "Tenant"),
        # Booking relations
        ("Booking", "clientId", "Client"),
        ("Booking", "serviceId", "Service"),
        ("Booking", "staffId", "Staff"),
        # Payment -> Booking
        ("Payment", "bookingId", "Booking"),
    }
    for table, column, ref_table in required_fks:
        pattern = re.compile(
            rf'ALTER TABLE\s+"{table}"\s+ADD\s+CONSTRAINT\s+"{table}_{column}_fkey"\s+'
            rf'FOREIGN KEY\s*\(\s*"{column}"\s*\)\s+REFERENCES\s+"{ref_table}"',
            re.IGNORECASE | re.DOTALL,
        )
        assert pattern.search(
            sql
        ), f"initial migration missing FK constraint {table}.{column} -> {ref_table}"


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
