import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Demo Salon",
      slug: "demo",
    },
  });

  const services = [
    {
      name: "Haircut",
      description: "Classic haircut and style",
      durationMinutes: 30,
      price: 35.0,
    },
    {
      name: "Hair Color",
      description: "Full hair coloring service",
      durationMinutes: 90,
      price: 120.0,
    },
    {
      name: "Blow Dry",
      description: "Wash and blow dry styling",
      durationMinutes: 45,
      price: 55.0,
    },
  ];

  for (const svc of services) {
    await prisma.service.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: svc.name } },
      update: {},
      create: { tenantId: tenant.id, ...svc },
    });
  }

  console.log(`Seeded tenant "${tenant.name}" (${tenant.slug}) with ${services.length} services`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
