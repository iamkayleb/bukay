import { describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/app/db/prisma", () => ({
  prisma: { tenant: { findUnique } },
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

import ShopfrontPage from "@/app/[slug]/page";

function textFromNode(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";

  const children = (node as { props: { children?: unknown } }).props.children;
  return Array.isArray(children) ? children.map(textFromNode).join("") : textFromNode(children);
}

describe("shopfront page", () => {
  it("loads a tenant and renders its public booking details", async () => {
    findUnique.mockResolvedValue({
      name: "Bukay Demo Salon",
      services: [
        {
          id: "service-1",
          name: "Classic Haircut",
          description: "Traditional cut and style.",
          durationMinutes: 30,
          priceCents: 5000,
          currency: "NGN",
        },
      ],
      businessHours: [
        { id: "hours-1", dayOfWeek: 1, opensAt: "09:00", closesAt: "18:00", isClosed: false },
      ],
    });

    const page = await ShopfrontPage({ params: { slug: "demo" } });

    expect(findUnique).toHaveBeenCalledWith({
      where: { slug: "demo" },
      include: {
        services: { where: { active: true }, orderBy: { name: "asc" } },
        businessHours: { orderBy: { dayOfWeek: "asc" } },
      },
    });
    expect(textFromNode(page)).toContain("Bukay Demo Salon");
    expect(textFromNode(page)).toContain("Classic Haircut");
    expect(textFromNode(page)).toContain("Monday");
  });
});
