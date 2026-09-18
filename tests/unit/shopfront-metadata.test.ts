import { afterEach, describe, expect, it } from "vitest";

import { getShopfrontMetadata, metadataBase } from "@/app/[slug]/metadata";

const originalRootHost = process.env.ROOT_HOST;

afterEach(() => {
  if (originalRootHost === undefined) {
    delete process.env.ROOT_HOST;
  } else {
    process.env.ROOT_HOST = originalRootHost;
  }
});

describe("shopfront metadata", () => {
  it("preserves an explicitly configured HTTP origin", () => {
    process.env.ROOT_HOST = "http://127.0.0.1:31474";

    const metadata = getShopfrontMetadata(
      {
        id: "tenant-id",
        name: "Test Salon",
        slug: "test-salon",
        currency: "NGN",
        services: [],
      },
      "test-salon",
    );

    expect(metadataBase().toString()).toBe("http://127.0.0.1:31474/");
    expect(metadata.pageUrl).toBe("http://127.0.0.1:31474/test-salon");
    expect(metadata.imageUrl).toBe("http://127.0.0.1:31474/test-salon/opengraph-image");
    expect(metadata.imageAlt).toBe("Test Salon booking page on Bukay");
  });

  it("uses HTTPS when ROOT_HOST is supplied as a hostname", () => {
    process.env.ROOT_HOST = "shops.bukay.test";

    expect(metadataBase().toString()).toBe("https://shops.bukay.test/");
  });

  it("encodes a shopfront slug when building canonical and Open Graph URLs", () => {
    process.env.ROOT_HOST = "https://shops.bukay.test";

    const metadata = getShopfrontMetadata(
      {
        id: "tenant-id",
        name: "Test Salon",
        slug: "test salon",
        currency: "NGN",
        services: [],
      },
      "test salon",
    );

    expect(metadata.pageUrl).toBe("https://shops.bukay.test/test%20salon");
    expect(metadata.imageUrl).toBe("https://shops.bukay.test/test%20salon/opengraph-image");
  });

  it("keeps required metadata non-empty when tenant display fields are blank", () => {
    const metadata = getShopfrontMetadata(
      {
        id: "tenant-id",
        name: "   ",
        slug: "empty-details",
        currency: "NGN",
        services: [
          {
            id: "service-id",
            name: " ",
            description: null,
            durationMinutes: 30,
            priceCents: 5000,
          },
        ],
      },
      "empty-details",
    );

    expect(metadata.title).toBe("Bukay Shopfront | Book with Bukay");
    expect(metadata.description).toBe("Book an appointment with Bukay Shopfront on Bukay.");
    expect(metadata.imageAlt).toBe("Bukay Shopfront booking page on Bukay");
    expect(metadata.imageUrl).not.toBe("");
  });
});
