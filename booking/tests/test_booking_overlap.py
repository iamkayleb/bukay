from __future__ import annotations

import sqlite3
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from tests.sqlite_migrations import apply_sqlite_migrations  # noqa: E402


def _connect(db_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path, timeout=10, isolation_level=None)
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 10000")
    return connection


def _apply_migrations(connection: sqlite3.Connection) -> None:
    apply_sqlite_migrations(connection)


def _seed_booking_dependencies(connection: sqlite3.Connection) -> None:
    connection.execute("""
        INSERT INTO "Tenant" ("id", "name", "slug", "updatedAt")
        VALUES ('tenant-1', 'Bukay Test', 'bukay-test', CURRENT_TIMESTAMP)
        """)
    connection.execute("""
        INSERT INTO "Client" ("id", "tenantId", "name", "phone", "updatedAt")
        VALUES ('client-1', 'tenant-1', 'Ada Client', '+2348000000001', CURRENT_TIMESTAMP)
        """)
    connection.execute("""
        INSERT INTO "Service" (
            "id", "tenantId", "name", "durationMinutes", "priceCents", "updatedAt"
        )
        VALUES ('service-1', 'tenant-1', 'Consultation', 60, 10000, CURRENT_TIMESTAMP)
        """)
    connection.execute("""
        INSERT INTO "Staff" ("id", "tenantId", "name", "email", "updatedAt")
        VALUES ('staff-1', 'tenant-1', 'Kay Staff', 'staff@example.com', CURRENT_TIMESTAMP)
        """)


def _insert_booking(db_path: Path, booking_id: str, barrier: Barrier) -> tuple[str, str | None]:
    barrier.wait()
    try:
        with _connect(db_path) as connection:
            connection.execute(
                """
                INSERT INTO "Booking" (
                    "id", "tenantId", "clientId", "serviceId", "staffId",
                    "startsAt", "endsAt", "status", "updatedAt"
                )
                VALUES (
                    ?, 'tenant-1', 'client-1', 'service-1', 'staff-1',
                    '2026-07-30 10:00:00.000', '2026-07-30 11:00:00.000',
                    'confirmed', CURRENT_TIMESTAMP
                )
                """,
                (booking_id,),
            )
        return ("created", None)
    except sqlite3.IntegrityError as error:
        return ("rejected", str(error))


def _staff_overlaps(connection: sqlite3.Connection) -> list[tuple[str, str]]:
    return connection.execute("""
        SELECT left_booking."id", right_booking."id"
        FROM "Booking" AS left_booking
        JOIN "Booking" AS right_booking
          ON left_booking."id" < right_booking."id"
         AND left_booking."tenantId" = right_booking."tenantId"
         AND left_booking."staffId" = right_booking."staffId"
         AND left_booking."startsAt" < right_booking."endsAt"
         AND left_booking."endsAt" > right_booking."startsAt"
        WHERE left_booking."staffId" = 'staff-1'
        """).fetchall()


def test_concurrent_overlapping_bookings_for_same_staff_are_rejected(tmp_path: Path) -> None:
    db_path = tmp_path / "bukay.db"
    with _connect(db_path) as connection:
        _apply_migrations(connection)
        _seed_booking_dependencies(connection)

    barrier = Barrier(2)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(
            executor.map(
                lambda booking_id: _insert_booking(db_path, booking_id, barrier), ("a", "b")
            )
        )

    statuses = [status for status, _message in results]
    rejection_messages = [message for status, message in results if status == "rejected"]

    assert statuses.count("created") == 1
    assert statuses.count("rejected") == 1
    assert any("BOOKING_OVERLAP" in (message or "") for message in rejection_messages)

    with _connect(db_path) as connection:
        booking_count = connection.execute('SELECT COUNT(*) FROM "Booking"').fetchone()[0]
        assert booking_count == 1
        assert _staff_overlaps(connection) == []
