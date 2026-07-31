import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ClientsPage from "@/app/(app)/clients/page";

describe("Clients page", () => {
  it("renders as a server placeholder until tenant-aware client data loading exists", () => {
    const html = renderToStaticMarkup(<ClientsPage />);

    expect(html).toContain("Clients");
    expect(html).toContain("Your client roster, notes, and history will be available");
    expect(html).toContain("No clients added yet.");
  });

  it("does not fetch clients from the browser without explicit tenant handling", () => {
    const source = readFileSync(path.join(process.cwd(), "app/(app)/clients/page.tsx"), "utf8");

    expect(source).not.toMatch(/^["']use client["'];?/m);
    expect(source).not.toContain("/api/clients");
  });
});
