import { getShopfrontTenant } from "./data";

type ShopfrontHeadProps = {
  params: { slug: string };
};

function metadataBase(): URL {
  const rootHost = process.env.ROOT_HOST?.trim();
  return new URL(rootHost ? `https://${rootHost}` : "http://localhost:3000");
}

export default async function Head({ params }: ShopfrontHeadProps) {
  const tenant = await getShopfrontTenant(params.slug);

  if (!tenant) {
    return (
      <>
        <title>Shop not found | Bukay</title>
        <meta name="description" content="The requested Bukay shopfront could not be found." />
      </>
    );
  }

  const title = `${tenant.name} | Book with Bukay`;
  const description =
    tenant.services.length > 0
      ? `Book ${tenant.services
          .slice(0, 3)
          .map((service) => service.name)
          .join(", ")} and more with ${tenant.name} on Bukay.`
      : `Book an appointment with ${tenant.name} on Bukay.`;
  const base = metadataBase();
  const pageUrl = new URL(`/${tenant.slug}`, base).toString();
  const imageUrl = new URL("/favicon.ico", base).toString();

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={pageUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Bukay" />
      <meta property="og:image" content={imageUrl} />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
    </>
  );
}
