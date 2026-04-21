# Data Model

Multi-tenant booking platform schema. All tenant-owned tables carry `tenantId` with `@@index([tenantId])` for efficient per-tenant queries.

## Entity Overview

```
Tenant
  ├── User          (role: ADMIN | STAFF | CLIENT)
  ├── Service       (bookable services with pricing)
  ├── Staff         (optionally linked to a User)
  │     └── BusinessHour  (per-staff or tenant-level hours)
  ├── Client
  ├── Booking       (links Client + Service + Staff)
  │     └── Payment
  └── AuditLog
```

## Models

### Tenant
Root entity. Each tenant is an independent business.

| Column    | Type     | Notes                    |
|-----------|----------|--------------------------|
| id        | TEXT     | cuid(), PK               |
| name      | TEXT     |                          |
| slug      | TEXT     | unique, URL-friendly key |
| createdAt | DateTime |                          |
| updatedAt | DateTime |                          |

---

### User
System users belonging to a tenant.

| Column    | Type     | Notes                              |
|-----------|----------|------------------------------------|
| id        | TEXT     | cuid(), PK                         |
| tenantId  | TEXT     | FK → Tenant, cascade delete        |
| email     | TEXT     | unique per tenant                  |
| name      | TEXT     |                                    |
| role      | Role     | ADMIN \| STAFF \| CLIENT, default STAFF |
| createdAt | DateTime |                                    |
| updatedAt | DateTime |                                    |

Indexes: `tenantId`, unique `(tenantId, email)`

---

### Service
Bookable services offered by a tenant.

| Column          | Type     | Notes                         |
|-----------------|----------|-------------------------------|
| id              | TEXT     | cuid(), PK                    |
| tenantId        | TEXT     | FK → Tenant, cascade delete   |
| name            | TEXT     | unique per tenant             |
| description     | TEXT?    |                               |
| durationMinutes | INT      | service duration in minutes   |
| price           | Decimal  | DECIMAL(10,2)                 |
| active          | Boolean  | soft-disable, default true    |
| createdAt       | DateTime |                               |
| updatedAt       | DateTime |                               |

Indexes: `tenantId`, unique `(tenantId, name)`

---

### Staff
Staff members who deliver services.

| Column    | Type     | Notes                              |
|-----------|----------|------------------------------------|
| id        | TEXT     | cuid(), PK                         |
| tenantId  | TEXT     | FK → Tenant, cascade delete        |
| userId    | TEXT?    | optional FK → User (unique)        |
| name      | TEXT     |                                    |
| email     | TEXT     | unique per tenant                  |
| createdAt | DateTime |                                    |
| updatedAt | DateTime |                                    |

Indexes: `tenantId`, unique `(tenantId, email)`

---

### BusinessHour
Operating hours, either tenant-wide (staffId null) or per staff member.

| Column    | Type    | Notes                             |
|-----------|---------|-----------------------------------|
| id        | TEXT    | cuid(), PK                        |
| tenantId  | TEXT    | FK → Tenant, cascade delete       |
| staffId   | TEXT?   | FK → Staff, null = tenant default |
| dayOfWeek | INT     | 0 = Sunday … 6 = Saturday         |
| openTime  | TEXT    | "HH:MM"                           |
| closeTime | TEXT    | "HH:MM"                           |
| isClosed  | Boolean | marks day as closed               |

Indexes: `tenantId`, `staffId`

---

### Client
Customers who book appointments.

| Column    | Type     | Notes                       |
|-----------|----------|-----------------------------|
| id        | TEXT     | cuid(), PK                  |
| tenantId  | TEXT     | FK → Tenant, cascade delete |
| name      | TEXT     |                             |
| email     | TEXT     | unique per tenant           |
| phone     | TEXT?    |                             |
| createdAt | DateTime |                             |
| updatedAt | DateTime |                             |

Indexes: `tenantId`, unique `(tenantId, email)`

---

### Booking
Appointment records linking a client, service, and staff member.

| Column    | Type          | Notes                         |
|-----------|---------------|-------------------------------|
| id        | TEXT          | cuid(), PK                    |
| tenantId  | TEXT          | FK → Tenant, cascade delete   |
| clientId  | TEXT          | FK → Client                   |
| serviceId | TEXT          | FK → Service                  |
| staffId   | TEXT          | FK → Staff                    |
| startAt   | DateTime      |                               |
| endAt     | DateTime      |                               |
| status    | BookingStatus | PENDING \| CONFIRMED \| CANCELLED \| COMPLETED \| NO_SHOW |
| notes     | TEXT?         |                               |
| createdAt | DateTime      |                               |
| updatedAt | DateTime      |                               |

Indexes: `tenantId`, `clientId`, `startAt`

---

### Payment
Payment record for a booking (one-to-one).

| Column    | Type          | Notes                         |
|-----------|---------------|-------------------------------|
| id        | TEXT          | cuid(), PK                    |
| tenantId  | TEXT          | FK → Tenant, cascade delete   |
| bookingId | TEXT          | FK → Booking, unique          |
| amount    | Decimal       | DECIMAL(10,2)                 |
| currency  | TEXT          | default "USD"                 |
| status    | PaymentStatus | PENDING \| PAID \| REFUNDED \| FAILED |
| paidAt    | DateTime?     |                               |
| createdAt | DateTime      |                               |
| updatedAt | DateTime      |                               |

Indexes: `tenantId`

---

### AuditLog
Immutable audit trail for tenant actions.

| Column     | Type     | Notes                       |
|------------|----------|-----------------------------|
| id         | TEXT     | cuid(), PK                  |
| tenantId   | TEXT     | FK → Tenant, cascade delete |
| action     | TEXT     | e.g. "booking.created"      |
| entityType | TEXT     | e.g. "Booking"              |
| entityId   | TEXT     |                             |
| actorId    | TEXT?    | FK → User (nullable)        |
| metadata   | Json?    | arbitrary context           |
| createdAt  | DateTime | no updatedAt (immutable)    |

Indexes: `tenantId`, `(entityType, entityId)`

---

## Enums

| Enum          | Values                                          |
|---------------|-------------------------------------------------|
| Role          | ADMIN, STAFF, CLIENT                            |
| BookingStatus | PENDING, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW |
| PaymentStatus | PENDING, PAID, REFUNDED, FAILED                 |

## Seeding

Run the seed to create a demo tenant with 3 services:

```bash
cd web
prisma migrate dev       # apply migrations
prisma db seed           # inserts demo tenant + Haircut, Hair Color, Blow Dry
```

The seed is idempotent — re-running it will not duplicate records.
