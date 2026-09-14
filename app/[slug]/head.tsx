const SHOPFRONT_TITLE = "Book appointments online | Bukay";
const SHOPFRONT_DESCRIPTION =
  "Browse services, choose a time, and book your next appointment with Bukay.";
const SHOPFRONT_IMAGE = "/favicon.ico";

/**
 * Metadata for public, slug-based shopfronts.
 *
 * Keep this in the route segment so a shopfront's document head does not rely
 * on the generic application metadata defined by the root layout.
 */
export default function Head() {
  return (
    <>
      <title>{SHOPFRONT_TITLE}</title>
      <meta name="description" content={SHOPFRONT_DESCRIPTION} />
      <meta property="og:title" content={SHOPFRONT_TITLE} />
      <meta property="og:description" content={SHOPFRONT_DESCRIPTION} />
      <meta property="og:image" content={SHOPFRONT_IMAGE} />
      <meta property="og:type" content="website" />
    </>
  );
}
