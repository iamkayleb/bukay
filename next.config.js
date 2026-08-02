/** @type {import('next').NextConfig} */
const tenantLandingCacheControl = "public, s-maxage=300, stale-while-revalidate=3600";

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source:
          "/:slug((?!(?:api|_next|login|today|calendar|clients|services|settings|favicon\\.ico)$)[^/]+)",
        headers: [
          {
            key: "Cache-Control",
            value: tenantLandingCacheControl,
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
