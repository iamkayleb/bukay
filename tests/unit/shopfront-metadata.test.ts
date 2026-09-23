import { afterEach, describe, expect, it } from "vitest";

import {
  getShopfrontMetadata,
  metadataBase,
  shopfrontDisplayName,
} from "@/app/[slug]/metadata";

const originalRootHost = process.env.ROOT_HOST;

afterEach(() => {
  if (originalRootHost === undefined) {
    delete process.env.ROOT_HOST;
  } else {
    process.env.ROOT_HOST = originalRootHost;
  }
});

describe("shopfront metadata", () => {
  it("uses the crawlable shopfront fallback for invisible display names", () => {
    expect(shopfrontDisplayName("\u200B\u200C\u200D\uFEFF")).toBe("Bukay Shopfront");
  });

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

  it("normalizes ROOT_HOST to a public origin without user info", () => {
    process.env.ROOT_HOST = "https://shops.bukay.test/deployment-preview";

    expect(metadataBase().toString()).toBe("https://shops.bukay.test/");

    process.env.ROOT_HOST = "https://deploy-user@shops.bukay.test";

    expect(metadataBase().toString()).toBe("http://localhost:3000/");
  });

  it("falls back to the local origin when ROOT_HOST is malformed", () => {
    process.env.ROOT_HOST = "http://[invalid-host";

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

    expect(metadataBase().toString()).toBe("http://localhost:3000/");
    expect(metadata.title).not.toBe("");
    expect(metadata.description).not.toBe("");
    expect(metadata.imageUrl).toBe("http://localhost:3000/test-salon/opengraph-image");
  });

  it("falls back to the local origin when ROOT_HOST uses a non-web URL scheme", () => {
    process.env.ROOT_HOST = "ftp://shops.bukay.test";

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

    expect(metadataBase().toString()).toBe("http://localhost:3000/");
    expect(metadata.pageUrl).toBe("http://localhost:3000/test-salon");
    expect(metadata.imageUrl).toBe("http://localhost:3000/test-salon/opengraph-image");
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

  it("uses crawlable fallbacks when tenant display fields contain only invisible characters", () => {
    const metadata = getShopfrontMetadata(
      {
        id: "tenant-id",
        name: "\u200B\u200C\u200D\uFEFF",
        slug: "invisible-details",
        currency: "NGN",
        services: [
          {
            id: "service-id",
            name: "\u0000\u2060\u200E",
            description: null,
            durationMinutes: 30,
            priceCents: 5000,
          },
        ],
      },
      "invisible-details",
    );

    expect(metadata.title).toBe("Bukay Shopfront | Book with Bukay");
    expect(metadata.description).toBe("Book an appointment with Bukay Shopfront on Bukay.");
    expect(metadata.imageAlt).toBe("Bukay Shopfront booking page on Bukay");
  });

  it("uses crawlable fallbacks when tenant display fields contain only interlinear formatting controls", () => {
    const metadata = getShopfrontMetadata(
      {
        id: "tenant-id",
        name: "\uFFF9\uFFFA\uFFFB",
        slug: "interlinear-details",
        currency: "NGN",
        services: [
          {
            id: "service-id",
            name: "\uFFF9\uFFFA\uFFFB",
            description: null,
            durationMinutes: 30,
            priceCents: 5000,
          },
        ],
      },
      "interlinear-details",
    );

    expect(metadata.title).toBe("Bukay Shopfront | Book with Bukay");
    expect(metadata.description).toBe("Book an appointment with Bukay Shopfront on Bukay.");
    expect(metadata.imageAlt).toBe("Bukay Shopfront booking page on Bukay");
  });

  it("uses crawlable fallbacks when tenant display fields contain only Unicode tags", () => {
    const metadata = getShopfrontMetadata(
      {
        id: "tenant-id",
        name: "\u{E0001}\u{E0020}",
        slug: "tag-only-details",
        currency: "NGN",
        services: [
          {
            id: "service-id",
            name: "\u{E0001}\u{E007F}",
            description: null,
            durationMinutes: 30,
            priceCents: 5000,
          },
        ],
      },
      "tag-only-details",
    );

    expect(metadata.title).toBe("Bukay Shopfront | Book with Bukay");
    expect(metadata.description).toBe("Book an appointment with Bukay Shopfront on Bukay.");
    expect(metadata.imageAlt).toBe("Bukay Shopfront booking page on Bukay");
  });

  it("uses distinct service names in the shopfront description", () => {
    const metadata = getShopfrontMetadata(
      {
        id: "tenant-id",
        name: "Distinct Services Salon",
        slug: "distinct-services",
        currency: "NGN",
        services: [
          {
            id: "service-one",
            name: " Haircut ",
            description: null,
            durationMinutes: 30,
            priceCents: 5000,
          },
          {
            id: "service-two",
            name: "Haircut",
            description: null,
            durationMinutes: 45,
            priceCents: 6500,
          },
          {
            id: "service-three",
            name: "Colour",
            description: null,
            durationMinutes: 60,
            priceCents: 8000,
          },
          {
            id: "service-four",
            name: "Styling",
            description: null,
            durationMinutes: 30,
            priceCents: 4000,
          },
        ],
      },
      "distinct-services",
    );

    expect(metadata.description).toBe(
      "Book Haircut, Colour, Styling and more with Distinct Services Salon on Bukay.",
    );
  });

  it("does not repeat service names that only differ by capitalization", () => {
    const metadata = getShopfrontMetadata(
      {
        id: "tenant-id",
        name: "Case Insensitive Salon",
        slug: "case-insensitive-services",
        currency: "NGN",
        services: [
          {
            id: "service-one",
            name: "Haircut",
            description: null,
            durationMinutes: 30,
            priceCents: 5000,
          },
          {
            id: "service-two",
            name: "HAIRCUT",
            description: null,
            durationMinutes: 45,
            priceCents: 6500,
          },
          {
            id: "service-three",
            name: "Colour",
            description: null,
            durationMinutes: 60,
            priceCents: 8000,
          },
        ],
      },
      "case-insensitive-services",
    );

    expect(metadata.description).toBe(
      "Book Haircut, Colour and more with Case Insensitive Salon on Bukay.",
    );
  });
});
