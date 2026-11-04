import { describe, expect, it } from "vitest";

import {
  canonicalCustomerPhone,
  normalizeWhatsAppNumber,
  resolveTenantByNumber,
  type TenantByNumber,
} from "@/app/lib/whatsapp/routing";

const TENANTS: TenantByNumber[] = [
  { id: "tenant-ada", name: "Ada Salon", whatsappNumber: "2348099990001" },
  { id: "tenant-bayo", name: "Bayo Barbers", whatsappNumber: "2348088880002" },
];

function lookup(tenants: TenantByNumber[] = TENANTS) {
  return {
    findByWhatsAppNumber: async (number: string) =>
      tenants.find((tenant) => tenant.whatsappNumber === number) ?? null,
  };
}

describe("normalizeWhatsAppNumber", () => {
  it("strips formatting down to digits", () => {
    expect(normalizeWhatsAppNumber("+234 809 999 0001")).toBe("2348099990001");
    expect(normalizeWhatsAppNumber("")).toBeNull();
  });
});

describe("canonicalCustomerPhone", () => {
  it("normalizes Nigerian mobiles to E.164", () => {
    expect(canonicalCustomerPhone("2348012345678")).toBe("+2348012345678");
    expect(canonicalCustomerPhone("+2348012345678")).toBe("+2348012345678");
  });

  it("keeps a leading plus for non-Nigerian numbers", () => {
    expect(canonicalCustomerPhone("15551234567")).toBe("+15551234567");
  });
});

describe("resolveTenantByNumber", () => {
  it("resolves the tenant that owns the business number", async () => {
    const tenant = await resolveTenantByNumber(lookup(), "+234 809 999 0001");
    expect(tenant).toEqual(TENANTS[0]);
  });

  it("returns null when no tenant owns the number", async () => {
    const tenant = await resolveTenantByNumber(lookup(), "2348000000000");
    expect(tenant).toBeNull();
  });

  it("returns null for an empty number", async () => {
    const tenant = await resolveTenantByNumber(lookup(), "   ");
    expect(tenant).toBeNull();
  });
});
