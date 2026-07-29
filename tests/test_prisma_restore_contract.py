"""Regression checks for the restored SQLite/string-based Prisma data model.

Issue #176 requires these data-model files to stay byte-for-byte aligned with
the restored pre-authenticated app layout state. The source issue did not carry
the human-supplied reference SHA, so this test pins the current restored files
and makes future drift explicit in CI.
"""

from __future__ import annotations

import hashlib
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


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


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
