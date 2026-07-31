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


def _created_tables(sql: str) -> set[str]:
    """Return the set of table names created in a migration SQL blob."""
    return set(re.findall(r'CREATE TABLE\s+"([^"]+)"', sql))


def _all_migration_sql() -> str:
    """Concatenate every migration.sql under prisma/migrations."""
    parts: list[str] = []
    for path in sorted(MIGRATIONS_DIR.glob("*/migration.sql")):
        parts.append(path.read_text())
    return "\n".join(parts)


def test_migration_tables_are_declared_in_schema() -> None:
    """Every CREATE TABLE in the initial migration must match a schema model.

    Guards the PR #195 concern about StaffService in reverse: if the migration
    ever creates a table (e.g. StaffService) that the schema no longer declares
    a model for, prisma migrate would still apply it but the client would lose
    typed access. Fail loudly on that drift.
    """
    schema_models = set(_model_blocks(SCHEMA_PATH.read_text()).keys())
    sql = (_initial_migration_dir() / "migration.sql").read_text()
    created = _created_tables(sql)
    orphaned = created - schema_models
    assert not orphaned, (
        f"initial migration creates tables not declared in schema.prisma: "
        f"{sorted(orphaned)} — add the model back or drop the CREATE TABLE."
    )


def test_no_migration_creates_staff_service_table() -> None:
    """No migration file may create a StaffService table.

    StaffService was intentionally excluded from the data model in PR #195. If
    a future migration reintroduces the table without a matching model, prisma
    client generation would still succeed but the table would be orphaned.
    """
    all_sql = _all_migration_sql()
    assert 'CREATE TABLE "StaffService"' not in all_sql, (
        "A migration file creates a `StaffService` table but the schema has no "
        "such model. Either add the model back to prisma/schema.prisma or drop "
        "the CREATE TABLE from the migration."
    )
    assert "staffAssignments" not in all_sql, (
        "A migration file references `staffAssignments` but the schema has no "
        "such relation. Reconcile prisma/schema.prisma and the migration."
    )
