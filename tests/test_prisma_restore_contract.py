"""Regression checks for the current PostgreSQL/enum Prisma data model."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / "prisma" / "schema.prisma"
SEED_PATH = ROOT / "prisma" / "seed.ts"
MIGRATIONS_DIR = ROOT / "prisma" / "migrations"

REQUIRED_MODELS = {
    "Tenant",
    "User",
    "Service",
    "Staff",
    "BusinessHour",
    "Blackout",
    "Client",
    "Tag",
    "ClientTag",
    "Booking",
    "Payment",
    "AuditLog",
}

EXPECTED_SCHEMA_CONTRACT = {
    "User": (r"role\s+UserRole\s+@default\(STAFF\)",),
    "BusinessHour": (r"dayOfWeek\s+DayOfWeek\b",),
    "Booking": (r"status\s+BookingStatus\s+@default\(PENDING\)",),
    "Payment": (
        r"method\s+PaymentMethod\b",
        r"status\s+PaymentStatus\s+@default\(PENDING\)",
    ),
    "AuditLog": (r"metadata\s+Json\?",),
}

EXPECTED_SEED_ENUM_USAGES = (
    "UserRole.OWNER",
    "DayOfWeek.MONDAY",
    "BookingStatus.CONFIRMED",
    "PaymentMethod.MOBILE_MONEY",
    "PaymentStatus.PAID",
)


def _model_blocks(schema_text: str) -> dict[str, str]:
    pattern = re.compile(r"^model\s+(\w+)\s*\{([^}]*)\}", re.MULTILINE | re.DOTALL)
    return {match.group(1): match.group(2) for match in pattern.finditer(schema_text)}


def _all_migration_sql() -> str:
    migrations = sorted(MIGRATIONS_DIR.glob("*/migration.sql"))
    assert migrations, f"no migration.sql files found under {MIGRATIONS_DIR}"
    return "\n".join(path.read_text() for path in migrations)


def test_schema_keeps_postgresql_enum_field_contract() -> None:
    schema_text = SCHEMA_PATH.read_text()
    blocks = _model_blocks(schema_text)

    assert 'provider = "postgresql"' in schema_text
    assert 'url      = env("DATABASE_URL")' in schema_text
    assert blocks.keys() >= REQUIRED_MODELS

    for model, field_patterns in EXPECTED_SCHEMA_CONTRACT.items():
        body = blocks[model]
        for field_pattern in field_patterns:
            assert re.search(field_pattern, body), f"{model} missing current field: {field_pattern}"


def test_seed_uses_prisma_enum_values() -> None:
    seed_text = SEED_PATH.read_text()

    assert "PrismaClient,\n" in seed_text
    for expected_text in EXPECTED_SEED_ENUM_USAGES:
        assert expected_text in seed_text

    for stale_text in ('role: "owner"', 'status: "confirmed"', 'status: "paid"'):
        assert stale_text not in seed_text


def test_migration_history_contains_current_model_tables() -> None:
    sql = _all_migration_sql()

    for model in REQUIRED_MODELS:
        assert f'CREATE TABLE "{model}"' in sql, f"migration history missing {model}"


def test_client_tag_migrations_enforce_same_tenant_assignments() -> None:
    sql = _all_migration_sql()

    assert 'FOREIGN KEY ("tenantId", "clientId") REFERENCES "Client" ("tenantId", "id")' in sql
    assert 'FOREIGN KEY ("tenantId", "tagId") REFERENCES "Tag" ("tenantId", "id")' in sql
    assert 'CREATE UNIQUE INDEX "ClientTag_tenantId_clientId_tagId_key"' in sql


def test_migration_history_keeps_postgres_specific_constraints() -> None:
    sql = _all_migration_sql()

    assert 'CREATE TYPE "BookingStatus" AS ENUM' in sql
    assert 'ALTER COLUMN "metadata" TYPE JSONB' in sql
    assert 'ADD CONSTRAINT "Booking_staffId_time_overlap_excl"' in sql
