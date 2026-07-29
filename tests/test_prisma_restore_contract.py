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
    "docs/DATA_MODEL.md": "c9a65e33ee77eb5320b7461b379a49f37001d8e1aec44a43b015660adf76cdbb",
    "prisma/migrations/20260611112538_init/migration.sql": (
        "9e9221a6eb11bf4999f501f70aa046574ac1e5ddab94e26c66c96a7fa3975c7c"
    ),
    "prisma/migrations/migration_lock.toml": (
        "3389dbaf2a3cf4b413275867ac6f550b27f79efe85ee9c12082cdd8c5b8239c4"
    ),
    "prisma/schema.prisma": "44aed050a119e3ac78cd7d9905dc4d03065071685bebe0054519fded01500e7b",
    "prisma/seed.ts": "9410a514622530182a79f068d189688c348a52a81d39c4e7f924f6ef1b8ba70e",
}

SCOPED_PRISMA_PATHS = (
    ROOT / "prisma" / "schema.prisma",
    ROOT / "prisma" / "seed.ts",
    *(ROOT / "prisma" / "migrations").glob("**/*"),
)

FORBIDDEN_POSTGRES_ENUM_MARKERS = (
    "@db.",
    "BookingStatus",
    "CREATE TYPE",
    "DayOfWeek",
    "enum ",
    "EXCLUDE",
    "gist",
    "Json?",
    "PaymentMethod",
    "PaymentStatus",
    "postgresql",
    "UserRole",
)

RESTORED_SCHEMA_FIELD_CONTRACT = {
    "User": (r"role\s+String\s+@default\(\"owner\"\)",),
    "BusinessHour": (r"dayOfWeek\s+Int\b",),
    "Booking": (r"status\s+String\s+@default\(\"pending\"\)",),
    "Payment": (r"status\s+String\s+@default\(\"pending\"\)",),
    "AuditLog": (r"metadata\s+String\?",),
}


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _model_blocks(schema_text: str) -> dict[str, str]:
    pattern = re.compile(r"^model\s+(\w+)\s*\{([^}]*)\}", re.MULTILINE | re.DOTALL)
    return {match.group(1): match.group(2) for match in pattern.finditer(schema_text)}


def test_restored_data_model_files_match_pinned_contents() -> None:
    for relative_path, expected_hash in RESTORED_FILE_HASHES.items():
        path = ROOT / relative_path
        assert path.exists(), f"{relative_path} must be present"
        assert _sha256(path) == expected_hash, f"{relative_path} differs from restored contents"


def test_migration_scope_contains_only_restored_files() -> None:
    actual_files = {
        path.relative_to(ROOT).as_posix()
        for path in (ROOT / "prisma" / "migrations").glob("**/*")
        if path.is_file()
    }
    expected_files = {
        relative_path
        for relative_path in RESTORED_FILE_HASHES
        if relative_path.startswith("prisma/migrations/")
    }

    assert actual_files == expected_files


def test_prisma_files_do_not_reintroduce_postgres_enum_model_changes() -> None:
    searchable_paths = [path for path in SCOPED_PRISMA_PATHS if path.is_file()]
    combined_text = "\n".join(path.read_text() for path in searchable_paths)

    for marker in FORBIDDEN_POSTGRES_ENUM_MARKERS:
        assert marker not in combined_text, f"found forbidden Postgres/enum marker: {marker}"


def test_restored_schema_keeps_sqlite_string_field_contract() -> None:
    schema_text = (ROOT / "prisma" / "schema.prisma").read_text()
    blocks = _model_blocks(schema_text)

    assert 'provider = "sqlite"' in schema_text
    assert 'url      = "file:./dev.db"' in schema_text
    assert "StaffService" not in blocks
    assert "Blackout" not in blocks

    for model, field_patterns in RESTORED_SCHEMA_FIELD_CONTRACT.items():
        body = blocks[model]
        for field_pattern in field_patterns:
            assert re.search(
                field_pattern, body
            ), f"{model} missing restored field: {field_pattern}"
