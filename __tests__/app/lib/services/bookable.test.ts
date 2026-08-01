import { describe, expect, it, vi } from "vitest";

import { BOOKABLE_SERVICES_PATH, fetchBookableServices } from "@/app/lib/services/bookable";

type FetchArgs = Parameters<typeof fetch>;

function mockFetch(
  response: { ok?: boolean; status?: number; body: unknown }
): { fetch: (...args: FetchArgs) => Promise<Response>; calls: FetchArgs[] } {
  const calls: FetchArgs[] = [];
  const fetchImpl = vi.fn(async (...args: FetchArgs) => {
    calls.push(args);
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.body,
    } as Response;
  });
  return { fetch: fetchImpl as unknown as typeof fetch, calls };
}

describe("fetchBookableServices", () => {
  it("always requests /api/services with ?active=true", async () => {
    const { fetch: fetchImpl, calls } = mockFetch({
      body: { ok: true, services: [] },
    });

    await fetchBookableServices(fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(BOOKABLE_SERVICES_PATH);
    expect(BOOKABLE_SERVICES_PATH).toContain("active=true");
  });

  it("returns only active services even if the API misbehaves and includes archived rows", async () => {
    const { fetch: fetchImpl } = mockFetch({
      body: {
        ok: true,
        services: [
          {
            id: "s-1",
            tenantId: "t-1",
            name: "Haircut",
            durationMinutes: 30,
            priceKobo: 5000,
            bufferMinutes: 0,
            active: true,
          },
          {
            id: "s-2",
            tenantId: "t-1",
            name: "Retired",
            durationMinutes: 30,
            priceKobo: 5000,
            bufferMinutes: 0,
            active: false,
          },
        ],
      },
    });

    const result = await fetchBookableServices(fetchImpl);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "s-1", active: true });
  });

  it("throws when the response is not ok", async () => {
    const { fetch: fetchImpl } = mockFetch({
      ok: false,
      status: 500,
      body: { ok: false, error: "boom" },
    });

    await expect(fetchBookableServices(fetchImpl)).rejects.toThrow("boom");
  });

  it("throws when the body has no services array", async () => {
    const { fetch: fetchImpl } = mockFetch({
      body: { ok: true },
    });

    await expect(fetchBookableServices(fetchImpl)).rejects.toThrow(
      "Unable to load bookable services"
    );
  });
});
