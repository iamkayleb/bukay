-- Record manual booking creation at the database boundary.
-- SQLite triggers keep the audit invariant consistent for all Booking inserts.

CREATE TRIGGER "Booking_audit_manual_created_insert"
AFTER INSERT ON "Booking"
BEGIN
    INSERT INTO "AuditLog" (
        "id",
        "tenantId",
        "action",
        "entityType",
        "entityId",
        "metadata"
    )
    VALUES (
        lower(hex(randomblob(16))),
        NEW."tenantId",
        'manual_booking_created',
        'Booking',
        NEW."id",
        json_object(
            'bookingId', NEW."id",
            'clientId', NEW."clientId",
            'serviceId', NEW."serviceId",
            'staffId', NEW."staffId",
            'startsAt', NEW."startsAt",
            'endsAt', NEW."endsAt",
            'status', NEW."status"
        )
    );
END;
