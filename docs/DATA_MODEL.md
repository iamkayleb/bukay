# Data Model

This document describes the Prisma data model for Bukay. The canonical source
is [`prisma/schema.prisma`](../prisma/schema.prisma); if the two ever disagree,
the schema wins — update this doc.

## Tenancy Model

Bukay is **multi-tenant** with row-level scoping. Every domain row outside of
the `Tenant` table itself carries a `tenantId` column that points at
`Tenant.id`. Every such table also declares a Prisma `@@index([tenantId])` so
that:

- Application queries that filter by tenant hit the index immediately.
- Cross-tenant scans are visible in `pg_stat` and easy to flag in review.

The application layer is responsible for setting `tenantId` on every write and
including it in every read filter. The schema gives us the storage shape and
indexes; it does not, on its own, enforce row-level isolation.

`onDelete: Cascade` is used from `Tenant` down through every owned table, so
deleting a tenant deletes its full data island.

## Models

### Tenant

The root of the multi-tenant tree.

| Column     | Type     | Notes                                  |
|------------|----------|----------------------------------------|
| `id`       | `String` | `cuid()` primary key                   |
| `slug`     | `String` | URL-safe identifier, globally unique   |
| `name`     | `String` | Display name                           |
| `timezone` | `String` | IANA tz, defaults to `Africa/Lagos`    |
| `currency` | `String` | ISO 4217, defaults to `NGN`            |

Children: `users`, `services`, `staff`, `businessHours`, `blackouts`,
`clients`, `bookings`, `payments`, `auditLogs`.

### User

Login identity scoped to a tenant. The same email can exist in two different
tenants — `@@unique([tenantId, email])` enforces uniqueness within a tenant.

| Column         | Type       | Notes                                  |
|----------------|------------|----------------------------------------|
| `tenantId`     | `String`   | FK → `Tenant.id`, indexed              |
| `email`        | `String`   | Unique within tenant                   |
| `passwordHash` | `String`   | bcrypt/argon2 hash, never plaintext    |
| `role`         | `UserRole` | `OWNER` / `ADMIN` / `STAFF` / `VIEWER` |

A `User` may be linked 1:1 to a `Staff` row (the human who fulfils bookings).

### Service

A bookable offering.

| Column            | Type      | Notes                              |
|-------------------|-----------|------------------------------------|
| `tenantId`        | `String`  | FK → `Tenant.id`, indexed          |
| `name`            | `String`  | Display name                       |
| `durationMinutes` | `Int`     | Slot length                        |
| `priceCents`      | `Int`     | Stored as minor units              |
| `active`          | `Boolean` | Soft-disable without deleting      |

Services can be assigned to multiple staff via the `StaffServices` join.

### Staff

People who fulfil bookings. May optionally link to a `User` if the staff
member also logs in.

| Column     | Type      | Notes                                          |
|------------|-----------|------------------------------------------------|
| `tenantId` | `String`  | FK → `Tenant.id`, indexed                      |
| `userId`   | `String?` | Optional FK → `User.id` (`SetNull` on delete)  |
| `name`     | `String`  | Display name                                   |

### BusinessHour

Weekly availability template. Each row is one open window. Multiple rows for
the same weekday allow split schedules such as 09:00-12:00 and 13:00-17:00.
Closed weekdays have no rows.

| Column      | Type     | Notes                                           |
|-------------|----------|-------------------------------------------------|
| `tenantId`  | `String` | FK → `Tenant.id`, indexed                       |
| `dayOfWeek` | `Int`    | Weekday number used by the availability helper  |
| `opensAt`   | `String` | Local wall-clock time, `HH:mm`                  |
| `closesAt`  | `String` | Local wall-clock time, `HH:mm`                  |

Composite index `@@index([tenantId, dayOfWeek])` supports the availability
lookup path. `@@unique([tenantId, dayOfWeek, opensAt, closesAt])` prevents
duplicate windows without limiting a weekday to one window.

### Blackout

Date-specific closure override for holidays and one-off closures. A blackout
applies to the whole local date for its tenant; when present, availability
returns no open windows for that date.

| Column     | Type      | Notes                                      |
|------------|-----------|--------------------------------------------|
| `tenantId` | `String`  | FK -> `Tenant.id`, indexed                 |
| `date`     | `String`  | Local calendar date, `YYYY-MM-DD`          |
| `reason`   | `String?` | Optional owner-facing note                 |

`@@unique([tenantId, date])` keeps each tenant to one blackout row per date.

### Client

End-customers who book services. Email and phone are each unique within a
tenant — duplicates would force the booking flow to disambiguate.

### Booking

