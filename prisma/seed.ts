// Seed script: inserts one demo tenant and three sample services.
// Usage: `prisma db seed` (configured in package.json).
//
// Idempotent: re-running the seed updates the demo tenant in place rather
// than creating duplicates, so it is safe to run after `prisma migrate dev`.

import { PrismaClient, UserRole, DayOfWeek } from "@prisma/client";

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

  // Wipe and reinsert demo services so the count stays at three on re-seed.
  await prisma.service.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.service.createMany({
    data: DEMO_SERVICES.map((s) => ({ ...s, tenantId: tenant.id })),
  });

  console.log(`Inserted ${DEMO_SERVICES.length} services for ${tenant.slug}`);

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
