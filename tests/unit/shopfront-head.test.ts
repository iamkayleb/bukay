import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getShopfrontTenant } = vi.hoisted(() => ({ getShopfrontTenant: vi.fn() }));

vi.mock("@/app/[slug]/data", () => ({ getShopfrontTenant }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));

import Head from "@/app/[slug]/head";

describe("shopfront head", () => {
  beforeEach(() => {
    getShopfrontTenant.mockResolvedValue({
      id: "tenant-id",
      name: "Head Test Salon",
      slug: "head-test-salon",
      currency: "NGN",
      services: [{ name: "Haircut" }],
    });
  });

  it("renders title, description, and Open Graph image metadata for a shopfront", async () => {
    const markup = renderToStaticMarkup(await Head({ params: { slug: "head-test-salon" } }));

    expect(markup).toContain("<title>Head Test Salon | Book with Bukay</title>");
    expect(markup).toContain(
      '<meta name="description" content="Book Haircut and more with Head Test Salon on Bukay."/>',
    );
    expect(markup).toContain(
      '<meta property="og:title" content="Head Test Salon | Book with Bukay"/>',
    );
    expect(markup).toContain(
      '<meta property="og:description" content="Book Haircut and more with Head Test Salon on Bukay."/>',
    );
    expect(markup).toContain('<meta property="og:image" content="http://localhost:3000/favicon.ico"/>');
  });
});
