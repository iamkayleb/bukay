from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "prisma" / "migrations"


def _connect(db_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _apply_migrations(connection: sqlite3.Connection) -> None:
    for migration in sorted(MIGRATIONS_DIR.glob("*/migration.sql")):
        connection.executescript(migration.read_text())


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


def _create_booking(connection: sqlite3.Connection) -> None:
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


def _calendar_bookings(
    connection: sqlite3.Connection, tenant_id: str, start: str, end: str
) -> list[dict[str, object]]:
    rows = connection.execute(
        """
        SELECT
            booking."id",
            booking."tenantId",
            booking."clientId",
            booking."serviceId",
            booking."staffId",
            booking."startsAt",
            booking."endsAt",
            booking."status",
            booking."notes",
            client."name" AS "clientName",
            service."name" AS "serviceName",
            staff."name" AS "staffName"
        FROM "Booking" AS booking
        JOIN "Client" AS client ON client."id" = booking."clientId"
        JOIN "Service" AS service ON service."id" = booking."serviceId"
        LEFT JOIN "Staff" AS staff ON staff."id" = booking."staffId"
        WHERE booking."tenantId" = ?
          AND booking."startsAt" < ?
          AND booking."endsAt" > ?
        ORDER BY booking."startsAt" ASC, booking."createdAt" ASC
        """,
        (tenant_id, end, start),
    ).fetchall()

    return [
        {
            "id": row["id"],
            "tenantId": row["tenantId"],
            "clientId": row["clientId"],
            "serviceId": row["serviceId"],
            "staffId": row["staffId"],
            "startsAt": row["startsAt"],
            "endsAt": row["endsAt"],
            "status": row["status"],
            "notes": row["notes"],
            "client": {"name": row["clientName"]},
            "service": {"name": row["serviceName"]},
            "staff": {"name": row["staffName"]},
        }
        for row in rows
    ]


def test_newly_created_booking_is_visible_in_calendar_response(tmp_path: Path) -> None:
    db_path = tmp_path / "bukay.db"
    with _connect(db_path) as connection:
        _apply_migrations(connection)
        _seed_booking_dependencies(connection)
        _create_booking(connection)

        response = {
            "ok": True,
            "bookings": _calendar_bookings(
                connection,
                tenant_id="tenant-1",
                start="2026-07-30 00:00:00.000",
                end="2026-07-31 00:00:00.000",
            ),
        }

    assert response["ok"] is True
    assert response["bookings"] == [
        {
            "id": "booking-1",
            "tenantId": "tenant-1",
            "clientId": "client-1",
            "serviceId": "service-1",
            "staffId": "staff-1",
            "startsAt": "2026-07-30 10:00:00.000",
            "endsAt": "2026-07-30 11:00:00.000",
            "status": "confirmed",
            "notes": "Front desk booking",
            "client": {"name": "Ada Client"},
            "service": {"name": "Consultation"},
            "staff": {"name": "Kay Staff"},
        }
    ]
