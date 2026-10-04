import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("next/headers", () => ({ headers: () => ({ get: () => null }) }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/app/lib/resolve-tenant", () => ({
  resolveTenant: () => ({ tenantSlug: "demo", source: "subdomain" }),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: state.findUnique,
      update: vi.fn(),
    },
  },
}));

import SettingsPage from "@/app/(app)/settings/page";

beforeEach(() => {
  state.findUnique.mockReset();
  state.findUnique.mockResolvedValue({
    id: "tenant-1",
    name: "Demo Salon",
    slug: "demo",
    remindersEnabled: true,
  });
});

describe("SettingsPage", () => {
  it("links the owner to their downloadable booking QR PDF", async () => {
    const html = renderToStaticMarkup(await SettingsPage());

    expect(html).toContain("Download booking QR PDF");
    expect(html).toContain('href="/api/qr/demo"');
    expect(html).toContain('download="demo-booking-qr.pdf"');
  });
});
