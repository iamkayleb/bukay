import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildClientPageHref,
  buildClientWhere,
  normalizeClientPage,
  normalizeClientSearch,
  normalizeClientTag,
} from "@/app/(app)/clients/client-list";
import ClientsPage from "@/app/(app)/clients/page";

describe("client list helpers", () => {
  it("normalizes search and page parameters", () => {
    expect(normalizeClientSearch("  Ada   Okafor  ")).toBe("Ada Okafor");
    expect(normalizeClientSearch([" +23480 ", "ignored"])).toBe("+23480");
    expect(normalizeClientTag(" regular  client ")).toBe("regular client");
    expect(normalizeClientPage("3")).toBe(3);
    expect(normalizeClientPage("0")).toBe(1);
    expect(normalizeClientPage("bad")).toBe(1);
  });

  it("builds tenant-scoped name and phone search filters", () => {
    expect(buildClientWhere("tenant-1", "Ada", "regular")).toEqual({
      tenantId: "tenant-1",
      OR: [{ name: { contains: "Ada" } }, { phone: { contains: "Ada" } }],
      tags: {
        some: {
          tenantId: "tenant-1",
          tag: {
            tenantId: "tenant-1",
            name: "regular",
          },
        },
      },
    });
  });

  it("keeps pagination links stable across searches", () => {
    expect(buildClientPageHref(1, "")).toBe("/clients");
    expect(buildClientPageHref(2, "")).toBe("/clients?page=2");
    expect(buildClientPageHref(3, "+23480")).toBe("/clients?q=%2B23480&page=3");
    expect(buildClientPageHref(2, "Ada", "regular")).toBe("/clients?q=Ada&tag=regular&page=2");
  });
});

describe("/clients page", () => {
  it("renders the client-side clients manager shell", () => {
    const element = ClientsPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Client profiles");
    expect(html).toContain("Loading clients...");
    expect(html).toContain("Manage tags");
  });
});
