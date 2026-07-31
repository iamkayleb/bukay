import { describe, expect, it } from "vitest";

import {
  clientListPath,
  clientTagPayload,
  validateClientTagForm,
} from "@/app/(app)/clients/clients-manager";

describe("clients manager tag helpers", () => {
  it("normalizes free-text tag names before sending them to the API", () => {
    expect(clientTagPayload({ name: "  VIP   follow-up  " })).toEqual({
      name: "VIP follow-up",
    });
  });

  it("returns inline validation errors for blank tag names", () => {
    expect(validateClientTagForm({ name: "   " })).toEqual({
      name: "Tag name is required",
    });
  });

  it("accepts valid reusable tag names", () => {
    expect(validateClientTagForm({ name: "Prefers mornings" })).toEqual({});
  });

  it("builds a normalized client list search URL", () => {
    expect(
      clientListPath({
        search: "  Ada   +234  ",
        selectedTagId: "tag-1",
      })
    ).toBe("/api/clients?pageSize=25&search=Ada+%2B234&tagId=tag-1");
  });
});
