# What Bukay is, and what is left

> Read before writing an issue, so it advances the product rather than
> re-specifying something that exists or inventing something nobody needs.

## The product in one paragraph

A booking and payments app for small Nigerian service businesses — salons,
barbers, clinics. A merchant signs in by phone, sets their services and
business hours, and shares a public link. A client picks a service and a time,
leaves a name and number, and the booking is held pending payment. The
merchant sees the day's bookings, who has paid, and what is owed.

Two audiences, and they need opposite things. The **client** sees one page and
must be able to finish in under a minute on a phone. The **merchant** lives in
the app and needs density, totals, and actions.

## What is built

| Screen | Route | State |
|---|---|---|
| Public booking | `/{slug}/book` | works end to end — service → time → details → held |
| Today | `/(app)/today` | bookings for the day |
| Calendar | `/(app)/calendar` | day view |
| Clients | `/(app)/clients` | list and detail |
| Services | `/(app)/services` | list, create, edit |
| Payments | `/(app)/payments` | list with amounts and status |
| Settings | `/(app)/settings` | business hours editor |

Underneath: Prisma on SQLite, phone sign-in with a signed session cookie,
Flutterwave for payments, multi-tenant by slug.

## What is left, and why it matters

Ordered by what most changes whether this is usable, not by effort.

1. **#551 — unauthenticated cross-tenant access.** An `x-tenant-id` header
   bypasses tenant resolution. Anyone can read another business's data. This is
   a security hole, and it should not be the belt's first unattended round.
2. **#545 — booking actions.** A merchant cannot cancel, reschedule or mark a
   no-show. The calendar is read-only, so the day cannot be managed from it.
   *(In flight.)*
3. **#553 — today summary.** Bookings, money taken, money owed, at a glance.
   The number the owner actually opens the app for.
4. **#554 — first-run.** A new merchant lands in an empty app with nothing
   telling them to add a service and share their link.
5. **#555 — mobile layout.** The merchant screens have never been checked at
   phone width. Most of these businesses are run from a phone.
6. **#556 — empty states.** Five screens go blank instead of saying what is
   missing.

## Where a new issue usually belongs

- **Completing a screen that half-exists** is worth more than adding a new
  one. Clients and Payments both list; neither does much else.
- **The merchant's day** is the spine: open the app, see today, act on it,
  know what you are owed. Anything on that path outranks anything off it.
- **The client's minute** is the other half. The booking flow works; what is
  untested is whether it survives a bad network, a taken slot, or a phone.

## What not to write an issue for

- **Workflows, CI, agent lanes, template sync.** Those belong in
  `iamkayleb/Workflows`.
- **Rewrites.** "Migrate to X", "refactor Y" is not a round. If a change is
  worth that, it needs a decision first, not an issue.
- **Anything already covered by #551–#556.** Check the list before writing;
  adding a seventh overlapping issue is how a backlog stops being read.

## One honest note about sequencing

The belt is newly working and has completed one full round. Prefer issues that
are self-contained and have a visible outcome — a screen a person can open and
see the difference. Save anything cross-cutting (auth, tenancy, payments
reconciliation) until more rounds have landed and the verification loop has
been seen to catch something.
