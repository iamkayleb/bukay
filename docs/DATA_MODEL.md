# Data Model

Schema source: `web/prisma/schema.prisma`  
Database: PostgreSQL (via Prisma ORM)

## Multi-Tenancy

Every tenant-owned table carries a `tenantId` column with a `@@index([tenantId])`. All foreign keys to `Tenant` use `onDelete: Cascade` so dropping a tenant removes all its data.

## Entities

### Tenant
Top-level isolation boundary. Each tenant has a unique `slug`.

| Column    | Type     | Notes            |
|-----------|----------|------------------|
| id        | String   | cuid, PK         |
| name      | String   |                  |
| slug      | String   | unique           |
| createdAt | DateTime |                  |
| updatedAt | DateTime | auto-updated     |

### User
People who authenticate into the system (admins, staff, clients).

| Column    | Type     | Notes                              |
|-----------|----------|------------------------------------|
| id        | String   | cuid, PK                           |
| tenantId  | String   | FK → Tenant, index                 |
| email     | String   | unique per tenant                  |
| name      | String   |                                    |
| role      | UserRole | ADMIN \| STAFF \| CLIENT           |
| createdAt | DateTime |                                    |
| updatedAt | DateTime |                                    |

Unique constraint: `(tenantId, email)`

### Service
Services offered by a tenant (e.g. haircut, massage).

| Column          | Type    | Notes              |
|-----------------|---------|--------------------|
| id              | String  | cuid, PK           |
| tenantId        | String  | FK → Tenant, index |
| name            | String  |                    |
| description     | String? |                    |
| durationMinutes | Int     |                    |
| price           | Decimal | 10,2 precision     |
| isActive        | Boolean | default true       |

### Staff
Service providers. May optionally link to a `User` account.

| Column   | Type    | Notes                      |
|----------|---------|----------------------------|
| id       | String  | cuid, PK                   |
| tenantId | String  | FK → Tenant, index         |
| userId   | String? | FK → User, unique, nullable|
| name     | String  |                            |
| email    | String  | unique per tenant          |

Unique constraint: `(tenantId, email)`

### BusinessHour
Operating hours, scoped per tenant or per staff member.

| Column    | Type    | Notes                         |
|-----------|---------|-------------------------------|
| id        | String  | cuid, PK                      |
| tenantId  | String  | FK → Tenant, index            |
| staffId   | String? | FK → Staff, index, nullable   |
| dayOfWeek | Int     | 0 = Sunday … 6 = Saturday     |
| openTime  | String  | "HH:MM" (24h)                 |
| closeTime | String  | "HH:MM" (24h)                 |
| isClosed  | Boolean | default false                 |

### Client
Customers who book appointments.

| Column   | Type    | Notes              |
|----------|---------|--------------------|
| id       | String  | cuid, PK           |
| tenantId | String  | FK → Tenant, index |
| name     | String  |                    |
| email    | String  | unique per tenant  |
| phone    | String? |                    |

Unique constraint: `(tenantId, email)`

### Booking
An appointment linking a client, staff member, and service.

| Column    | Type          | Notes                           |
|-----------|---------------|---------------------------------|
| id        | String        | cuid, PK                        |
| tenantId  | String        | FK → Tenant, index              |
| serviceId | String        | FK → Service, index             |
| staffId   | String        | FK → Staff, index               |
| clientId  | String        | FK → Client, index              |
| startAt   | DateTime      |                                 |
| endAt     | DateTime      |                                 |
| status    | BookingStatus | PENDING \| CONFIRMED \| CANCELLED \| COMPLETED |
| notes     | String?       |                                 |

### Payment
One-to-one payment record per booking.

| Column    | Type          | Notes                          |
|-----------|---------------|--------------------------------|
| id        | String        | cuid, PK                       |
| tenantId  | String        | FK → Tenant, index             |
| bookingId | String        | FK → Booking, unique           |
| amount    | Decimal       | 10,2 precision                 |
| currency  | String        | default "USD"                  |
| status    | PaymentStatus | PENDING \| PAID \| REFUNDED \| FAILED |
| paidAt    | DateTime?     |                                |

### AuditLog
Immutable event log. No `updatedAt`.

| Column     | Type    | Notes                        |
|------------|---------|------------------------------|
| id         | String  | cuid, PK                     |
| tenantId   | String  | FK → Tenant, index           |
| userId     | String? | FK → User, index, nullable   |
| action     | String  | e.g. "booking.created"       |
| resource   | String  | e.g. "Booking"               |
| resourceId | String  |                              |
| meta       | Json?   | arbitrary extra context      |
| createdAt  | DateTime|                              |

## Enums

| Enum          | Values                                       |
|---------------|----------------------------------------------|
| UserRole      | ADMIN, STAFF, CLIENT                         |
| BookingStatus | PENDING, CONFIRMED, CANCELLED, COMPLETED     |
| PaymentStatus | PENDING, PAID, REFUNDED, FAILED              |

## Running migrations and seed

```bash
cd web

# Apply migrations (requires DATABASE_URL)
npx prisma migrate dev

# Insert demo data
npx prisma db seed
```

The seed creates one tenant (`demo-salon`) with three services: Haircut, Hair Color, and Blowout. It is idempotent — safe to run multiple times.
