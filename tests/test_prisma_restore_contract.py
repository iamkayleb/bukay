"""Regression checks for the current PostgreSQL/enum Prisma data model."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / "prisma" / "schema.prisma"
SEED_PATH = ROOT / "prisma" / "seed.ts"
MIGRATIONS_DIR = ROOT / "prisma" / "migrations"

POSTGRES_ENUM_MARKERS = (
    "BookingStatus",
    "CREATE TYPE",
    "DayOfWeek",
    "enum ",
    "PaymentMethod",
    "PaymentStatus",
    "postgresql",
    "UserRole",
)

SCHEMA_FIELD_CONTRACT = {
    "User": (r"role\s+UserRole\s+@default\(STAFF\)",),
    "BusinessHour": (r"dayOfWeek\s+DayOfWeek\b",),
    "Blackout": (r"date\s+String\b",),
    "Booking": (r"status\s+BookingStatus\s+@default\(PENDING\)",),
    "Payment": (
        r"method\s+PaymentMethod\b",
        r"status\s+PaymentStatus\s+@default\(PENDING\)",
    ),
    "AuditLog": (r"metadata\s+Json\?",),
}

SEED_ENUM_CONTRACT = (
    "UserRole.OWNER",
    "DayOfWeek.MONDAY",
    "DayOfWeek.TUESDAY",
    "DayOfWeek.WEDNESDAY",
    "DayOfWeek.THURSDAY",
    "DayOfWeek.FRIDAY",
    "DayOfWeek.SATURDAY",
    "BookingStatus.CONFIRMED",
    "PaymentMethod.MOBILE_MONEY",
    "PaymentStatus.PAID",
)


def _model_blocks(schema_text: str) -> dict[str, str]:
    pattern = re.compile(r"^model\s+(\w+)\s*\{([^}]*)\}", re.MULTILINE | re.DOTALL)
    return {match.group(1): match.group(2) for match in pattern.finditer(schema_text)}


def test_prisma_files_keep_postgres_enum_model_contract() -> None:
    searchable_paths = [
        SCHEMA_PATH,
        SEED_PATH,
        *sorted(MIGRATIONS_DIR.glob("**/*")),
    ]
    combined_text = "\n".join(path.read_text() for path in searchable_paths if path.is_file())

    for marker in POSTGRES_ENUM_MARKERS:
        assert marker in combined_text, f"missing PostgreSQL/enum marker: {marker}"


def test_seed_uses_prisma_enum_values() -> None:
    seed_text = SEED_PATH.read_text()

    for expected_text in SEED_ENUM_CONTRACT:
        assert expected_text in seed_text

    assert 'status: "confirmed"' not in seed_text
    assert 'status: "paid"' not in seed_text
    assert 'provider: "mobile_money"' not in seed_text


def test_schema_keeps_postgres_enum_field_contract() -> None:
    schema_text = SCHEMA_PATH.read_text()
    blocks = _model_blocks(schema_text)

    assert 'provider = "postgresql"' in schema_text
    assert 'url      = env("DATABASE_URL")' in schema_text
    assert "StaffService" not in blocks
    assert "Blackout" in blocks

    for model, field_patterns in SCHEMA_FIELD_CONTRACT.items():
        body = blocks[model]
        for field_pattern in field_patterns:
            assert re.search(field_pattern, body), f"{model} missing current field: {field_pattern}"
