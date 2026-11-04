import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: state.findUnique,
    },
  },
}));

import SettingsPage from "@/app/(app)/settings/page";

beforeEach(() => {
  state.findUnique.mockReset();
});

describe("SettingsPage booking QR download", () => {
  it("renders a download control for the tenant booking QR", async () => {
    state.findUnique.mockResolvedValue({
      remindersEnabled: true,
      slug: "ada-salon",
    });

    const page = await SettingsPage({ searchParams: { tenantId: "tenant-1" } });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Download booking QR");
    expect(html).toContain('href="/api/qr/ada-salon"');
    expect(html).toContain("ada-salon-booking-qr.pdf");
    expect(html).toContain("/ada-salon");
  });

  it("disables the download control when the tenant has no slug yet", async () => {
    state.findUnique.mockResolvedValue(null);

    const page = await SettingsPage({ searchParams: { tenantId: "missing" } });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Download booking QR");
    expect(html).toContain("disabled");
    expect(html).not.toContain('href="/api/qr/');
  });
});
