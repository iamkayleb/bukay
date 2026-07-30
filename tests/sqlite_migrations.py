from __future__ import annotations

import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = ROOT / "prisma" / "migrations"

POSTGRES_ONLY_MIGRATIONS = {
    "20260722000000_add_booking_staff_overlap_constraint",
    "20260727000000_audit_log_metadata_jsonb",
}

PRISMA_ENUM_TYPES = (
    "UserRole",
    "BookingStatus",
    "PaymentStatus",
    "PaymentMethod",
    "DayOfWeek",
)


def apply_sqlite_migrations(connection: sqlite3.Connection) -> None:
    for migration in sorted(MIGRATIONS_DIR.glob("*/migration.sql")):
        if migration.parent.name in POSTGRES_ONLY_MIGRATIONS:
            continue
        connection.executescript(_sqlite_script(migration.read_text()))


def _sqlite_script(sql: str) -> str:
    sql = re.sub(r'-- CreateEnum\s+CREATE TYPE "[^"]+" AS ENUM \([^)]+\);\s*', "", sql)
    sql = re.sub(r'-- AddForeignKey\s+ALTER TABLE "[^"]+" ADD CONSTRAINT [^;]+;\s*', "", sql)
    sql = re.sub(r'DROP INDEX "([^"]+)";', r'DROP INDEX IF EXISTS "\1";', sql)
    sql = sql.replace("TIMESTAMP(3)", "TEXT")
    sql = sql.replace("DATETIME", "TEXT")
    sql = sql.replace("JSONB", "TEXT")
    sql = sql.replace("DEFAULT true", "DEFAULT 1")
    sql = sql.replace("DEFAULT false", "DEFAULT 0")
    for enum_type in PRISMA_ENUM_TYPES:
        sql = sql.replace(f'"{enum_type}"', "TEXT")
    return sql
