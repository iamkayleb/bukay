import { notFound } from "next/navigation";

import { getShopfrontTenant } from "./data";
import { getShopfrontMetadata } from "./metadata";

type ShopfrontHeadProps = {
  params: { slug: string };
};

export default async function Head({ params }: ShopfrontHeadProps) {
  const tenant = await getShopfrontTenant(params.slug);

  // Keep the metadata route aligned with the page route: unknown shopfronts
  // must resolve to Next's 404 response rather than publishing fallback tags.
  if (!tenant) {
    notFound();
  }

  const metadata = getShopfrontMetadata(tenant, params.slug);

  return (
    <>
      <title>{metadata.title}</title>
      <meta name="description" content={metadata.description} />
      <link rel="canonical" href={metadata.pageUrl} />
      <meta property="og:title" content={metadata.title} />
      <meta property="og:description" content={metadata.description} />
      <meta property="og:url" content={metadata.pageUrl} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Bukay" />
      <meta property="og:image" content={metadata.imageUrl} />
      <meta property="og:image:alt" content={metadata.imageAlt} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={metadata.title} />
      <meta name="twitter:description" content={metadata.description} />
      <meta name="twitter:image" content={metadata.imageUrl} />
    </>
  );
}
