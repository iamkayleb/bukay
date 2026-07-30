from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from tests.sqlite_migrations import apply_sqlite_migrations  # noqa: E402


def _connect(db_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _apply_migrations(connection: sqlite3.Connection) -> None:
    apply_sqlite_migrations(connection)


def _seed_booking_dependencies(connection: sqlite3.Connection) -> None:
    connection.execute("""
        INSERT INTO "Tenant" ("id", "name", "slug", "updatedAt")
        VALUES ('tenant-1', 'Bukay Test', 'bukay-test', CURRENT_TIMESTAMP)
        """)
    connection.execute("""
        INSERT INTO "Client" ("id", "tenantId", "name", "phone", "email", "updatedAt")
        VALUES (
            'client-1', 'tenant-1', 'Ada Client', '+2348000000001',
            'ada@example.com', CURRENT_TIMESTAMP
        )
        """)
    connection.execute("""
        INSERT INTO "Service" (
            "id", "tenantId", "name", "durationMinutes", "priceCents", "updatedAt"
        )
        VALUES ('service-1', 'tenant-1', 'Consultation', 60, 10000, CURRENT_TIMESTAMP)
        """)
    connection.execute("""
        INSERT INTO "Staff" ("id", "tenantId", "name", "email", "phone", "updatedAt")
        VALUES (
            'staff-1', 'tenant-1', 'Kay Staff', 'staff@example.com',
            '+2348000000002', CURRENT_TIMESTAMP
        )
        """)


def _create_manual_booking(connection: sqlite3.Connection) -> None:
    connection.execute("""
        INSERT INTO "Booking" (
            "id", "tenantId", "clientId", "serviceId", "staffId",
            "startsAt", "endsAt", "status", "notes", "updatedAt"
        )
        VALUES (
            'booking-1', 'tenant-1', 'client-1', 'service-1', 'staff-1',
            '2026-07-30 10:00:00.000', '2026-07-30 11:00:00.000',
            'confirmed', 'Front desk booking', CURRENT_TIMESTAMP
        )
        """)


def test_manual_booking_creation_writes_audit_log_entry(tmp_path: Path) -> None:
    db_path = tmp_path / "bukay.db"
    with _connect(db_path) as connection:
        _apply_migrations(connection)
        _seed_booking_dependencies(connection)
        _create_manual_booking(connection)

        audit_row = connection.execute("""
            SELECT "tenantId", "action", "entityType", "entityId", "metadata"
            FROM "AuditLog"
            WHERE "entityType" = 'Booking'
              AND "entityId" = 'booking-1'
            """).fetchone()

    assert audit_row is not None
    assert audit_row["tenantId"] == "tenant-1"
    assert audit_row["action"] == "manual_booking_created"
    assert audit_row["entityType"] == "Booking"
    assert audit_row["entityId"] == "booking-1"

    metadata = json.loads(audit_row["metadata"])
    assert metadata == {
        "bookingId": "booking-1",
        "clientId": "client-1",
        "serviceId": "service-1",
        "staffId": "staff-1",
        "startsAt": "2026-07-30 10:00:00.000",
        "endsAt": "2026-07-30 11:00:00.000",
        "status": "confirmed",
    }
