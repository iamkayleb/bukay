# Data Model

This document describes the Prisma data model for Bukay. The canonical source is
[`prisma/schema.prisma`](../prisma/schema.prisma); if this document and the schema disagree,
update the schema first and then align this document.

## Summary

Bukay uses a multi-tenant PostgreSQL data model. `Tenant` is the root record for a business, and
every tenant-owned model stores a required `tenantId String` foreign key back to `Tenant.id`.
Tenant-owned models also declare `@@index([tenantId])` so tenant-filtered reads can use a direct
index.

The tenant-owned models are:

| Model | Purpose | Tenant-specific constraints and indexes |
|-------|---------|-----------------------------------------|
| `User` | Login or staff identity for a tenant | `@@unique([tenantId, email])`, `@@index([tenantId])` |
| `Service` | Bookable service with duration and price | `@@unique([tenantId, name])`, `@@index([tenantId])` |
| `Staff` | Staff member who can be assigned to bookings | `@@unique([tenantId, email])`, `@@index([tenantId])` |
| `BusinessHour` | Weekly opening hours by day of week | `@@unique([tenantId, dayOfWeek])`, `@@index([tenantId])` |
| `Blackout` | Tenant-local closed dates | `@@unique([tenantId, date])`, `@@index([tenantId])` |
| `Client` | Customer profile scoped to a tenant | `@@unique([tenantId, phone])`, `@@index([tenantId])` |
| `Booking` | Appointment linking client, service, and optional staff | `@@index([tenantId])`, `@@index([tenantId, startsAt])` |
| `Payment` | Payment ledger row for a booking | `@@index([tenantId])`, `@@index([bookingId])`, `@@index([providerRef])` |
| `AuditLog` | Append-only tenant activity record | `@@index([tenantId])`, `@@index([tenantId, entityType, entityId])` |

`Tenant` itself is not tenant-scoped and must not carry a `tenantId` column. Deleting a tenant
cascades to its owned rows through the Prisma relations. `Booking` restricts deletion of referenced
clients and services, and sets `staffId` to null when a referenced staff row is deleted.

Authentication state is stored in shared non-tenant-scoped tables:

| Model | Purpose | Constraints and indexes |
|-------|---------|-------------------------|
| `OtpCode` | Pending or consumed one-time login codes keyed by phone | `phone` primary key, `@@index([expiresAt])` |
| `OtpRateLimit` | OTP request counters keyed by phone | `phone` primary key, `@@index([windowStart])` |

## Model Details

### Tenant

`Tenant` stores the business name, globally unique slug, timezone, currency, and relations to all
tenant-owned records. The defaults are `Africa/Lagos` for timezone and `NGN` for currency.

### User

`User` stores email, display name, and role. Roles are currently stored as strings with a default of
`owner`.

### Service

`Service` stores name, optional description, duration in minutes, price in minor units, currency, and
an `active` flag.

### Staff

`Staff` stores contact information and an `active` flag. Bookings may reference staff, but the
booking remains if staff is later deleted.

### BusinessHour

`BusinessHour` stores one row per tenant and weekday, with `opensAt` and `closesAt` as `HH:MM`
strings and an `isClosed` flag.

### Blackout

`Blackout` stores tenant-local dates when online booking is unavailable, plus an optional reason.

### Client

`Client` stores customer name, optional email, required phone number, optional notes, and booking
relations.

### Booking

`Booking` links a client, service, optional staff member, start and end timestamps, status string, and
optional notes. The tenant/start index supports calendar views.

### Payment

`Payment` links to a booking and stores amount, currency, provider metadata, status string, optional
paid timestamp, and audit timestamps.

### AuditLog

`AuditLog` stores action history with optional actor and entity references. `metadata` is stored as
structured JSON.

### OtpCode

`OtpCode` stores the hashed one-time code, expiry timestamp, failed-attempt count, and consumed flag
for a normalized phone number. Keeping consumed rows until expiry lets verification return an
explicit already-used response across server instances.

### OtpRateLimit

`OtpRateLimit` stores the current OTP request window, request count, and last-send timestamp for a
normalized phone number. This keeps resend cooldowns and rate limits consistent across server
instances.

## Running Migrations

The schema uses PostgreSQL with `url = env("DATABASE_URL")`, so local migrations require a
configured PostgreSQL database URL.

```bash
# Install dependencies and generate the Prisma client.
npm install
npm run prisma:generate

# Apply migrations to the configured PostgreSQL database.
npm run migrate:dev -- --schema prisma/schema.prisma

# Seed the demo tenant and sample data.
npm run db:seed -- --schema prisma/schema.prisma
```

The seed script is configured in `package.json` as `tsx prisma/seed.ts`. It is idempotent: it upserts
the demo tenant with slug `demo`, removes dependent demo rows in foreign-key order, and recreates a
stable sample dataset with an owner user, services, business hours, staff, client, booking, payment,
and audit log.

## Migration History

Migrations live under [`prisma/migrations`](../prisma/migrations). The current history contains one
checked-in migration:

| Migration | Description |
|-----------|-------------|
| `20260611112538_init` | Creates the initial schema for tenants, users, services, staff, business hours, clients, bookings, payments, and audit logs. It also creates all unique constraints and tenant indexes declared in `schema.prisma`. |
| `20260708000000_add_schedule_blackouts` | Adds tenant-scoped blackout dates and relaxes business hours to support multiple windows per day. |
| `20260722000000_add_booking_staff_overlap_constraint` | Adds a PostgreSQL exclusion constraint that prevents overlapping bookings for the same tenant and staff member. |
| `20260727000000_audit_log_metadata_jsonb` | Converts audit metadata to JSONB. |
| `20260729112000_add_otp_persistent_store` | Adds shared OTP code and OTP rate-limit tables used by phone authentication. |

[`prisma/migrations/migration_lock.toml`](../prisma/migrations/migration_lock.toml) records the
database provider as `postgresql`. Do not edit generated migration files by hand after they have been
applied; create a new migration from schema changes instead.
