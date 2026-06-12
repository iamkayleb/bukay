// Seed script: inserts one demo tenant with sample services, staff, a client,
// and a confirmed booking + payment so the multi-tenant data model is fully
// exercised end-to-end.
//
// Usage: `prisma db seed` (configured in package.json).
//
// Idempotent: re-running upserts the demo tenant and reinserts its child
// rows so the seeded counts stay stable.

import {
  PrismaClient,
  UserRole,
  DayOfWeek,
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_TENANT_SLUG = "demo";

const DEMO_SERVICES = [
  {
    name: "Classic Haircut",
    description: "Traditional cut and style, includes wash.",
    durationMinutes: 30,
    priceCents: 5000,
  },
  {
    name: "Beard Trim",
    description: "Shape and tidy beard with hot-towel finish.",
    durationMinutes: 20,
    priceCents: 3000,
  },
  {
    name: "Full Grooming Package",
    description: "Haircut, beard trim, and facial treatment.",
    durationMinutes: 75,
    priceCents: 12000,
  },
];

// Pin the demo booking to a fixed wall-clock so re-seeding stays deterministic.
const DEMO_BOOKING_START_ISO = "2026-06-15T10:00:00.000Z";

async function main() {
  console.log("Seeding demo tenant...");

  const tenant = await prisma.tenant.upsert({
    where: { slug: DEMO_TENANT_SLUG },
    update: {
      name: "Bukay Demo Salon",
      timezone: "Africa/Lagos",
      currency: "NGN",
    },
    create: {
      slug: DEMO_TENANT_SLUG,
      name: "Bukay Demo Salon",
      timezone: "Africa/Lagos",
      currency: "NGN",
    },
  });

  console.log(`Tenant ready: ${tenant.slug} (${tenant.id})`);

  const owner = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "owner@demo.bukay.dev" } },
    update: { name: "Demo Owner", role: UserRole.OWNER },
    create: {
      tenantId: tenant.id,
      email: "owner@demo.bukay.dev",
      // Placeholder bcrypt-shaped hash; replace before any real login is wired up.
      passwordHash: "$2a$10$DEMOHASHDEMOHASHDEMOHASHDEMOHASHDEMOHASHDEMOHASHDEMO",
      name: "Demo Owner",
      role: UserRole.OWNER,
    },
  });

  console.log(`Owner user ready: ${owner.email}`);

  // Re-seeds are idempotent: tear down dependent rows in FK order before
  // recreating them. Service has `onDelete: Restrict` from Booking, so
  // bookings (and payments referencing them) must be cleared first.
  await prisma.payment.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.booking.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });

  // Wipe and reinsert demo services so the count stays at three on re-seed.
  await prisma.service.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.service.createMany({
    data: DEMO_SERVICES.map((s) => ({ ...s, tenantId: tenant.id })),
  });
  const services = await prisma.service.findMany({
    where: { tenantId: tenant.id },
    orderBy: { name: "asc" },
  });
  console.log(`Inserted ${services.length} services for ${tenant.slug}`);

  // Default business hours: Mon–Sat, 09:00–18:00.
  const weekdays: DayOfWeek[] = [
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY,
  ];
  await prisma.businessHour.deleteMany({ where: { tenantId: tenant.id, staffId: null } });
  await prisma.businessHour.createMany({
    data: weekdays.map((day) => ({
      tenantId: tenant.id,
      dayOfWeek: day,
      openMinute: 9 * 60,
      closeMinute: 18 * 60,
    })),
  });
  console.log("Business hours set: Mon–Sat 09:00–18:00");

  // Re-create the demo staff member (linked to the owner user) and assign
  // every service to them.
  await prisma.staff.deleteMany({ where: { tenantId: tenant.id } });
  const staff = await prisma.staff.create({
    data: {
      tenantId: tenant.id,
      userId: owner.id,
      name: "Demo Owner",
      email: owner.email,
      phone: "+2348000000001",
      services: { connect: services.map((s) => ({ id: s.id })) },
    },
  });
  console.log(`Staff ready: ${staff.name} (${staff.id})`);

  // Demo client.
  const client = await prisma.client.upsert({
    where: { tenantId_phone: { tenantId: tenant.id, phone: "+2348000000099" } },
    update: { name: "Demo Client", email: "client@demo.bukay.dev" },
    create: {
      tenantId: tenant.id,
      name: "Demo Client",
      email: "client@demo.bukay.dev",
      phone: "+2348000000099",
    },
  });
  console.log(`Client ready: ${client.name} (${client.id})`);

  // Demo booking: the classic haircut, confirmed, with a matching paid payment.
  const haircut = services.find((s) => s.name === "Classic Haircut");
  if (!haircut) throw new Error("seed: Classic Haircut service missing");

  const startsAt = new Date(DEMO_BOOKING_START_ISO);
  const endsAt = new Date(startsAt.getTime() + haircut.durationMinutes * 60_000);

  const booking = await prisma.booking.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      serviceId: haircut.id,
      staffId: staff.id,
      startsAt,
      endsAt,
      status: BookingStatus.CONFIRMED,
      notes: "Seeded demo appointment.",
    },
  });
  console.log(`Booking ready: ${booking.id} (${booking.startsAt.toISOString()})`);

  const payment = await prisma.payment.create({
    data: {
      tenantId: tenant.id,
      bookingId: booking.id,
      amountCents: haircut.priceCents,
      currency: tenant.currency,
      method: PaymentMethod.MOBILE_MONEY,
      status: PaymentStatus.PAID,
      externalRef: "demo-mm-0001",
    },
  });
  console.log(`Payment ready: ${payment.id} (${payment.amountCents} ${payment.currency})`);

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorId: owner.id,
      action: "seed.bootstrap",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: { services: services.length, bookings: 1, payments: 1 },
    },
  });
  console.log("Audit log entry recorded for seed.bootstrap");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
