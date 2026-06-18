import { describe, it, expect } from "vitest";
import { extractSubdomain, resolveTenant } from "@/app/lib/resolve-tenant";

function makeReq(opts: {
  headers?: Record<string, string>;
  session?: { tenantId?: string; tenantSlug?: string } | null;
}) {
  const h = new Map(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: { get: (n: string) => h.get(n.toLowerCase()) ?? null },
    session: opts.session ?? null,
  };
}

describe("extractSubdomain", () => {
  it("returns the first label for typical 3-part hostnames", () => {
    expect(extractSubdomain("acme.example.com")).toBe("acme");
  });

  it("returns undefined for bare apex hostnames", () => {
    expect(extractSubdomain("example.com")).toBeUndefined();
  });

  it("ignores reserved subdomains", () => {
    expect(extractSubdomain("www.example.com")).toBeUndefined();
    expect(extractSubdomain("api.example.com")).toBeUndefined();
  });

  it("strips port numbers", () => {
    expect(extractSubdomain("acme.example.com:3000")).toBe("acme");
  });

  it("is case-insensitive", () => {
    expect(extractSubdomain("ACME.Example.COM")).toBe("acme");
  });
});

describe("resolveTenant", () => {
  it("prefers session tenantId when present", () => {
    const result = resolveTenant(
      makeReq({
        headers: { host: "acme.example.com" },
        session: { tenantId: "t-from-session", tenantSlug: "acme" },
      }),
    );
    expect(result).toEqual({
      tenantId: "t-from-session",
      tenantSlug: "acme",
      source: "session",
    });
  });

  it("falls back to subdomain slug when there is no session", () => {
    const result = resolveTenant(makeReq({ headers: { host: "acme.example.com" } }));
    expect(result).toEqual({ tenantSlug: "acme", source: "subdomain" });
  });

  it("honours x-tenant-id header before subdomain", () => {
    const result = resolveTenant(
      makeReq({ headers: { host: "acme.example.com", "x-tenant-id": "t-header" } }),
    );
    expect(result.tenantId).toBe("t-header");
    expect(result.source).toBe("header");
  });

  it("returns 'none' when nothing identifies a tenant", () => {
    const result = resolveTenant(makeReq({ headers: { host: "example.com" } }));
    expect(result).toEqual({ source: "none" });
  });
});
