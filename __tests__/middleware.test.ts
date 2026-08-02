import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { PUBLIC_TENANT_SLUG_HEADER } from "@/app/lib/resolve-tenant";
import { middleware } from "@/middleware";

const forwardedSlugHeader = `x-middleware-request-${PUBLIC_TENANT_SLUG_HEADER}`;

describe("middleware", () => {
  it("forwards the public tenant slug resolved from the hostname", () => {
    const response = middleware(
      new NextRequest("https://fresh-cuts.bukay.app/", {
        headers: { host: "fresh-cuts.bukay.app" },
      })
    );

    expect(response.headers.get(forwardedSlugHeader)).toBe("fresh-cuts");
    expect(response.headers.get("x-middleware-override-headers")).toContain(
      PUBLIC_TENANT_SLUG_HEADER
    );
  });

  it("clears spoofed public tenant slug headers on reserved hostnames", () => {
    const request = new NextRequest("https://www.bukay.app/", {
      headers: {
        host: "www.bukay.app",
        [PUBLIC_TENANT_SLUG_HEADER]: "spoofed",
      },
    });

    const response = middleware(request);

    expect(response.headers.get(forwardedSlugHeader)).toBeNull();
    expect(response.headers.get("x-middleware-override-headers")).not.toContain(
      PUBLIC_TENANT_SLUG_HEADER
    );
  });
});
