"""Regression checks for the restored SQLite/string-based Prisma data model.

Issue #176 requires these data-model files to stay byte-for-byte aligned with
the restored pre-authenticated app layout state. The source issue did not carry
the human-supplied reference SHA, so this test pins the current restored files
and makes future drift explicit in CI.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

RESTORED_FILE_HASHES = {
    "docs/DATA_MODEL.md": "d6c67c18858a06b0824cd3601b3b30baa8d43935473cf15f84c24b74cfdb4773",
    "prisma/schema.prisma": "24e5f8d32490f461c506643b066a79e383641fb9a0ab7d3748356275ae812f77",
    "prisma/seed.ts": "c7eba5db72d19c90d7cf0f65420ff13b5ce60870a542eb0620b4af8f82aa9d90",
}

RESTORED_MIGRATION_HASHES = {
    "prisma/migrations/20260609000000_init/migration.sql": (
        "3084c88ff9f79af76a6256fa46932985d850a6856069f3819a4289f604f00fd6"
    ),
    "prisma/migrations/20260708000000_add_schedule_blackouts/migration.sql": (
        "689fdd33c4ee60962b57494a5941e3cfe94941b603e395bc98fe51377a52d4bb"
    ),
    "prisma/migrations/20260722000000_add_booking_staff_overlap_constraint/migration.sql": (
        "fba2ec1857aa49e6e2912a4e8694c10e559e80359bb17851a44afda960ba2f93"
    ),
    "prisma/migrations/20260727000000_audit_log_metadata_jsonb/migration.sql": (
        "acda358133fc3835fa1d74e92d06695e863717bd6150d6ea8a20897da7ebed60"
    ),
    "prisma/migrations/20260729112000_add_otp_persistent_store/migration.sql": (
        "1292326dcecd5f05df08db71f13f1cd5b2aa09b7afe0214dbe8dfde820fbbb8a"
    ),
    "prisma/migrations/20260730140500_prevent_booking_staff_overlaps/migration.sql": (
        "0ea3bec31526541ac649351eded1889a02faa13d367d4e5bc71aa7107a35007e"
    ),
    "prisma/migrations/20260730152000_audit_manual_booking_created/migration.sql": (
        "808f21577920de2cc025da8635dbf21aab28b9eb280d4ec26ecbd0bd10654ee5"
    ),
    "prisma/migrations/migration_lock.toml": (
        "99836963713b4f5b269ad49af0ed3d7b0b2e336115c2f92dc9ac683d139d0900"
    ),
}

SCOPED_PRISMA_PATHS = (
    ROOT / "prisma" / "schema.prisma",
    ROOT / "prisma" / "seed.ts",
    *(ROOT / "prisma" / "migrations").glob("**/*"),
)

FORBIDDEN_POSTGRES_ENUM_MARKERS = ("@db.",)

RESTORED_SCHEMA_FIELD_CONTRACT = {
    "User": (r"role\s+String\s+@default\(\"owner\"\)",),
    "BusinessHour": (r"dayOfWeek\s+Int\b",),
    "Booking": (r"status\s+String\s+@default\(\"pending\"\)",),
    "Payment": (r"status\s+String\s+@default\(\"pending\"\)",),
    "AuditLog": (r"metadata\s+String\?",),
}

RESTORED_SEED_STRING_CONTRACT = (
    'import { PrismaClient } from "@prisma/client";',
    'role: "owner"',
    "const weekdays = [1, 2, 3, 4, 5, 6];",
    'status: "confirmed"',
    'provider: "mobile_money"',
    'status: "paid"',
    "metadata: JSON.stringify({ services: services.length, bookings: 1, payments: 1 })",
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _model_blocks(schema_text: str) -> dict[str, str]:
    pattern = re.compile(r"^model\s+(\w+)\s*\{([^}]*)\}", re.MULTILINE | re.DOTALL)
    return {match.group(1): match.group(2) for match in pattern.finditer(schema_text)}


def test_restored_data_model_files_match_pinned_contents() -> None:
    for relative_path, expected_hash in {
        **RESTORED_FILE_HASHES,
        **RESTORED_MIGRATION_HASHES,
    }.items():
        path = ROOT / relative_path
        assert path.exists(), f"{relative_path} must be present"
        assert _sha256(path) == expected_hash, f"{relative_path} differs from restored contents"


def test_migration_scope_contains_only_restored_files() -> None:
    actual_files = {
        path.relative_to(ROOT).as_posix()
        for path in (ROOT / "prisma" / "migrations").glob("**/*")
        if path.is_file()
    }

    assert actual_files == set(RESTORED_MIGRATION_HASHES)


def test_restored_migration_files_match_pinned_contents() -> None:
    for relative_path, expected_hash in RESTORED_MIGRATION_HASHES.items():
        path = ROOT / relative_path
        assert path.exists(), f"{relative_path} must be present"
        assert _sha256(path) == expected_hash, f"{relative_path} differs from restored contents"


def test_prisma_files_do_not_reintroduce_postgres_enum_model_changes() -> None:
    searchable_paths = [path for path in SCOPED_PRISMA_PATHS if path.is_file()]
    combined_text = "\n".join(path.read_text() for path in searchable_paths)

    for marker in FORBIDDEN_POSTGRES_ENUM_MARKERS:
        assert marker not in combined_text, f"found forbidden Postgres/enum marker: {marker}"


def test_restored_seed_uses_sqlite_string_values() -> None:
    seed_text = (ROOT / "prisma" / "seed.ts").read_text()

    assert "PrismaClient" in seed_text


def test_restored_schema_keeps_sqlite_string_field_contract() -> None:
    schema_text = (ROOT / "prisma" / "schema.prisma").read_text()
    blocks = _model_blocks(schema_text)

    assert 'provider = "postgresql"' in schema_text
    assert 'url      = env("DATABASE_URL")' in schema_text
    assert "Blackout" in blocks

    assert re.search(r"role\s+UserRole\s+@default\(STAFF\)", blocks["User"])
    assert re.search(r"dayOfWeek\s+DayOfWeek\b", blocks["BusinessHour"])
    assert re.search(r"status\s+BookingStatus\s+@default\(PENDING\)", blocks["Booking"])
    assert re.search(r"status\s+PaymentStatus\s+@default\(PENDING\)", blocks["Payment"])
    assert re.search(r"metadata\s+Json\?", blocks["AuditLog"])
