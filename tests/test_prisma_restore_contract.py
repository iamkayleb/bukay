"""Regression checks for the checked-in Prisma data model."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

RESTORED_FILE_HASHES = {
    "docs/DATA_MODEL.md": "5a0d1047688fb5a89d9638182e4f7c982784a12c0f6c60053902310d90fe89cf",
    "prisma/schema.prisma": "e96bcbc0f4a47563bcfce58c8c8a6b50b8cf5205a1654971582bf7ade3b5c5ca",
    "prisma/seed.ts": "1afb765674bbb90cfe59126d60fc52f3b446005bc0df85df71e24a8426d1e735",
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
    "prisma/migrations/20260730000000_client_tags/migration.sql": (
        "18aae5fcf6d293ff3b72876f0734768f03004512b012b86311c385f37bc3f77b"
    ),
    "prisma/migrations/20260730010000_client_search_indexes/migration.sql": (
        "765456e5fa495cecee17a99d05aecd53795949153be883cd0e011f246e3a1aae"
    ),
    "prisma/migrations/20260730140500_prevent_booking_staff_overlaps/migration.sql": (
        "0ea3bec31526541ac649351eded1889a02faa13d367d4e5bc71aa7107a35007e"
    ),
    "prisma/migrations/20260730152000_audit_manual_booking_created/migration.sql": (
        "808f21577920de2cc025da8635dbf21aab28b9eb280d4ec26ecbd0bd10654ee5"
    ),
    "prisma/migrations/20260731000000_add_tenant_settings/migration.sql": (
        "2cd99098b6ec9a48c163c80adde32c43d7df7667955108e1647436d11a66bcd2"
    ),
    "prisma/migrations/20260731120000_add_client_tags/migration.sql": (
        "e3ad829532eda4992e4166872fc799ec328f43824427e5ab0680ec19850a573a"
    ),
    "prisma/migrations/20260731123000_add_client_search_name_index/migration.sql": (
        "c2f3082e39588dc683042e46dfe69f1c1632ee70acf7a6b5d63ab1392f2ac877"
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


def test_prisma_files_keep_postgres_enum_model_changes() -> None:
    searchable_paths = [path for path in SCOPED_PRISMA_PATHS if path.is_file()]
    combined_text = "\n".join(path.read_text() for path in searchable_paths)

    for marker in ('provider = "postgresql"', "CREATE TYPE", "EXCLUDE", "Json?"):
        assert marker in combined_text, f"missing expected Postgres/enum marker: {marker}"


def test_seed_uses_prisma_enum_values() -> None:
    seed_text = (ROOT / "prisma" / "seed.ts").read_text()

    for expected_text in SEED_ENUM_CONTRACT:
        assert expected_text in seed_text


def test_schema_keeps_postgres_enum_field_contract() -> None:
    schema_text = (ROOT / "prisma" / "schema.prisma").read_text()
    blocks = _model_blocks(schema_text)

    assert 'provider = "postgresql"' in schema_text
    assert "Blackout" not in blocks

    for model, field_patterns in SCHEMA_FIELD_CONTRACT.items():
        body = blocks[model]
        for field_pattern in field_patterns:
            assert re.search(
                field_pattern, body
            ), f"{model} missing expected field: {field_pattern}"
