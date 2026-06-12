import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-salon" },
    update: {},
    create: {
      name: "Demo Salon",
      slug: "demo-salon",
      timezone: "Africa/Lagos",
      currency: "NGN",
      users: {
        create: {
          email: "owner@demo-salon.test",
          name: "Demo Owner",
          role: "owner"
        }
      },
      staff: {
        create: {
          name: "Amina Bello",
          email: "amina@demo-salon.test",
          phone: "+2348000000001"
        }
      },
      businessHours: {
        create: [
          { dayOfWeek: 1, opensAt: "09:00", closesAt: "17:00" },
          { dayOfWeek: 2, opensAt: "09:00", closesAt: "17:00" },
          { dayOfWeek: 3, opensAt: "09:00", closesAt: "17:00" },
          { dayOfWeek: 4, opensAt: "09:00", closesAt: "17:00" },
          { dayOfWeek: 5, opensAt: "09:00", closesAt: "17:00" },
          { dayOfWeek: 6, opensAt: "10:00", closesAt: "15:00" },
          { dayOfWeek: 0, opensAt: "00:00", closesAt: "00:00", isClosed: true }
        ]
      }
    }
  });

  const services = [
    {
      name: "Hair Braiding",
      description: "Classic protective styling appointment.",
      durationMinutes: 120,
      priceCents: 1500000
    },
    {
      name: "Barber Cut",
      description: "Precision haircut and line-up.",
      durationMinutes: 45,
      priceCents: 500000
    },
    {
      name: "Makeup Session",
      description: "Event-ready makeup service.",
      durationMinutes: 90,
      priceCents: 2000000
    }
  ];

  for (const service of services) {
    await prisma.service.upsert({
      where: {
        tenantId_name: {
          tenantId: tenant.id,
          name: service.name
        }
      },
      update: {
        description: service.description,
        durationMinutes: service.durationMinutes,
        priceCents: service.priceCents,
        currency: tenant.currency,
        active: true
      },
      create: {
        tenantId: tenant.id,
        currency: tenant.currency,
        ...service
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
