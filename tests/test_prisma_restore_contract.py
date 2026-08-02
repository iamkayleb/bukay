"""Regression checks for the current PostgreSQL Prisma data model."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SCHEMA_PATH = ROOT / "prisma" / "schema.prisma"
SEED_PATH = ROOT / "prisma" / "seed.ts"
MIGRATIONS_DIR = ROOT / "prisma" / "migrations"

EXPECTED_MIGRATIONS = {
    "20260609000000_init",
    "20260708000000_add_schedule_blackouts",
    "20260722000000_add_booking_staff_overlap_constraint",
    "20260727000000_audit_log_metadata_jsonb",
    "20260729112000_add_otp_persistent_store",
    "20260730000000_client_tags",
    "20260730010000_client_search_indexes",
    "20260730140500_prevent_booking_staff_overlaps",
    "20260730152000_audit_manual_booking_created",
    "20260731000000_add_tenant_settings",
    "20260731120000_add_client_tags",
    "20260731123000_add_client_search_name_index",
    "20260802000000_add_tenant_branding_settings",
}

EXPECTED_SCHEMA_FIELD_CONTRACT = {
    "User": (r"role\s+UserRole\s+@default\(STAFF\)",),
    "BusinessHour": (r"dayOfWeek\s+DayOfWeek\b",),
    "Blackout": (r"date\s+String\b", r"@@unique\(\[tenantId,\s*date\]\)"),
    "Booking": (r"status\s+BookingStatus\s+@default\(PENDING\)",),
    "Payment": (r"method\s+PaymentMethod\b", r"status\s+PaymentStatus\s+@default\(PENDING\)"),
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


def test_migration_scope_contains_expected_files() -> None:
    actual_migrations = {
        path.name
        for path in MIGRATIONS_DIR.iterdir()
        if path.is_dir() and (path / "migration.sql").exists()
    }

    assert actual_migrations == EXPECTED_MIGRATIONS
    assert (MIGRATIONS_DIR / "migration_lock.toml").exists()


def test_prisma_schema_keeps_postgresql_enum_contract() -> None:
    schema_text = SCHEMA_PATH.read_text()
    blocks = _model_blocks(schema_text)

    assert 'provider = "postgresql"' in schema_text
    assert 'url      = env("DATABASE_URL")' in schema_text
    assert "Blackout" in blocks
    assert "Tag" in blocks
    assert "ClientTag" in blocks

    for model, field_patterns in EXPECTED_SCHEMA_FIELD_CONTRACT.items():
        body = blocks[model]
        for field_pattern in field_patterns:
            assert re.search(field_pattern, body), f"{model} missing current field: {field_pattern}"


def test_seed_uses_current_prisma_enum_values() -> None:
    seed_text = SEED_PATH.read_text()

    assert "PrismaClient,\n" in seed_text
    for expected_text in EXPECTED_SEED_ENUM_USAGES:
        assert expected_text in seed_text
