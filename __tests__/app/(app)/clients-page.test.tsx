import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ClientsPage from "@/app/(app)/clients/page";

describe("Clients page", () => {
  it("renders the client manager shell", () => {
    const html = renderToStaticMarkup(<ClientsPage />);

    expect(html).toContain("Clients");
    expect(html).toContain("Client profiles");
    expect(html).toContain("Loading clients...");
    expect(html).toContain("Manage tags");
  });

  it("does not pass tenant context explicitly from the browser fetch", () => {
    const source = readFileSync(path.join(process.cwd(), "app/(app)/clients/page.tsx"), "utf8");

    expect(source).not.toContain("/api/clients");
    expect(source).not.toContain("x-tenant-id");
  });
});
