import { prisma } from "@/app/db/prisma";

type ShopfrontHeadProps = {
  params: { slug: string };
};

export default async function ShopfrontHead({ params }: ShopfrontHeadProps) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.slug },
    select: { name: true },
  });

  const title = tenant ? `${tenant.name} | Book online` : "Shopfront | Bukay";
  const description = tenant
    ? `Book an appointment with ${tenant.name} online.`
    : "Book an appointment online with Bukay.";
  const canonicalPath = `/${encodeURIComponent(params.slug)}`;

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={tenant ? "index, follow" : "noindex, nofollow"} />
      <link rel="canonical" href={canonicalPath} />
    </>
  );
}