The appointment itself.

| Column      | Type            | Notes                                  |
|-------------|-----------------|----------------------------------------|
| `tenantId`  | `String`        | FK → `Tenant.id`, indexed              |
| `clientId`  | `String`        | FK → `Client.id`                       |
| `serviceId` | `String`        | FK → `Service.id` (`Restrict` delete)  |
| `staffId`   | `String?`       | Optional FK → `Staff.id`               |
| `startsAt`  | `DateTime`      | UTC                                    |
| `endsAt`    | `DateTime`      | UTC                                    |
| `status`    | `BookingStatus` | Enum                                   |

Indexes target the common query shapes:
- `@@index([tenantId, startsAt])` — tenant calendar views.
- `@@index([tenantId, staffId, startsAt])` — per-staff schedule lookups.

### Payment

Money received against a booking. `Payment` carries its own `tenantId` (rather
than relying on the booking's) so the payments ledger can be queried directly
without a join.

| Column        | Type            | Notes                                |
|---------------|-----------------|--------------------------------------|
| `tenantId`    | `String`        | FK → `Tenant.id`, indexed            |
| `bookingId`   | `String`        | FK → `Booking.id`                    |
| `amountCents` | `Int`           | Minor units                          |
| `currency`    | `String`        | ISO 4217                             |
| `method`      | `PaymentMethod` | Enum incl. `MOBILE_MONEY`            |
| `status`      | `PaymentStatus` | Enum                                 |

### AuditLog

Append-only history of tenant-scoped actions. Indexed by `(tenantId, createdAt)`
for chronological scans and `(tenantId, entityType, entityId)` for entity
history.

| Column       | Type     | Notes                                  |
|--------------|----------|----------------------------------------|
| `tenantId`   | `String` | FK → `Tenant.id`, indexed              |
| `actorId`    | `String?`| Optional FK → `User.id`                |
| `action`     | `String` | Free-form verb (`booking.cancelled`)   |
| `entityType` | `String` | e.g. `Booking`, `Payment`              |
| `entityId`   | `String?`| Target row id                          |
| `metadata`   | `Json?`  | Action-specific payload                |

## Enums

- `UserRole`: `OWNER`, `ADMIN`, `STAFF`, `VIEWER`
- `BookingStatus`: `PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`
- `PaymentStatus`: `PENDING`, `PAID`, `REFUNDED`, `FAILED`
- `PaymentMethod`: `CASH`, `CARD`, `MOBILE_MONEY`, `BANK_TRANSFER`, `OTHER`
- `DayOfWeek`: `MONDAY` … `SUNDAY`

## Index Summary

Every tenant-scoped table has at least `@@index([tenantId])`:

| Table          | Tenant index | Additional indexes                                |
|----------------|--------------|---------------------------------------------------|
| `User`         | ✓            | `@@unique([tenantId, email])`                     |
| `Service`      | ✓            | —                                                 |
| `Staff`        | ✓            | `@unique` on `userId`                             |
| `BusinessHour` | ✓            | `…dayOfWeek`, `…dayOfWeek, opensAt, closesAt`     |
| `Blackout`     | ✓            | `@@unique([tenantId, date])`, `…date`             |
| `Client`       | ✓            | `@@unique([tenantId, phone])`, `…email]`          |
| `Booking`      | ✓            | `…startsAt`, `…staffId, startsAt`                 |
| `Payment`      | ✓            | `@@index([tenantId, bookingId])`                  |
| `AuditLog`     | ✓            | `…createdAt`, `…entityType, entityId`             |

## Local Workflow

```bash
# 1. Configure DATABASE_URL in .env (copy from .env.example).
cp .env.example .env

# 2. Install JS deps + generate the Prisma client.
npm install
npm run prisma:generate

# 3. Apply migrations to a local Postgres.
npm run prisma:migrate:dev

# 4. Insert the demo tenant + sample services.
npm run db:seed
```

After seeding, the demo tenant (`slug='demo'`) contains:

- one `OWNER` user (`owner@demo.bukay.dev`),
- three services (`Classic Haircut`, `Beard Trim`, `Full Grooming Package`),
- one staff member linked to the owner user and assigned every service,
- Mon–Sat 09:00–18:00 business hours,
- one demo client,
- one `CONFIRMED` booking for the Classic Haircut on 2026-06-15 10:00 UTC,
- one `PAID` mobile-money payment matching that booking,
- one `seed.bootstrap` audit log entry.

The seed is idempotent: re-running it tears down the dependent rows in FK
order (payments → bookings → audit logs → services → staff → business hours)
before recreating them, so the row counts above stay stable.
