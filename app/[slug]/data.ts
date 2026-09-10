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
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      currency: true,
      active: true,
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

  if (!tenant || !tenant.active) {
    return null;
  }

  const { active: _active, ...shopfrontTenant } = tenant;
  return shopfrontTenant;
}
