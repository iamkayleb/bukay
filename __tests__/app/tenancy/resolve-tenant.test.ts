import { describe, expect, it } from "vitest";
import { resolveTenant, type TenantRequest } from "@/app/tenancy/resolve-tenant";

function request(host: string, session?: TenantRequest["session"]): TenantRequest {
  return {
    headers: new Headers({ host }),
    session,
  };
}

describe("resolveTenant", () => {
  it("prefers the authenticated session tenant over the subdomain", () => {
    expect(resolveTenant(request("other.example.com", { tenantId: " tenant-123 " }))).toEqual({
      source: "session",
      tenantId: "tenant-123",
    });
  });

  it("resolves and normalizes a tenant subdomain", () => {
    expect(resolveTenant(request("Acme.EXAMPLE.com:3000"))).toEqual({
      source: "subdomain",
      slug: "acme",
    });
  });

  it("supports tenant subdomains on localhost", () => {
    expect(resolveTenant(request("demo.localhost:3000"))).toEqual({
      source: "subdomain",
      slug: "demo",
    });
  });

  it.each([
    "example.com",
    "localhost:3000",
    "www.example.com",
    "127.0.0.1:3000",
    "[::1]:3000",
    "-invalid.example.com",
    "invalid_.example.com",
  ])("does not resolve an apex, reserved, IP, or invalid host: %s", (host) => {
    expect(resolveTenant(request(host))).toBeNull();
  });

  it("falls back to the request URL when there is no Next.js hostname", () => {
    expect(
      resolveTenant({
        headers: new Headers(),
        url: "https://studio.example.com/bookings",
      })
    ).toEqual({
      source: "subdomain",
      slug: "studio",
    });
  });

  it("ignores empty session tenant IDs", () => {
    expect(resolveTenant(request("demo.example.com", { tenantId: "  " }))).toEqual({
      source: "subdomain",
      slug: "demo",
    });
  });
});
