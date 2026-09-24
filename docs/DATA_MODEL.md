# Data Model

This document describes the Prisma data model for Bukay. The canonical source is
[`prisma/schema.prisma`](../prisma/schema.prisma); if this document and the schema disagree,
update the schema first and then align this document.

## Summary

Bukay uses a multi-tenant SQLite data model. `Tenant` is the root record for a business, and
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
| `Client` | Customer profile scoped to a tenant | `@@unique([tenantId, phone])`, `@@index([tenantId])` |
| `Booking` | Appointment linking client, service, and optional staff | `@@index([tenantId])`, `@@index([tenantId, startsAt])` |
| `Payment` | Payment ledger row for a booking | `@@index([tenantId])`, `@@index([bookingId])`, `@@index([providerRef])` |
| `LedgerEntry` | Append-only financial ledger row for a payment, refund, or payout event | `@@unique([type, sourceRef])`, `@@index([tenantId])`, `@@index([bookingId])`, `@@index([tenantId, type, createdAt])` |
| `AuditLog` | Append-only tenant activity record | `@@index([tenantId])`, `@@index([tenantId, entityType, entityId])` |

`Tenant` itself is not tenant-scoped and must not carry a `tenantId` column. Deleting a tenant
cascades to its owned rows through the Prisma relations. `Booking` restricts deletion of referenced
clients and services, and sets `staffId` to null when a referenced staff row is deleted.

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

### Client

`Client` stores customer name, optional email, required phone number, optional notes, and booking
relations.

### Booking

`Booking` links a client, service, optional staff member, start and end timestamps, status string, and
optional notes. The tenant/start index supports calendar views.

### Payment

`Payment` links to a booking and stores amount, currency, provider metadata, status string, optional
paid timestamp, and audit timestamps.

### LedgerEntry

`LedgerEntry` is an append-only record of payment, refund, and payout events. Rows are never
updated or deleted after insert — see the append-only trigger migration. `type` holds one of the
`LedgerEntryType` values from `app/lib/ledger.ts` (`payment_success`, `refund`, `payout`, or
`no_show_fee`); it is stored as a plain string because the sqlite connector does not support Prisma
enums. `paymentId` optionally links a `payment_success` or `refund` entry back to its originating
`Payment` row, and `bookingId` optionally links entries tied to a specific booking (e.g.
`no_show_fee`). `sourceRef` is a dedup key for the originating event (a `Payment` id or a provider
payout reference) and is unique together with `type`, so retried webhooks or reconciliation runs
cannot double-append the same event.

### DeadLetterEvent

`DeadLetterEvent` is not tenant-scoped. It records provider webhook events (e.g. failed payment
callbacks) that could not be processed, storing the provider, event type, raw payload, and an
optional failure reason for later inspection.

### AuditLog

`AuditLog` stores action history with optional actor and entity references. `metadata` is stored as a
string so callers can serialize structured context when needed.

## Running Migrations

The schema uses SQLite with `url = "file:./dev.db"`, so local migrations create
`prisma/dev.db`.

```bash
# Install dependencies and generate the Prisma client.
npm install
npm run prisma:generate

# Apply migrations to the local SQLite database.
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
| `20260611112538_init` | Creates the initial SQLite schema for tenants, users, services, staff, business hours, clients, bookings, payments, and audit logs. It also creates all unique constraints and tenant indexes declared in `schema.prisma`. |

[`prisma/migrations/migration_lock.toml`](../prisma/migrations/migration_lock.toml) records the
database provider as `sqlite`. Do not edit generated migration files by hand after they have been
applied; create a new migration from schema changes instead.
