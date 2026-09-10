// Top-level app/ route segments that are NOT the merchant shopfront
// ([slug]). Keep this list in sync with app/*/page.tsx and the routes
// grouped under app/(app)/ so the shopfront cache header below doesn't leak
// onto them.
const RESERVED_TOP_LEVEL_ROUTES = [
  "api",
  "login",
  "calendar",
  "clients",
  "services",
  "settings",
  "today",
  "favicon.ico",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: `/:slug((?!${RESERVED_TOP_LEVEL_ROUTES.join("|")})[^/]+)`,
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=300",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
