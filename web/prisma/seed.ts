import { PrismaClient } from "../app/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-salon" },
    update: {},
    create: {
      name: "Demo Salon",
      slug: "demo-salon",
    },
  });

  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  const serviceData = [
    {
      id: "seed-service-haircut",
      tenantId: tenant.id,
      name: "Haircut",
      description: "Classic haircut and style",
      durationMinutes: 30,
      price: "35.00",
    },
    {
      id: "seed-service-color",
      tenantId: tenant.id,
      name: "Hair Color",
      description: "Full color treatment",
      durationMinutes: 90,
      price: "95.00",
    },
    {
      id: "seed-service-blowout",
      tenantId: tenant.id,
      name: "Blowout",
      description: "Wash and blowdry",
      durationMinutes: 45,
      price: "50.00",
    },
  ];

  for (const data of serviceData) {
    const service = await prisma.service.upsert({
      where: { id: data.id },
      update: {},
      create: data,
    });
    console.log(`  Service: ${service.name} ($${service.price})`);
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
