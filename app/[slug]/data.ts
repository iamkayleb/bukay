import { prisma } from "@/app/db/prisma";

export type ShopfrontService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
};

export type ShopfrontTenant = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  services: ShopfrontService[];
};

export async function getShopfrontTenant(slug: string): Promise<ShopfrontTenant | null> {
  return prisma.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      currency: true,
      services: {
        where: { active: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          durationMinutes: true,
          priceCents: true,
        },
      },
    },
  });
}
