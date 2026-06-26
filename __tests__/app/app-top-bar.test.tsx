import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppTopBar, requestLogout } from "@/app/(app)/app/_components/top-bar";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("AppTopBar", () => {
  it("renders the tenant name and signed-in user menu trigger", () => {
    const html = renderToStaticMarkup(
      <AppTopBar tenantName="Studio Kay" userPhone="+2348031234567" />
    );

    expect(html).toContain("Studio Kay");
    expect(html).toContain("Workspace");
    expect(html).toContain("+2348031234567");
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
  });
});

describe("requestLogout", () => {
  it("posts to the logout endpoint", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));

    await requestLogout(fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
  });

  it("raises when the logout endpoint fails", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));

    await expect(requestLogout(fetchImpl)).rejects.toThrow("Logout request failed");
  });
});
