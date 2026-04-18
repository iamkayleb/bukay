import { describe, it, expect, vi } from "vitest";

const mockJson = vi.fn((data: unknown) => ({ json: data, status: 200 }));
vi.mock("next/server", () => ({
  NextResponse: { json: mockJson },
}));

const { GET } = await import("../route");

describe("GET /api/health", () => {
  it("returns ok: true with version string", async () => {
    await GET();
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, version: expect.any(String) })
    );
  });
});
