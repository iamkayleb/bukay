import { notFound } from "next/navigation";

import { prisma } from "@/app/db/prisma";
import { PublicBookingFlow, type PublicBookingService } from "./public-booking-flow";

type PublicBookingPageProps = {
  params: {
    slug: string;
  };
};

export default async function PublicBookingPage({ params }: PublicBookingPageProps) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.slug },
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
          durationMinutes: true,
          priceCents: true,
          currency: true,
        },
      },
    },
  });

  if (!tenant) {
    notFound();
  }

  const services: PublicBookingService[] = tenant.services.map((service) => ({
    id: service.id,
    name: service.name,
    durationMinutes: service.durationMinutes,
    priceCents: service.priceCents,
    currency: service.currency || tenant.currency,
  }));

  return (
    <PublicBookingFlow services={services} tenantName={tenant.name} tenantSlug={tenant.slug} />
  );
}
