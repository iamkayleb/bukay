# Data Model

Bukay uses a tenant-scoped booking model. The `Tenant` row owns all business data, and each
tenant-owned table stores `tenantId` with an index for tenant-filtered queries.

## Core Models

| Model | Purpose | Tenant scoped |
| --- | --- | --- |
| `Tenant` | Business account, locale, and currency settings. | No |
| `User` | Tenant users and roles. | Yes |
| `Service` | Bookable services with duration and price. | Yes |
| `Staff` | Staff members who can be assigned to bookings. | Yes |
| `BusinessHour` | Weekly opening hours for a tenant. | Yes |
| `Client` | Customer profile and contact details. | Yes |
| `Booking` | Appointment linking client, service, and optional staff. | Yes |
| `Payment` | Payment record for a booking. | Yes |
| `AuditLog` | Tenant audit events for operational traceability. | Yes |

## Tenant Indexes

Every tenant-scoped model includes `@@index([tenantId])`:

- `User`
- `Service`
- `Staff`
- `BusinessHour`
- `Client`
- `Booking`
- `Payment`
- `AuditLog`

## Relationship Summary

`Tenant` has one-to-many relationships with users, services, staff, business hours, clients,
bookings, payments, and audit logs. `Booking` belongs to one `Client` and one `Service`, can
optionally belong to one `Staff` member, and can have many `Payment` rows.

The schema uses cent-based integer amounts (`priceCents`, `amountCents`) and string status fields
so the initial SQLite development database can migrate without provider-specific enum behavior.
