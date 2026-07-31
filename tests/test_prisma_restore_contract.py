"""Regression checks for the current Prisma data model contract."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SCHEMA_FIELD_CONTRACT = {
    "User": (r"role\s+UserRole\s+@default\(STAFF\)",),
    "BusinessHour": (r"dayOfWeek\s+DayOfWeek\b",),
    "Booking": (r"status\s+BookingStatus\s+@default\(PENDING\)",),
    "Payment": (r"method\s+PaymentMethod\b", r"status\s+PaymentStatus\s+@default\(PENDING\)"),
    "AuditLog": (r"metadata\s+Json\?",),
}

SEED_ENUM_CONTRACT = (
    "UserRole.OWNER",
    "DayOfWeek.MONDAY",
    "BookingStatus.CONFIRMED",
    "PaymentMethod.MOBILE_MONEY",
    "PaymentStatus.PAID",
    "metadata: { services: services.length, bookings: 1, payments: 1 }",
)


def _model_blocks(schema_text: str) -> dict[str, str]:
    pattern = re.compile(r"^model\s+(\w+)\s*\{([^}]*)\}", re.MULTILINE | re.DOTALL)
    return {match.group(1): match.group(2) for match in pattern.finditer(schema_text)}


def test_seed_uses_postgres_enum_values() -> None:
    seed_text = (ROOT / "prisma" / "seed.ts").read_text()

    for expected_text in SEED_ENUM_CONTRACT:
        assert expected_text in seed_text


def test_schema_keeps_postgres_enum_field_contract() -> None:
    schema_text = (ROOT / "prisma" / "schema.prisma").read_text()
    blocks = _model_blocks(schema_text)

    assert 'provider = "postgresql"' in schema_text
    assert 'url      = env("DATABASE_URL")' in schema_text
    assert "Blackout" in blocks
    assert "Tag" in blocks
    assert "ClientTag" in blocks

    for model, field_patterns in SCHEMA_FIELD_CONTRACT.items():
        body = blocks[model]
        for field_pattern in field_patterns:
            assert re.search(field_pattern, body), f"{model} missing current field: {field_pattern}"
